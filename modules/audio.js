// Audio: încarcă sfx (cu fallback WebAudio beep), volum ∝ impact, rate-limit pt. coliziuni dese.
export class AudioBus {
    constructor(map) {
        this.ctx = null;
        this.buffers = {};
        this.map = map;
        this.lastPlay = { collide: 0, cushion: 0 };
        // preaload „lazy” la prima interacțiune user
        window.addEventListener('pointerdown', () => this.ensureCtx(), { once: true });
        this.preload();
        // în constructorul AudioBus (după pointerdown-ul existent):
        window.addEventListener('touchstart', () => this.ensureCtx(), { once: true });

    }
    ensureCtx() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    async preload() {
        for (const [key, url] of Object.entries(this.map)) {
            try { this.buffers[key] = await this.loadBuffer(url); }
            catch { this.buffers[key] = null; }
        }
    }
    async loadBuffer(url) {
        const res = await fetch(url); const arr = await res.arrayBuffer();
        this.ensureCtx(); return await this.ctx.decodeAudioData(arr);
    }
    play(name, vol = 0.6) {
        const now = performance.now();
        // throttle pentru evenimente frecvente
        if ((name === 'collide' || name === 'cushion') && now - (this.lastPlay[name] || 0) < 25) return;
        this.lastPlay[name] = now;

        this.ensureCtx();
        const ctx = this.ctx;
        if (this.buffers[name]) {
            const src = ctx.createBufferSource(); src.buffer = this.buffers[name];
            const g = ctx.createGain(); g.gain.value = Math.min(1, Math.max(0, vol));
            src.connect(g).connect(ctx.destination); src.start();
        } else {
            // fallback beep mic
            const osc = ctx.createOscillator(), g = ctx.createGain();
            osc.frequency.value = name === 'pocket' ? 320 : name === 'collide' ? 180 : 140;
            g.gain.value = Math.min(0.08, vol * 0.1);
            osc.connect(g).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.07);
        }
    }
}
