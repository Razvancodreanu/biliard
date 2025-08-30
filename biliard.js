/* Biliard 2D – fizică simplificată (vanilla Canvas)
   - Mouse drag din bila albă => direcție + putere
   - 6 buzunare, coliziuni bilă-bilă & bilă-margine, frecare
   - Mod antrenament: 1 bilă albă + 6 bile color
   - Comentarii la pașii importanți; fără librării externe
*/
(() => {
    const canvas = document.getElementById('table');
    const shotsEl = document.getElementById('shots');
    const leftEl = document.getElementById('left');
    const resetBtn = document.getElementById('resetBtn');

    const DPR = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    const W = 960, H = 520;        // dimensiuni „logice” ale mesei
    const PAD = 26;                // grosimea mantalei vizuale
    const PLAY = { x: PAD + 20, y: PAD + 20, w: W - 2 * (PAD + 20), h: H - 2 * (PAD + 20) };

    // Setăm canvas retina-aware
    function setupCanvas() {
        canvas.width = W * DPR; canvas.height = H * DPR;
        canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }

    const ctx = canvas.getContext('2d');

    // Parametri fizică
    const R = 10;                 // rază bilă
    const MASS = 1;               // mase egale
    const RESTITUTION = 0.98;     // cât de „elastică” e lovitura cu mantaua
    const FRICTION = 0.992;       // frecare per frame
    const SLOW_EPS = 0.02;        // prag sub care considerăm „sta pe loc”
    const POWER_SCALE = 0.035;    // scala puterii loviturii

    // Buzunare (6): colțuri + mijloc muchii
    const POCKET_R = 22;
    const pockets = [
        { x: PLAY.x, y: PLAY.y },                 // stânga-sus
        { x: PLAY.x + PLAY.w / 2, y: PLAY.y },                 // centru-sus
        { x: PLAY.x + PLAY.w, y: PLAY.y },                 // dreapta-sus
        { x: PLAY.x, y: PLAY.y + PLAY.h },          // stânga-jos
        { x: PLAY.x + PLAY.w / 2, y: PLAY.y + PLAY.h },          // centru-jos
        { x: PLAY.x + PLAY.w, y: PLAY.y + PLAY.h },          // dreapta-jos
    ];

    // Stare joc
    let balls = [];     // {x,y,vx,vy,color,number,alive,isCue}
    let aiming = false; // ținem minte dacă tragem de tac
    let aimStart = null, aimMouse = null;
    let shots = 0;

    function resetRack() {
        balls = [];
        shots = 0;
        // Bila albă (în jumătatea stângă)
        balls.push({ x: PLAY.x + PLAY.w * 0.3, y: PLAY.y + PLAY.h * 0.5, vx: 0, vy: 0, color: '#ffffff', number: 0, alive: true, isCue: true });

        // 6 bile colorate într-un mic „triunghi” spre dreapta
        const colors = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#f72585'];
        const startX = PLAY.x + PLAY.w * 0.68, startY = PLAY.y + PLAY.h * 0.5;
        let k = 1, idx = 0, row = 0;
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c <= r; c++) {
                const ox = r * (R * 2 + 2);
                const oy = (c - r / 2) * (R * 2 + 2);
                balls.push({
                    x: startX + ox,
                    y: startY + oy,
                    vx: 0, vy: 0,
                    color: colors[idx % colors.length],
                    number: k++, alive: true, isCue: false
                });
                idx++;
            }
        }
        updateHUD();
    }

    // Desenare masă + buzunare + bile + indicator țintire
    function draw() {
        ctx.clearRect(0, 0, W, H);
        // Masă (rail + cloth)
        roundRect(ctx, 0, 0, W, H, 18, '#0a0f14'); // manta
        roundRect(ctx, PLAY.x, PLAY.y, PLAY.w, PLAY.h, 12, '#126b46'); // pânză
        // buzunare
        ctx.fillStyle = '#000';
        for (const p of pockets) circle(ctx, p.x, p.y, POCKET_R);

        // linii de ghidaj (diamante)
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        for (let i = 1; i <= 3; i++) {
            // sus/jos
            ctx.beginPath(); ctx.moveTo(PLAY.x + (PLAY.w / 4) * i, PLAY.y + 4); ctx.lineTo(PLAY.x + (PLAY.w / 4) * i, PLAY.y + 12); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(PLAY.x + (PLAY.w / 4) * i, PLAY.y + PLAY.h - 12); ctx.lineTo(PLAY.x + (PLAY.w / 4) * i, PLAY.y + PLAY.h - 4); ctx.stroke();
            // stânga/dreapta
            ctx.beginPath(); ctx.moveTo(PLAY.x + 4, PLAY.y + (PLAY.h / 4) * i); ctx.lineTo(PLAY.x + 12, PLAY.y + (PLAY.h / 4) * i); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(PLAY.x + PLAY.w - 12, PLAY.y + (PLAY.h / 4) * i); ctx.lineTo(PLAY.x + PLAY.w - 4, PLAY.y + (PLAY.h / 4) * i); ctx.stroke();
        }

        // bile
        for (const b of balls) {
            if (!b.alive) continue;
            ctx.fillStyle = b.color;
            circle(ctx, b.x, b.y, R);
            // număr
            if (!b.isCue) {
                ctx.fillStyle = '#111'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(String(b.number), b.x, b.y);
            }
        }

        // indicator țintire
        if (aiming && aimStart && aimMouse) {
            const dx = aimMouse.x - aimStart.x, dy = aimMouse.y - aimStart.y;
            const L = Math.hypot(dx, dy);
            const maxL = 220; // limitare putere vizuală
            const scale = Math.min(1, L / maxL);
            ctx.strokeStyle = 'rgba(217,249,157,0.9)'; // var(--line)
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(aimStart.x, aimStart.y);
            ctx.lineTo(aimStart.x + dx, aimStart.y + dy);
            ctx.stroke();

            // bară putere
            const pw = 120, ph = 8, px = PLAY.x + PLAY.w - pw - 12, py = PLAY.y + 12;
            ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(px, py, pw, ph);
            ctx.fillStyle = '#d9f99d'; ctx.fillRect(px, py, pw * scale, ph);
            ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.strokeRect(px, py, pw, ph);
        }
    }

    // Simulare fizică: frecare, coliziuni, buzunare, margini
    function stepPhysics() {
        // mișcare + frecare
        for (const b of balls) {
            if (!b.alive) continue;
            b.x += b.vx; b.y += b.vy;
            b.vx *= FRICTION; b.vy *= FRICTION;
            if (Math.abs(b.vx) < SLOW_EPS) b.vx = 0;
            if (Math.abs(b.vy) < SLOW_EPS) b.vy = 0;
        }

        // coliziuni cu margini (pe zona PLAY)
        for (const b of balls) {
            if (!b.alive) continue;
            // dacă e în buzunar, îl scoatem
            for (const p of pockets) {
                if (dist(b.x, b.y, p.x, p.y) < POCKET_R - 2) {
                    if (b.isCue) {
                        // fault: bila albă reapare pe jumătatea stângă, centru
                        placeCueSafe();
                    } else {
                        b.alive = false;
                        updateHUD();
                    }
                    continue;
                }
            }

            // limite (reflectare)
            const minX = PLAY.x + R, maxX = PLAY.x + PLAY.w - R;
            const minY = PLAY.y + R, maxY = PLAY.y + PLAY.h - R;
            if (b.x < minX) { b.x = minX; b.vx = -b.vx * RESTITUTION; }
            if (b.x > maxX) { b.x = maxX; b.vx = -b.vx * RESTITUTION; }
            if (b.y < minY) { b.y = minY; b.vy = -b.vy * RESTITUTION; }
            if (b.y > maxY) { b.y = maxY; b.vy = -b.vy * RESTITUTION; }
        }

        // coliziuni bilă-bilă (iterăm de mai multe ori pt. stabilitate)
        for (let iter = 0; iter < 2; iter++) {
            for (let i = 0; i < balls.length; i++) {
                const a = balls[i]; if (!a.alive) continue;
                for (let j = i + 1; j < balls.length; j++) {
                    const b = balls[j]; if (!b.alive) continue;
                    const dx = b.x - a.x, dy = b.y - a.y;
                    const d = Math.hypot(dx, dy);
                    const minD = R * 2;
                    if (d > 0 && d < minD) {
                        // separare
                        const nx = dx / d, ny = dy / d;
                        const overlap = (minD - d) / 2;
                        a.x -= nx * overlap; a.y -= ny * overlap;
                        b.x += nx * overlap; b.y += ny * overlap;

                        // coliziune elastică (mase egale)
                        const dvx = b.vx - a.vx, dvy = b.vy - a.vy;
                        const vn = dvx * nx + dvy * ny; // componenta relativă pe normală
                        if (vn < 0) {
                            const impulse = (-(1 + 1) * vn) / (1 / MASS + 1 / MASS);
                            const ix = impulse * nx / MASS, iy = impulse * ny / MASS;
                            a.vx -= ix; a.vy -= iy;
                            b.vx += ix; b.vy += iy;
                        }
                    }
                }
            }
        }
    }

    function placeCueSafe() {
        // Plasează bila albă într-o poziție liberă în jumătatea stângă
        const cue = balls.find(b => b.isCue);
        const target = { x: PLAY.x + PLAY.w * 0.3, y: PLAY.y + PLAY.h * 0.5 };
        cue.vx = cue.vy = 0;
        // caută poziție fără suprapunere
        let pos = { ...target };
        let ok = false, tries = 0;
        while (!ok && tries < 200) {
            ok = balls.every(b => !b.alive || b === cue || dist(pos.x, pos.y, b.x, b.y) >= R * 2 + 1);
            if (!ok) {
                pos.x += (Math.random() - 0.5) * 20;
                pos.y += (Math.random() - 0.5) * 20;
                pos.x = clamp(pos.x, PLAY.x + R, PLAY.x + PLAY.w - R);
                pos.y = clamp(pos.y, PLAY.y + R, PLAY.y + PLAY.h - R);
            }
            tries++;
        }
        cue.x = pos.x; cue.y = pos.y;
    }

    function allStill() {
        return balls.every(b => !b.alive || (Math.abs(b.vx) < SLOW_EPS && Math.abs(b.vy) < SLOW_EPS));
    }

    // Input: țintire din bila albă
    canvas.addEventListener('mousedown', (e) => {
        if (!allStill()) return; // nu tragem cât timp se mișcă bilele
        const cue = balls.find(b => b.isCue);
        const m = getMouse(e);
        if (dist(m.x, m.y, cue.x, cue.y) <= R * 1.8) {
            aiming = true;
            aimStart = { x: cue.x, y: cue.y };
            aimMouse = m;
        }
    });
    canvas.addEventListener('mousemove', (e) => {
        if (!aiming) return;
        aimMouse = getMouse(e);
    });
    canvas.addEventListener('mouseup', (e) => {
        if (!aiming) return;
        const cue = balls.find(b => b.isCue);
        const m = getMouse(e);
        const dx = m.x - aimStart.x, dy = m.y - aimStart.y;
        const L = Math.hypot(dx, dy);
        if (L > 2) {
            // Setăm viteza (în direcția opusă drag-ului, ca la tac)
            const maxL = 220, s = Math.min(L, maxL);
            cue.vx = -(dx / L) * s * POWER_SCALE;
            cue.vy = -(dy / L) * s * POWER_SCALE;
            shots++; updateHUD();
        }
        aiming = false; aimStart = aimMouse = null;
    });

    resetBtn.addEventListener('click', () => { resetRack(); });

    // Loop
    function loop() {
        for (let i = 0; i < 2; i++) stepPhysics(); // 2 sub-pași pt. stabilitate
        draw();
        requestAnimationFrame(loop);
    }

    function updateHUD() {
        shotsEl.textContent = String(shots);
        const left = balls.filter(b => b.alive && !b.isCue).length;
        leftEl.textContent = String(left);
    }

    // Utils desen
    function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    function roundRect(ctx, x, y, w, h, r, fill) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        ctx.fillStyle = fill; ctx.fill();
    }
    // Utils math
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
    const getMouse = (e) => {
        const rect = canvas.getBoundingClientRect();
        return { x: (e.clientX - rect.left), y: (e.clientY - rect.top) };
    };

    // Bootstrap
    setupCanvas();
    resetRack();
    loop();
})();
