// Fizică 2D pentru 8-ball: mișcare, frecare, coliziuni, mantă, buzunare.
// Expune telemetrie per-șut: primul obiect atins, rail-after-contact, bile potate, scratch.
export class Physics {
    constructor(ui, audio) {
        this.ui = ui; this.audio = audio;
        this.W = 960; this.H = 520; this.PAD = 26;
        this.PLAY = { x: this.PAD + 20, y: this.PAD + 20, w: this.W - 2 * (this.PAD + 20), h: this.H - 2 * (this.PAD + 20) };
        this.R = 10; this.MASS = 1; this.REST = 0.98; this.FRIC = 0.992; this.SLOW = 0.02;
        this.POCKET_R = 22;
        this.pockets = [
            { x: this.PLAY.x, y: this.PLAY.y }, { x: this.PLAY.x + this.PLAY.w / 2, y: this.PLAY.y }, { x: this.PLAY.x + this.PLAY.w, y: this.PLAY.y },
            { x: this.PLAY.x, y: this.PLAY.y + this.PLAY.h }, { x: this.PLAY.x + this.PLAY.w / 2, y: this.PLAY.y + this.PLAY.h }, { x: this.PLAY.x + this.PLAY.w, y: this.PLAY.y + this.PLAY.h }
        ];
        this.balls = []; this.anyMoving = false;
        this.resetShotTelemetry();
    }

    clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }

    placeRack() {
        this.balls = [];
        // Bila albă
        this.balls.push(this.makeBall('cue', 0, '#ffffff', true, this.PLAY.x + this.PLAY.w * 0.3, this.PLAY.y + this.PLAY.h * 0.5));

        // 15 bile (WPA): 1–7 pline, 9–15 dungi, 8 neagră în mijlocul triunghiului
        const colors = {
            1: '#facc15', 2: '#60a5fa', 3: '#ef4444', 4: '#a78bfa', 5: '#fb923c', 6: '#22c55e', 7: '#78350f',
            8: '#111111',
            9: '#facc15', 10: '#60a5fa', 11: '#ef4444', 12: '#a78bfa', 13: '#fb923c', 14: '#22c55e', 15: '#78350f'
        };
        // Triunghi pe dreapta
        const startX = this.PLAY.x + this.PLAY.w * 0.68, startY = this.PLAY.y + this.PLAY.h * 0.5;
        const order = [11, 2, 14, 7, 8, 3, 10, 15, 6, 13, 12, 5, 9, 4, 1]; // 8 la mijloc
        let idx = 0;
        for (let r = 0; r < 5; r++) {
            for (let c = 0; c <= r; c++) {
                const n = order[idx++]; const ox = r * (this.R * 2 + 2); const oy = (c - r / 2) * (this.R * 2 + 2);
                this.balls.push(this.makeBall('obj', n, colors[n], false, startX + ox, startY + oy));
            }
        }
        this.resetShotTelemetry();
    }

    makeBall(type, number, color, isCue, x, y) {
        return { type, number, color, isCue, x, y, vx: 0, vy: 0, alive: true, stripe: (number >= 9 && number <= 15) };
    }

    resetShotTelemetry() { this.shot = { firstHit: null, railAfter: false, pocketed: [], scratch: false }; }

    placeCueAt(x, y) {
        const cue = this.balls.find(b => b.isCue);
        cue.x = this.clamp(x, this.PLAY.x + this.R, this.PLAY.x + this.PLAY.w - this.R);
        cue.y = this.clamp(y, this.PLAY.y + this.R, this.PLAY.y + this.PLAY.h - this.R);
        for (const b of this.balls) {
            if (!b.alive || b === cue) continue;
            const d = this.dist(cue.x, cue.y, b.x, b.y);
            if (d < this.R * 2) { cue.x += (cue.x - b.x) / d * (this.R * 2 - d + 0.5); cue.y += (cue.y - b.y) / d * (this.R * 2 - d + 0.5); }
        }
    }

    strikeCue(dx, dy, power) {
        const cue = this.balls.find(b => b.isCue);
        const L = Math.hypot(dx, dy) || 1;
        const speed = power * 7.5; // scala puterii
        cue.vx = (dx / L) * speed * -1;
        cue.vy = (dy / L) * speed * -1;
        this.anyMoving = true;
        this.audio.play('cue', 0.7);
        this.resetShotTelemetry();
    }

    get anyBallsMoving() {
        return this.balls.some(b => b.alive && (Math.abs(b.vx) > this.SLOW || Math.abs(b.vy) > this.SLOW));
    }

    step() {
        for (let k = 0; k < 2; k++) this.integrate();
        this.anyMoving = this.anyBallsMoving;
    }

    integrate() {
        const B = this.balls, R = this.R, PLAY = this.PLAY;
        // mișcare + frecare
        for (const b of B) {
            if (!b.alive) continue;
            b.x += b.vx; b.y += b.vy;
            b.vx *= this.FRIC; b.vy *= this.FRIC;
            if (Math.abs(b.vx) < this.SLOW) b.vx = 0;
            if (Math.abs(b.vy) < this.SLOW) b.vy = 0;
        }

        // pocket/scratch + mantă
        for (const b of B) {
            if (!b.alive) continue;
            // buzunare
            for (const p of this.pockets) {
                if (this.dist(b.x, b.y, p.x, p.y) < this.POCKET_R - 1.5) {
                    if (b.isCue) { // scratch
                        this.shot.scratch = true;
                        b.alive = false; this.audio.play('pocket', 0.6);
                    } else {
                        b.alive = false; this.shot.pocketed.push(b.number);
                        this.audio.play('pocket', 0.8);
                    }
                    break;
                }
            }
            // mantă (reflectare)
            const minX = PLAY.x + R, maxX = PLAY.x + PLAY.w - R, minY = PLAY.y + R, maxY = PLAY.y + PLAY.h - R;
            if (!b.alive) continue;
            let hitRail = false;
            if (b.x < minX) { b.x = minX; b.vx = -b.vx * this.REST; hitRail = true; }
            if (b.x > maxX) { b.x = maxX; b.vx = -b.vx * this.REST; hitRail = true; }
            if (b.y < minY) { b.y = minY; b.vy = -b.vy * this.REST; hitRail = true; }
            if (b.y > maxY) { b.y = maxY; b.vy = -b.vy * this.REST; hitRail = true; }
            if (hitRail) { this.shot.railAfter = true; this.audio.play('cushion', 0.35); }
        }

        // coliziuni bilă-bilă + primul obiect atins
        for (let i = 0; i < B.length; i++) {
            const a = B[i]; if (!a.alive) continue;
            for (let j = i + 1; j < B.length; j++) {
                const b = B[j]; if (!b.alive) continue;
                const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), minD = R * 2;
                if (d > 0 && d < minD) {
                    const nx = dx / d, ny = dy / d, overlap = (minD - d) / 2;
                    a.x -= nx * overlap; a.y -= ny * overlap; b.x += nx * overlap; b.y += ny * overlap;
                    // elastic egal-masă
                    const dvx = b.vx - a.vx, dvy = b.vy - a.vy, vn = dvx * nx + dvy * ny;
                    if (vn < 0) {
                        const impulse = - (1 + 1) * vn / 2;
                        const ix = impulse * nx, iy = impulse * ny;
                        a.vx -= ix; a.vy -= iy; b.vx += ix; b.vy += iy;
                        this.audio.play('collide', Math.min(0.55, Math.abs(vn) * 0.18));
                    }
                    // log „primul obiect atins”
                    if (!this.shot.firstHit) {
                        if (a.isCue && !b.isCue) this.shot.firstHit = b.number;
                        else if (b.isCue && !a.isCue) this.shot.firstHit = a.number;
                    }
                }
            }
        }
    }

    reviveCueForBallInHand() {
        const cue = this.balls.find(b => b.isCue);
        if (!cue.alive) { cue.alive = true; this.placeCueAt(this.PLAY.x + this.PLAY.w * 0.3, this.PLAY.y + this.PLAY.h * 0.5); }
    }
}
