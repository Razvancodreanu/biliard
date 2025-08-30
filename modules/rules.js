// Reguli 8-ball (WPA): state machine BREAK→OPEN→GROUPED→END
// Faulturi: scratch, wrong-ball-first, no-rail-after-contact. 8 pe break -> spot & continuă (simplificat).
export class Rules8Ball {
    constructor(physics, ui, audio) {
        this.p = physics; this.ui = ui; this.audio = audio;
        this.mode = '2p';
        this.state = 'BREAK'; // BREAK | OPEN | GROUPED | END
        this.groups = null;   // {p1:'solids'|'stripes', p2:'stripes'|'solids'} sau null
        this.lastFoul = null; // text pentru HUD
        this.legalTarget = null; // 'solids'|'stripes' sau 'any' (open)
        this.ballInHand = false;
        this.score = { p1: [], p2: [] }; // bile potate (fără 8)
    }
    setMode(m) { this.mode = m; }
    fullReset() { this.groups = null; this.state = 'BREAK'; this.lastFoul = null; this.score = { p1: [], p2: [] }; this.ballInHand = false; }
    newRack(rematch = false) {
        this.p.placeRack();
        this.state = 'BREAK'; this.groups = null; this.lastFoul = null; this.ballInHand = false;
        this.score = { p1: [], p2: [] }; this.legalTarget = 'any';
    }
    playerLabel(pl) { return pl === 1 ? 'Jucător 1' : 'Jucător 2'; }
    groupsLabel() {
        if (!this.groups) return 'Open table';
        return `J1=${this.groups.p1 === 'solids' ? 'pline' : 'dungi'} · J2=${this.groups.p2 === 'solids' ? 'pline' : 'dungi'}`;
    }
    lastFoulLabel() { return this.lastFoul; }
    isAIMove(pl, mode) { return (mode !== '2p' && pl === 2); }

    // pointer handlers: țintire vs ball-in-hand
    onPointerDown(m) {
        if (this.ballInHand) { this.p.placeCueAt(m.x, m.y); return; }
        this.ui.startAim(m, this.p);
    }
    onPointerDrag(m) {
        if (this.ballInHand) { this.p.placeCueAt(m.x, m.y); return; }
        this.ui.updateAim(m);
    }
    onPointerUp(m) {
        if (this.ballInHand) { this.ballInHand = false; return { fired: false }; }
        const shot = this.ui.endAim(m, this.p);
        return shot;
    }

    endOfShot(currentPlayer) {
        const shot = this.p.shot; // {firstHit, railAfter, pocketed[], scratch}
        let foul = null;
        let nextPlayer = currentPlayer;

        // 8 pe break -> spot & continuă (simplificat)
        if (this.state === 'BREAK' && shot.pocketed.includes(8)) {
            shot.pocketed = shot.pocketed.filter(n => n !== 8);
            const eight = this.p.balls.find(b => b.number === 8);
            if (eight) {
                eight.alive = true;
                eight.x = this.p.PLAY.x + this.p.PLAY.w * 0.68 + 2 * (this.p.R * 2 + 2);
                eight.y = this.p.PLAY.y + this.p.PLAY.h * 0.5;
            }
        }

        const fHit = shot.firstHit; // poate fi null (nu a atins nimic)
        const playerGroup = this.groups ? (currentPlayer === 1 ? this.groups.p1 : this.groups.p2) : null;

        // No-rail-after-contact
        const noRailAfter = (fHit !== null && !shot.railAfter && shot.pocketed.length === 0);

        // Scratch?
        if (shot.scratch) foul = 'scratch';

        // Wrong-ball-first?
        if (!foul) {
            if (this.state === 'GROUPED') {
                if (fHit === null) foul = 'no-contact';
                else {
                    const isStripe = (fHit >= 9 && fHit <= 15);
                    const wantStripe = (playerGroup === 'stripes');
                    if (isStripe !== wantStripe) foul = 'wrong-ball-first';
                }
            } else if (this.state !== 'BREAK' && fHit === 8 && this.groups) {
                const stillHasGroup = this.hasGroupOnTable(currentPlayer);
                if (stillHasGroup) foul = 'wrong-ball-first';
            }
        }

        if (!foul && noRailAfter) foul = 'no-rail-after-contact';

        // scor (fără 8)
        const ownGroup = this.groups ? (currentPlayer === 1 ? this.groups.p1 : this.groups.p2) : null;
        const pocketedNonCue = shot.pocketed.filter(n => n !== 8);
        if (pocketedNonCue.length > 0) {
            for (const n of pocketedNonCue) {
                const isStripe = (n >= 9 && n <= 15);
                const group = isStripe ? 'stripes' : 'solids';
                if (!this.groups && this.state !== 'BREAK' && !foul) {
                    // PRIMUL POT LEGAL -> setăm grupurile
                    this.groups = (group === 'solids') ? { p1: 'solids', p2: 'stripes' } : { p1: 'stripes', p2: 'solids' };
                    if (currentPlayer === 2) this.groups = { p1: this.groups.p2, p2: this.groups.p1 };
                    this.state = 'GROUPED';
                }
                if (this.groups && group === ownGroup && !foul) {
                    const key = currentPlayer === 1 ? 'p1' : 'p2';
                    if (!this.score[key].includes(n)) this.score[key].push(n);
                }
            }
        }

        // 8-ball pot -> win/lose
        let gameEnd = null;
        if (shot.pocketed.includes(8)) {
            const stillHasGroup = this.hasGroupOnTable(currentPlayer);
            if (foul || stillHasGroup) { gameEnd = { winner: currentPlayer === 1 ? 2 : 1, reason: foul ? 'fault on 8' : '8 too early' }; }
            else { gameEnd = { winner: currentPlayer, reason: 'legal 8' }; }
        }

        // cine urmează
        let shooterContinues = false;
        if (!gameEnd) {
            if (foul) {
                nextPlayer = currentPlayer === 1 ? 2 : 1;
            } else {
                if (this.groups) {
                    shooterContinues = pocketedNonCue.some(n => {
                        const isStripe = (n >= 9 && n <= 15);
                        const group = isStripe ? 'stripes' : 'solids';
                        return group === ownGroup;
                    });
                } else {
                    shooterContinues = (pocketedNonCue.length > 0);
                }
                if (!shooterContinues) nextPlayer = currentPlayer === 1 ? 2 : 1;
            }
        }

        // Ball-in-hand după fault
        this.ballInHand = !!foul;
        if (this.ballInHand) { this.p.reviveCueForBallInHand(); }
        this.lastFoul = foul ? ({
            'scratch': 'Scratch',
            'wrong-ball-first': 'Wrong ball first',
            'no-rail-after-contact': 'No rail after contact',
            'no-contact': 'No contact'
        }[foul] + ' — ball-in-hand pentru adversar') : null;

        // target legal pentru highlight
        this.legalTarget = !this.groups ? 'any' : ((ownGroup === 'solids') ? 'solids' : 'stripes');

        if (gameEnd) {
            this.state = 'END';
            this.ui.flashWinner(gameEnd.winner, gameEnd.reason);
        } else {
            if (this.state === 'BREAK') this.state = 'OPEN';
        }

        this.p.resetShotTelemetry();
        return { nextPlayer, foul, shooterContinues, gameEnd };
    }

    hasGroupOnTable(player) {
        if (!this.groups) return true;
        const myGroup = player === 1 ? this.groups.p1 : this.groups.p2;
        const alive = this.p.balls.filter(b => b.alive && !b.isCue && b.number !== 8);
        return alive.some(b => (b.stripe ? 'stripes' : 'solids') === myGroup);
    }

    groupsFor(player) { if (!this.groups) return null; return player === 1 ? this.groups.p1 : this.groups.p2; }
    wantsStripe(player) {
        const g = this.groupsFor(player);
        if (!g) return null;
        return g === 'stripes';
    }
}
