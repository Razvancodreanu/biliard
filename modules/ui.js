// UI: desen + input (mouse/touch) cu pinch-zoom & pan; țintire & ball-in-hand
export class UI {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // --- stare gameplay
        this.aiming = false;
        this.aimStart = null;
        this.aimMouse = null;
        this.power = 0;
        this.pointerDown = false;

        // --- cameră (zoom & pan)
        this.cam = { scale: 1, x: 0, y: 0 };
        this.ZOOM_MIN = 0.7;
        this.ZOOM_MAX = 2.2;

        // pinch state
        this._pointers = new Map(); // pointerId -> {x,y}
        this._pinch = null;         // {scale0, x0, y0, d0, centerS:{x,y}, worldAtCenter:{x,y}}

        // UX/gesturi
        this.canvas.style.touchAction = 'none'; // blocăm scroll nativ pe canvas
        this._lastTap = 0;

        // pointer events (unificat mouse+touch)
        canvas.addEventListener('pointerdown', e => this._onPointerDown(e), { passive: false });
        window.addEventListener('pointermove', e => this._onPointerMove(e), { passive: false });
        window.addEventListener('pointerup', e => this._onPointerUp(e), { passive: false });
        window.addEventListener('pointercancel', e => this._onPointerUp(e), { passive: false });

        // zoom la rotiță (desktop/trackpad)
        canvas.addEventListener('wheel', e => this._onWheel(e), { passive: false });

        // callback-uri setate din exterior (biliard.js → rules)
        this.onPointerDown = null;
        this.onPointerDrag = null;
        this.onPointerUp = null;
    }

    // ---- coordonate ecran→canvas (screen space)
    _pointFromClient(clientX, clientY) {
        const r = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / r.width;
        const scaleY = this.canvas.height / r.height;
        return { x: (clientX - r.left) * scaleX, y: (clientY - r.top) * scaleY };
    }

    // ---- transformări cameră (screen<->world)
    screenToWorld(sx, sy) {
        return { x: (sx - this.cam.x) / this.cam.scale, y: (sy - this.cam.y) / this.cam.scale };
    }
    worldToScreen(wx, wy) {
        return { x: wx * this.cam.scale + this.cam.x, y: wy * this.cam.scale + this.cam.y };
    }
    applyCamera(ctx) {
        ctx.translate(this.cam.x, this.cam.y);
        ctx.scale(this.cam.scale, this.cam.scale);
    }

    // expune „getMouse” ca punct în lume (folosit de Rules)
    getMouseFromClient(clientX, clientY) {
        const s = this._pointFromClient(clientX, clientY);
        return this.screenToWorld(s.x, s.y);
    }

    // ---- wheel zoom (desktop)
    _onWheel(e) {
        e.preventDefault();
        // factor de zoom (smooth)
        const factor = Math.exp(-e.deltaY * 0.0015);
        const newScale = this._clamp(this.cam.scale * factor, this.ZOOM_MIN, this.ZOOM_MAX);

        const s = this._pointFromClient(e.clientX, e.clientY);
        const world = this.screenToWorld(s.x, s.y);

        // centrează zoom-ul în jurul cursorului
        this.cam.scale = newScale;
        this.cam.x = s.x - world.x * this.cam.scale;
        this.cam.y = s.y - world.y * this.cam.scale;
    }

    // ---- pointer handlers (unificat)
    _onPointerDown(e) {
        e.preventDefault();
        this.pointerDown = true;
        try { this.canvas.setPointerCapture?.(e.pointerId); } catch { }

        const s = this._pointFromClient(e.clientX, e.clientY);
        this._pointers.set(e.pointerId, s);

        const now = performance.now();
        if (now - this._lastTap < 300 && this._pointers.size === 1) {
            // dublu-tap/click -> reset zoom/pan
            this.cam.scale = 1; this.cam.x = 0; this.cam.y = 0;
        }
        this._lastTap = now;

        if (this._pointers.size === 2) {
            // începe pinch
            const [p1, p2] = [...this._pointers.values()];
            const centerS = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
            const d0 = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
            const worldAtCenter = this.screenToWorld(centerS.x, centerS.y);
            this._pinch = {
                scale0: this.cam.scale,
                x0: this.cam.x, y0: this.cam.y,
                d0, centerS, worldAtCenter
            };
            return; // nu trimitem către gameplay când e pinch
        }

        // un singur pointer -> gameplay
        const m = this.getMouseFromClient(e.clientX, e.clientY);
        if (this.onPointerDown) this.onPointerDown(m);
    }

    _onPointerMove(e) {
        e.preventDefault();
        const s = this._pointFromClient(e.clientX, e.clientY);
        if (this._pointers.has(e.pointerId)) {
            this._pointers.set(e.pointerId, s);
        }

        if (this._pointers.size === 2 && this._pinch) {
            const [p1, p2] = [...this._pointers.values()];
            const centerS = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
            const d = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;

            // noul scale, clampat
            const scale = this._clamp(this._pinch.scale0 * (d / this._pinch.d0), this.ZOOM_MIN, this.ZOOM_MAX);
            this.cam.scale = scale;

            // zoom în jurul centrului pinch (ține aceleași world coords sub degete)
            const w = this._pinch.worldAtCenter;
            this.cam.x = centerS.x - w.x * this.cam.scale;
            this.cam.y = centerS.y - w.y * this.cam.scale;
            return;
        }

        // gameplay drag
        const m = this.getMouseFromClient(e.clientX, e.clientY);
        if (this.onPointerDrag) this.onPointerDrag(m);
    }

    _onPointerUp(e) {
        e.preventDefault();
        const s = this._pointFromClient(e.clientX, e.clientY);
        this._pointers.delete(e.pointerId);
        if (this._pointers.size < 2) this._pinch = null;

        // finalizează gameplay doar dacă nu era pinch activ
        if (!this._pinch) {
            const m = this.getMouseFromClient(e.clientX, e.clientY);
            if (this.onPointerUp) this.onPointerUp(m);
        }
        this.pointerDown = false;
        try { this.canvas.releasePointerCapture?.(e.pointerId); } catch { }
    }

    _clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

    // ---- gameplay: țintire
    startAim(m, p) {
        const cue = p.balls.find(b => b.isCue);
        if (!cue || !cue.alive) return;
        const MAX_DIST = p.R * 3.2; // puțin mai permisiv pe touch
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

    // ---- desen
    draw(p, rules) {
        const ctx = this.ctx, W = p.W, H = p.H, PLAY = p.PLAY;

        // clear (fără transform)
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, W, H);

        // cursor & hint
        const hint = document.getElementById('hint');
        if (rules.ballInHand) {
            this.canvas.style.cursor = this.pointerDown ? 'grabbing' : 'grab';
            if (hint) hint.textContent = 'Ball-in-hand: trage bila albă și ridică degetul pentru a o plasa. Pinch pentru zoom, 2 degete pentru pan/zoom.';
        } else {
            this.canvas.style.cursor = this.aiming ? 'grabbing' : 'crosshair';
            if (hint) hint.textContent = 'Țintește din bila albă: apasă și trage. Pinch pentru zoom, 2 degete pentru pan.';
        }

        // aplică camera
        ctx.save();
        this.applyCamera(ctx);

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

            // power bar (desenat în „lumea” mesei, colțul din dreapta-sus al cloth-ului)
            const pw = 120, ph = 8, px = PLAY.x + PLAY.w - pw - 12, py = PLAY.y + 12;
            ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(px, py, pw, ph);
            ctx.fillStyle = '#d9f99d'; ctx.fillRect(px, py, pw * this.power, ph);
            ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.strokeRect(px, py, pw, ph);
        }

        ctx.restore();
    }

    flashWinner(winner, reason) {
        const el = document.getElementById('hint');
        el.innerHTML = `🏆 ${winner === 1 ? 'Jucător 1' : 'Jucător 2'} a câștigat (${reason}). Dublu-tap pentru reset zoom.`;
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
