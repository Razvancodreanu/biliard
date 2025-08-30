console.log('[Biliard] boot OK');   // <- adaugă asta pe prima linie
// biliard.js (entry) – leagă fizica, regulile, AI, audio și UI
import { Physics } from './modules/physics.js';
import { Rules8Ball } from './modules/rules.js';
import { AI } from './modules/ai.js';
import { AudioBus } from './modules/audio.js';
import { UI } from './modules/ui.js';

const canvas = document.getElementById('table');
const ui = new UI(canvas);
const audio = new AudioBus({
    cue: 'assets/sfx/cue.wav',
    collide: 'assets/sfx/collide.wav',
    cushion: 'assets/sfx/cushion.wav',
    pocket: 'assets/sfx/pocket.wav',
});
const physics = new Physics(ui, audio);
const rules = new Rules8Ball(physics, ui, audio);
const ai = new AI(physics, rules, ui);

// UI controls
const modeEl = document.getElementById('mode');
const turnEl = document.getElementById('turn');
const groupsEl = document.getElementById('groups');
const foulsEl = document.getElementById('fouls');
const shotsEl = document.getElementById('shots');
const rematchBtn = document.getElementById('rematch');
const resetBtn = document.getElementById('reset');

let mode = '2p';        // 2p | ai-easy | ai-medium | ai-hard
let currentPlayer = 1;  // 1 sau 2
let shots = 0;

modeEl.addEventListener('change', () => { mode = modeEl.value; rules.setMode(mode); hardReset(); });
rematchBtn.addEventListener('click', () => startRack(true));
resetBtn.addEventListener('click', () => hardReset());

// Input: țintire & lovire / ball-in-hand
ui.onPointerDown = (m) => {
    if (rules.isAIMove(currentPlayer, mode)) return;
    rules.onPointerDown(m);
};
ui.onPointerDrag = (m) => rules.onPointerDrag(m);
ui.onPointerUp = (m) => {
    if (rules.isAIMove(currentPlayer, mode)) return;
    const shot = rules.onPointerUp(m);
    if (shot?.fired) shots++;
};

function updateHUD() {
    turnEl.textContent = rules.playerLabel(currentPlayer);
    groupsEl.textContent = rules.groupsLabel();
    foulsEl.textContent = rules.lastFoulLabel() || '—';
    shotsEl.textContent = String(shots);
}

// Bucla principală
function frame() {
    const beforeMoving = physics.anyMoving;
    physics.step();           // fizica + evenimente (coliziuni/pocket)
    ui.draw(physics, rules);  // desen
    if (beforeMoving && !physics.anyMoving) {
        // o lovitură s-a terminat -> evaluăm după regulile WPA
        const res = rules.endOfShot(currentPlayer);
        currentPlayer = res.nextPlayer;
        updateHUD();
        // dacă e rândul AI, execută
        maybeAIMove();
    }
    requestAnimationFrame(frame);
}

function maybeAIMove() {
    if (!rules.isAIMove(currentPlayer, mode)) return;
    if (rules.state === 'END') return;
    // Mic delay ca să "respire" UI-ul
    setTimeout(() => {
        const lvl = mode === 'ai-easy' ? 'easy' : mode === 'ai-medium' ? 'medium' : 'hard';
        ai.shoot(currentPlayer, lvl);
        shots++;
        updateHUD();
    }, mode === 'ai-hard' ? 300 : 450);
}

function startRack(rematch = false) {
    rules.newRack(rematch);  // poziționează bilele + reset state machine
    currentPlayer = 1;       // începe J1 (simplificat)
    shots = 0;
    updateHUD();
    // dacă AI e la mutare de start
    maybeAIMove();
}

function hardReset() { rules.fullReset(); startRack(false); }

// bootstrap
rules.setMode(mode);
hardReset();
requestAnimationFrame(frame);
