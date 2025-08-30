// AI: easy (random legal), medium (heuristici), hard (sampling cu scor rapid)
export class AI {
    constructor(physics, rules, ui) { this.p = physics; this.r = rules; this.ui = ui; }

    shoot(player, level = 'easy') {
        // Ball-in-hand? plasează bila albă într-o zonă liberă
        if (this.r.ballInHand) {
            const x = this.p.PLAY.x + this.p.PLAY.w * 0.25;
            const y = this.p.PLAY.y + this.p.PLAY.h * 0.5 + (Math.random() - 0.5) * 40;
            this.p.placeCueAt(x, y);
            this.r.ballInHand = false;
        }

        const targetSuit = this.r.groups ? this.r.groupsFor(player) : null;
        const aim = (level === 'easy') ? this.pickRandom(targetSuit)
            : (level === 'medium') ? this.pickHeuristic(targetSuit)
                : this.pickSampled(targetSuit);

        if (!aim) { this.p.strikeCue(40, 0, 0.3); return; }
        const { dx, dy, power } = aim;
        this.p.strikeCue(dx, dy, power);
    }

    aliveObjects() {
        return this.p.balls.filter(b => b.alive && !b.isCue && b.number !== 8);
    }
    pockets() { return this.p.pockets; }

    // Vector țintă: din bila albă spre punctul de contact cu bila obiect, aliniat către buzunar
    vectorToPot(cue, obj, pocket) {
        const R = this.p.R;
        const dirToPocket = norm({ x: pocket.x - obj.x, y: pocket.y - obj.y });
        const contactPoint = { x: obj.x - dirToPocket.x * R * 2, y: obj.y - dirToPocket.y * R * 2 };
        return { x: contactPoint.x - cue.x, y: contactPoint.y - cue.y };
    }

    // --- Level EASY: alege un obiect din suit-ul legal (sau orice dacă masa e open) + un buzunar random
    pickRandom(targetSuit) {
        const cue = this.p.balls.find(b => b.isCue);
        const objs = this.aliveObjects().filter(b => {
            if (!this.r.groups) return true;
            const suit = b.stripe ? 'stripes' : 'solids';
            return suit === targetSuit;
        });
        if (objs.length === 0) return null;
        const obj = objs[Math.floor(Math.random() * objs.length)];
        const pocket = this.pockets()[Math.floor(Math.random() * this.pockets().length)];
        const aim = this.vectorToPot(cue, obj, pocket);
        return { dx: aim.x, dy: aim.y, power: 0.65 };
    }

    // --- Level MEDIUM: scor euristic (linie liberă, unghi spre buzunar, distanță rezonabilă)
    pickHeuristic(targetSuit) {
        const cue = this.p.balls.find(b => b.isCue);
        const candidates = [];
        for (const obj of this.aliveObjects()) {
            if (this.r.groups) {
                const suit = obj.stripe ? 'stripes' : 'solids';
                if (suit !== targetSuit) continue;
            }
            for (const pocket of this.pockets()) {
                const aim = this.vectorToPot(cue, obj, pocket);
                const dist = Math.hypot(aim.x, aim.y);
                const lineClear = this.lineClear(cue, obj); // nu e blocat direct (aprox)
                const angleGood = this.angleToPocket(obj, pocket); // 0..1 (mai mare = mai bine)
                const score = (lineClear ? 1 : 0) * 1.0 + angleGood * 0.8 + (1 / Math.max(1, dist)) * 0.5;
                candidates.push({ dx: aim.x, dy: aim.y, power: 0.72, score });
            }
        }
        candidates.sort((a, b) => b.score - a.score);
        return candidates[0] || null;
    }

    // --- Level HARD: pornește de la heuristic și face sampling cu mici perturbații + scor rapid
    pickSampled(targetSuit) {
        const base = this.pickHeuristic(targetSuit);
        if (!base) return null;
        let best = base, bestScore = -1;
        for (let i = 0; i < 12; i++) {
            const dx = base.dx * (1 + (Math.random() - 0.5) * 0.15);
            const dy = base.dy * (1 + (Math.random() - 0.5) * 0.15);
            const power = Math.min(0.85, base.power * (1 + (Math.random() - 0.5) * 0.2));
            const score = this.quickScore(dx, dy, power);
            if (score > bestScore) { bestScore = score; best = { dx, dy, power }; }
        }
        return best;
    }

    // scor rapid: favorizează coliziune devreme + apropiere de obiecte după un mic pas
    quickScore(dx, dy, power) {
        const cue = this.p.balls.find(b => b.isCue);
        const L = Math.hypot(dx, dy) || 1;
        const nx = cue.x - (dx / L) * 20;
        const ny = cue.y - (dy / L) * 20;
        let minD = Infinity;
        for (const o of this.aliveObjects()) {
            const d = Math.hypot(o.x - nx, o.y - ny);
            if (d < minD) minD = d;
        }
        return 1 / Math.max(1, minD);
    }

    // 0..1: cât de „bun” e unghiul obiect→buzunar (preferăm orientare clară către buzunar)
    angleToPocket(obj, pocket) {
        const v = norm({ x: pocket.x - obj.x, y: pocket.y - obj.y });
        // euristică simplă (evită paralelele perfecte cu mantalele)
        return (Math.abs(v.x) * 0.5 + Math.abs(v.y) * 0.5);
    }

    // verifică dacă drumul cue→obj e relativ liber (aprox.)
    lineClear(cue, obj) {
        for (const b of this.p.balls) {
            if (!b.alive || b === cue || b === obj) continue;
            const d = pointToSegment(b.x, b.y, cue.x, cue.y, obj.x, obj.y);
            if (d < this.p.R * 2.2) return false;
        }
        return true;
    }
}

// Helpers
function norm(v) { const L = Math.hypot(v.x, v.y) || 1; return { x: v.x / L, y: v.y / L }; }
function pointToSegment(px, py, x1, y1, x2, y2) {
    const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
    const dot = A * C + B * D; const len = C * C + D * D; let t = len ? dot / len : 0; t = Math.max(0, Math.min(1, t));
    const xx = x1 + C * t, yy = y1 + D * t;
    return Math.hypot(px - xx, py - yy);
}
