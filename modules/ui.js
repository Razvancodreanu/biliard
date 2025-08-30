// UI: desen masă/bile + linie țintire & power bar; highlight pentru ținta legală; input (aim & ball-in-hand)
export class UI {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // stare input/țintire
        this.aiming = false;
        this.aimStart = null;
        this.aimMouse = null;
        this.power = 0;

        // UX cursor (grab/grabbing)
        this.pointerDown = false;

        // IMPORTANT pt. mobile: oprește scroll/zoom pe canvas
        this.canvas.style.touchAction = 'none';

        // Pointer Events (unifică mouse + touch + stylus)
        canvas.addEventListener('pointerdown', e => this._pdown(e), { passive: false });
        window.addEventListener('pointermove', e => this._pmove(e), { passive: false });
        window.addEventListener('pointerup', e => this._pup(e), { passive: false });
        window.addEventListener('pointercancel', e => this._pup(e), { passive: false });

        // callback-uri setate din exterior (biliard.js → rules)
        this.onPointerDown = null;
        this.onPointerDrag = null;
        this.onPointerUp = null;
    }

    // coordonate corecte (canvas poate fi redimensionat de CSS)
    _pointFromClient(clientX, clientY) {
        const r = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / r.width;
        const scaleY = this.canvas.height / r.height;
        return {
            x: (clientX - r.left) * scaleX,
            y: (clientY - r.top) * scaleY
        };
    }

    // ---- Handlere Pointer → apelează API-ul vechi (_down/_move/_up) cu punctul corect
    _pdown(e) {
        // împiedică scroll/pinch pe mobil
        e.preventDefault();
        this.pointerDown = true;
        try { this.canvas.setPointerCapture?.(e.pointerId); } catch { }

        const m = this._pointFromClient(e.clientX, e.clientY);
        if (this.onPointerDown) this.onPointerDown(m);
    }

    _pmove(e) {
        if (!this.pointerDown) {
            // chiar și fără drag, actualizăm cursor/hint (nu strică)
        }
        const m = this._pointFromClient(e.clientX, e.clientY);
        if (this.onPointerDrag) this.onPointerDrag(m);
    }

    _pup(e) {
        const m = this._pointFromClient(e.clientX, e.clientY);
        if (this.onPointerUp) this.onPointerUp(m);
        this.pointerDown = false;
        try { this.canvas.releasePointerCapture?.(e.pointerId); } catch { }
    }

    // ---- logica de țintire (chemată de Rules prin callback-uri)
    startAim(m, p) {
        const cue = p.balls.find(b => b.isCue);
        if (!cue || !cue.alive) return;
        const MAX_DIST = p.R * 3.2; // mai iertător la touch
        if (Math.hypot(m.x - cue.x, m.y - cue.y) <= MAX_DIST) {
            this.aiming = true;
            this.aimStart = { x: cue.x, y: cue.y };
            this.aimMouse = m;
            this.power = 0;
        }
    }

    updateAim(m) {
        if (!this.aiming) return;
        this.aimMouse = m;
        const dx = m.x - this.aimStart.x, dy = m.y - this.aimStart.y;
        const L = Math.hypot(dx, dy);
        const maxL = 220;
        this.power = Math.min(1, L / maxL);
    }

    endAim(m, p) {
        if (!this.aiming) return { fired: false };
        const dx = m.x - this.aimStart.x, dy = m.y - this.aimStart.y;
        this.aiming = false;
        const power = this.power;
        this.power = 0;
        this.aimStart = null;
        this.aimMouse = null;
        if (Math.hypot(dx, dy) < 3) return { fired: false };
        p.strikeCue(dx, dy, power);
        return { fired: true };
    }

    // ---- desenarea mesei + HUD vizual (cursor/hint)
    draw(p, rules) {
        const ctx = this.ctx, W = p.W, H = p.H, PLAY = p.PLAY;
        ctx.clearRect(0, 0, W, H);

        // Cursor & hint dinamic
        const hint = document.getElementById('hint');
        if (rules.ballInHand) {
            this.canvas.style.cursor = this.pointerDown ? 'grabbing' : 'grab';
            if (hint) hint.textContent = 'Ball-in-hand: trage bila albă și ridică degetul pentru a o plasa.';
        } else {
            this.canvas.style.cursor = this.aiming ? 'grabbing' : 'crosshair';
            if (hint) hint.textContent = 'Țintește din bila albă: apăsă și trage. Ball-in-hand: mută bila albă.';
        }

        // rail + cloth
        roundRect(ctx, 0, 0, W, H, 18, '#0a0f14');
        roundRect(ctx, PLAY.x, PLAY.y, PLAY.w, PLAY.h, 12, '#126b46');

        // pockets
        ctx.fillStyle = '#000';
        for (const k of p.pockets) circle(ctx, k.x, k.y, p.POCKET_R);

        // highlight ținte legale
        if (rules.legalTarget && rules.legalTarget !== 'any') {
            for (const b of p.balls) {
                if (!b.alive || b.isCue || b.number === 8) continue;
                const g = b.stripe ? 'stripes' : 'solids';
                if (g === rules.legalTarget) {
                    ctx.beginPath(); ctx.arc(b.x, b.y, p.R + 4, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2; ctx.stroke();
                }
            }
        }

        // bile
        for (const b of p.balls) {
            if (!b.alive) continue;
            ctx.fillStyle = b.color; circle(ctx, b.x, b.y, p.R);
            if (!b.isCue) {
                if (b.stripe) {
                    ctx.save(); ctx.beginPath(); ctx.rect(b.x - p.R, b.y - p.R / 2, p.R * 2, p.R); ctx.clip();
                    ctx.fillStyle = '#eee'; circle(ctx, b.x, b.y, p.R);
                    ctx.restore();
                }
                ctx.fillStyle = '#111'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(String(b.number), b.x, b.y);
            }
        }

        // aiming overlay
        if (this.aiming && this.aimStart && this.aimMouse) {
            const dx = this.aimMouse.x - this.aimStart.x, dy = this.aimMouse.y - this.aimStart.y;
            ctx.strokeStyle = '#d9f99d'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(this.aimStart.x, this.aimStart.y);
            ctx.lineTo(this.aimMouse.x, this.aimMouse.y); ctx.stroke();

            // power bar
            const pw = 120, ph = 8, px = PLAY.x + PLAY.w - pw - 12, py = PLAY.y + 12;
            ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(px, py, pw, ph);
            ctx.fillStyle = '#d9f99d'; ctx.fillRect(px, py, pw * this.power, ph);
            ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.strokeRect(px, py, pw, ph);
        }
    }

    flashWinner(winner, reason) {
        const el = document.getElementById('hint');
        el.innerHTML = `🏆 ${winner === 1 ? 'Jucător 1' : 'Jucător 2'} a câștigat (${reason}). Click Revanșă pentru un nou joc.`;
        el.classList.add('bad');
        setTimeout(() => el.classList.remove('bad'), 1200);
    }
}

// helpers desen
function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function roundRect(ctx, x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
}
