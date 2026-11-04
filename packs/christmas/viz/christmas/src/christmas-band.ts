/**
 * MORALE FEED — station 3 of the ops room: the stage camera from the North
 * Pole on a monitor that fills the console body. The picture is
 * Santa's band on a cosy stage, one pixel member per sound, moving on that
 * sound's onsets. Drums share Santa's kit at the back: each piece flashes on
 * its hit and his beard bounces. Sleigh bells shake the reindeer's harness
 * and light its nose, a bass walks the snowman's fretting hand, keyboards
 * and leads play the elves' keytars, bells pick the gingerbread man's bars,
 * brass is the nutcracker's trumpet, and choirs, strings and pads are the
 * carollers, who hold their mouths open through a long note. Pitch lifts the
 * hands, a kick thumps the stage and the fire, and hats twinkle the tree.
 *
 * The readout strip under the monitor: LINK is the field's lock, AUDIENCE
 * climbs by the bar, ON STAGE counts the members, LAST names the member that
 * fired last, and MORALE is the SLEIGHCON level upside down, as a word and a
 * meter. Once the level is 2 or hotter the monitor's label plate blinks on
 * the beat.
 */

import type {VizMode, VizModeDef, VizServices} from '@cycletron/viz-sdk';
import {type FieldHap, type FieldTeam, HapField, type Rgb} from '@cycletron/viz-sdk';
import {nearest, PH, PW, PxScreen} from '@cycletron/viz-sdk';
import {type Cast, castFor, isOscillator, kitPiece, teamKey} from './lib/christmas-band/cast.js';
import {audienceAt, castName, moraleTag} from './lib/christmas-band/feed.js';
import {bakeInk, type Ink} from './lib/christmas-band/ink.js';
import {idleKit, type KitFlash, PIECES} from './lib/christmas-band/kit.js';
import {drawPerformer, type Singer} from './lib/christmas-band/performers.js';
import {isLong, registerPos, voiceOf} from './lib/christmas-band/roles.js';
import {BACK_FOOT, drawBackdrop, drawFloor, FRONT_FOOT, LIGHT_Y} from './lib/christmas-band/stage.js';
import {Alert} from './lib/console/alert.js';
import {
    alertColor, bakeConsoleInk, type ConsoleInk, type ConsoleLayout, drawConsole, layoutConsole, type Station,
} from './lib/console/chrome.js';
import {drawMonitor, fitMonitor, type Monitor} from './lib/console/monitor.js';
import {group} from './lib/console/panel.js';
import {drawStrip, pictureRect, type StripCell} from './lib/console/strip.js';

const LOOKAHEAD = 2;
const MAX_HAPS = 480;
const MAX_PER_TRACK = 48;
const DRUM_CAP = 32;
const IDLE_RATE = 0.25;
/** Bars a member stays on stage after its last note so short rests do not drop performers. */
const HOLD_BARS = 24;
/** Members on stage at once, Santa included (carollers count as 1 station with 3 singers). */
const CAP = 9;
/** Singers the carollers' station shows. */
const MAX_SINGERS = 3;
/** The front row centres on the stage and spreads out as it grows, up to this gap and the stage's edges. */
const MAX_GAP = 64;
const STAGE_W = 262;
/** How fast a player walks to a new spot, per second. */
const WALK = 6;
/** Elf hat colours, by the order the elves take the stage. */
const HATS = 3;
const STATION: Station = {code: 'STN-03', name: 'MORALE FEED'};
const MONITOR_LABEL = 'LIVE · NORTH POLE';
/** Plate blinks per bar once the alert is hot. */
const PLATE_BLINK = 4;

/** Stage order, left to right. Santa is at the back. */
const RANK: Record<Cast, number> = {
    santa: 0,
    snowman: 1,
    yeti: 2,
    mrsclaus: 3,
    guitarist: 4,
    elf: 5,
    nutcracker: 6,
    gingerbread: 7,
    penguin: 8,
    reindeer: 9,
    carollers: 10,
};

/** Duplicates past the first of each kind. */
const EXTRA: Record<Cast, number> = {
    elf: 0,
    guitarist: 1,
    mrsclaus: 2,
    snowman: 3,
    yeti: 4,
    nutcracker: 5,
    gingerbread: 6,
    penguin: 7,
    reindeer: 8,
    carollers: 9,
    santa: 10,
};

/** Fallback cast promotions when a second track of the same cast takes the stage, so each player gets a unique costume. */
const PROMOTE: Partial<Record<Cast, readonly Cast[]>> = {
    snowman: ['yeti', 'guitarist', 'elf'],
    yeti: ['snowman', 'mrsclaus'],
    elf: ['guitarist', 'mrsclaus', 'nutcracker', 'penguin'],
    guitarist: ['elf', 'mrsclaus', 'nutcracker'],
    mrsclaus: ['elf', 'guitarist', 'penguin'],
    gingerbread: ['penguin', 'nutcracker', 'elf'],
    penguin: ['gingerbread', 'nutcracker', 'elf'],
    nutcracker: ['elf', 'guitarist', 'penguin'],
};

interface Team extends FieldTeam {}

interface Note extends FieldHap<Team> {}

interface Pose {
    frame: number;
    hit: number;
    lift: number;
    hold: number;
}

interface Member {
    /** The member's key: the team name, `*kit` for Santa, `*choir` for the carollers. */
    key: string;
    cast: Cast;
    variant: number;
    x: number;
    foot: number;
    accent: string;
    activity: number;
    frame: number;
    hit: number;
    lift: number;
    held: boolean;
    singers: Singer[];
}

interface Cand {
    name: string;
    cast: Cast;
    team: Team | null;
}

interface Burst {
    long: boolean;
    end: number;
    lift: number;
    pitched: boolean;
}

class ChristmasBandMode implements VizMode {
    private readonly screen = new PxScreen();
    private readonly field = new HapField<Team, Note>({
        lookahead: LOOKAHEAD,
        maxHaps: MAX_HAPS,
        maxPerTrack: MAX_PER_TRACK,
        idleRate: IDLE_RATE,
        team: (base) => base,
        hap: (base) => base,
        cap: (_team, note) => (Number.isFinite(note) ? Infinity : DRUM_CAP),
        keep: (h, cycle) => h.end + 0.15 >= cycle,
    });
    private readonly colors = new Map<number, string>();
    private readonly poses = new Map<string, Pose>();
    private readonly locked = new Map<string, Cast>();
    /** Last bar each team was active, so short rests do not drop members off stage. */
    private readonly seenBar = new Map<string, number>();
    /** An elf's hat colour, kept while it stays on stage. */
    private readonly hats = new Map<string, number>();
    private readonly members: Member[] = [];
    private readonly stockings: string[] = [];
    /** Where each front-row player stands now; it eases to the slot. */
    private readonly spots = new Map<string, number>();
    private readonly kit: KitFlash = idleKit();
    private readonly kitTeam: Record<keyof Pick<KitFlash, 'kick' | 'snare' | 'hat' | 'tom' | 'crash'>, string> = {
        kick: '', snare: '', hat: '', tom: '', crash: '',
    };
    private thump = 0;
    private twinkle = 0;
    private ink!: Ink;
    private readonly alert = new Alert();
    private cink!: ConsoleInk;
    /** The console ink with the label plate lit in the alert colour, index 1 and 2. */
    private hotInk: ConsoleInk[] = [];
    private lay!: ConsoleLayout;
    private mon!: Monitor;
    /** The key of the member that fired last, and its cast name while it is on stage. */
    private lastFired = '';
    private lastName = '--';
    private audience = 0;
    private plateLit = false;

    layout(s: VizServices): void {
        this.ink = bakeInk(s.theme);
        this.colors.clear();
        const lay = layoutConsole(s);
        this.lay = lay;
        const cink = bakeConsoleInk(s.theme);
        this.cink = cink;
        this.hotInk = [cink, {...cink, bg: alertColor(cink, 1), label: cink.onAlert}, {...cink, bg: alertColor(cink, 2), label: cink.onAlert}];
        const pic = pictureRect(lay);
        const gap = lay.margin * 0.6;
        const fit = fitMonitor({x: pic.x + gap, y: pic.y + gap, w: pic.w - 2 * gap, h: pic.h - 2 * gap});
        // A bezel round the picture, not a plate the size of the slot.
        const bezel = Math.round(lay.margin * 0.5);
        this.mon = {...fit, x: fit.bx - bezel, y: fit.by - bezel, w: fit.bw + 2 * bezel, h: fit.bh + 2 * bezel};
        this.field.invalidate();
    }

    update(dt: number, s: VizServices): void {
        this.alert.update(dt, s);
        const field = this.field;
        field.update(dt, s);
        if (field.restarted) {
            this.poses.clear();
            this.locked.clear();
            this.seenBar.clear();
            this.hats.clear();
            this.spots.clear();
            this.thump = 0;
            this.twinkle = 0;
            this.lastFired = '';
            this.lastName = '--';
            this.zeroKit();
        }
        const bar = Math.max(0, Math.floor(field.cycle));
        for (const team of field.teams) {
            if (team.present || team.fade > 0.1) this.seenBar.set(team.name, bar);
        }
        this.audience = audienceAt(bar);
        this.plateLit = this.alert.level <= 2 && (Math.floor(field.cycle * PLATE_BLINK) & 1) === 0;
        const decay = Math.exp(-dt * 8);
        this.thump *= Math.exp(-dt * 9);
        this.twinkle *= Math.exp(-dt * 5);
        for (const piece of PIECES) this.kit[piece] *= decay;
        for (const pose of this.poses.values()) {
            if (field.cycle < pose.hold) pose.hit = 1;
            else pose.hit *= decay;
        }

        const bursts = new Map<string, Burst>();
        // The last firer this tick: the latest onset, lowest slot on a tie, so the pick does not depend on hap order.
        let last: Note | null = null;
        for (const h of field.haps) {
            if (!field.crossed(h)) continue;
            h.done = true;
            h.team.activity = 1;
            if (!last || h.begin > last.begin || (h.begin === last.begin && h.team.slot < last.team.slot)) last = h;
            const cast = this.castOf(h.team);
            if (cast === 'santa') {
                this.hitDrum(h);
                continue;
            }
            const key = cast === 'reindeer' ? teamKey(h.team.name) : h.team.name;
            let burst = bursts.get(key);
            if (!burst) {
                burst = {long: true, end: h.end, lift: 0.5, pitched: false};
                bursts.set(key, burst);
            }
            if (!isLong(h.begin, h.end)) burst.long = false;
            if (h.end > burst.end) burst.end = h.end;
            if (Number.isFinite(h.note)) {
                const lift = registerPos(h.note);
                burst.lift = burst.pitched ? Math.max(burst.lift, lift) : lift;
                burst.pitched = true;
            }
        }
        if (last) {
            const cast = this.castOf(last.team);
            this.lastFired = cast === 'santa'
                ? '*kit'
                : cast === 'carollers'
                    ? '*choir'
                    : cast === 'reindeer'
                        ? teamKey(last.team.name)
                        : last.team.name;
        }
        for (const [name, burst] of bursts) {
            const pose = this.poseFor(name);
            pose.hit = 1;
            if (burst.pitched) pose.lift = burst.lift;
            if (burst.long) pose.hold = burst.end;
            else {
                pose.hold = 0;
                pose.frame = (pose.frame + 1) % 3;
            }
        }
        this.assemble(dt);
    }

    private hitDrum(h: Note): void {
        const piece = kitPiece(h.team.name, h.note);
        const pose = this.poseFor('*kit');
        pose.hit = 1;
        // A rest or an unnamed hit still flashes the hands. It does not pick a pose.
        if (piece === 'other') return;
        this.kit[piece] = 1;
        this.kitTeam[piece] = h.team.name;
        if (piece === 'kick') this.thump = 1;
        else if (piece === 'hat') this.twinkle = 1;
        else if (piece === 'tom') this.kit.floorTom = /^lt/.test(voiceOf(h.team.name));
        else if (piece === 'snare') this.kit.snareHand = 1 - this.kit.snareHand;
    }

    /** Lock the cast once a bare oscillator has played a pitch; named sounds lock at once. */
    private castOf(team: Team): Cast {
        const known = this.locked.get(team.name);
        if (known) return known;
        let note = NaN;
        let chord = false;
        for (const h of this.field.haps) {
            if (h.team !== team || !Number.isFinite(h.note)) continue;
            if (!Number.isFinite(note) || h.note < note) note = h.note;
            if (!chord) {
                for (const o of this.field.haps) {
                    if (o !== h && o.team === team && o.begin === h.begin && o.note !== h.note && Number.isFinite(o.note)) {
                        chord = true;
                        break;
                    }
                }
            }
        }
        const cast = castFor(team.name, note, chord);
        if (!isOscillator(team.name) || Number.isFinite(note)) this.locked.set(team.name, cast);
        return cast;
    }

    /** Elves on stage keep their hat; a newcomer takes the first free colour. Leaving gives it back. */
    private dress(picked: readonly Cand[]): void {
        const staged = new Set<string>();
        for (const cand of picked) {
            if (cand.cast === 'elf' || cand.cast === 'guitarist') staged.add(cand.name);
        }
        for (const name of [...this.hats.keys()]) {
            if (!staged.has(name)) this.hats.delete(name);
        }
        const worn = new Set(this.hats.values());
        for (const cand of picked) {
            if ((cand.cast !== 'elf' && cand.cast !== 'guitarist') || this.hats.has(cand.name)) continue;
            let hat = 0;
            while (hat < HATS - 1 && worn.has(hat)) hat++;
            this.hats.set(cand.name, hat);
            worn.add(hat);
        }
    }

    /** Slot `index` of `n`, centred. A newcomer starts on its slot; everyone else walks over. */
    private walk(name: string, index: number, n: number, dt: number): number {
        const gap = n > 1 ? Math.min(MAX_GAP, STAGE_W / (n - 1)) : 0;
        const slot = PW / 2 + (index - (n - 1) / 2) * gap;
        const now = this.spots.get(name);
        const x = now === undefined ? slot : slot + (now - slot) * Math.exp(-dt * WALK);
        this.spots.set(name, x);
        return Math.round(x);
    }

    private poseFor(key: string): Pose {
        let pose = this.poses.get(key);
        if (!pose) {
            pose = {frame: 0, hit: 0, lift: 0.5, hold: 0};
            this.poses.set(key, pose);
        }
        return pose;
    }

    private zeroKit(): void {
        for (const piece of PIECES) {
            this.kit[piece] = 0;
            this.kitTeam[piece] = '';
        }
        this.kit.snareHand = 0;
        this.kit.floorTom = false;
    }

    private colorOf(rgb: Rgb): string {
        return nearest(rgb, this.ink.pool, this.colors);
    }

    private assemble(dt: number): void {
        const bar = Math.max(0, Math.floor(this.field.cycle));
        const cands: Cand[] = [];
        const choir: Team[] = [];
        const reindeerMap = new Map<string, Team>();
        let drum: Cand | null = null;
        let drumActivity = -1;
        let drumTeam: Team | null = null;
        for (const team of this.field.teams) {
            const lastSeen = this.seenBar.get(team.name) ?? -999;
            if (!team.present && team.fade <= 0 && bar - lastSeen > HOLD_BARS) continue;
            const cast = this.castOf(team);
            if (cast === 'santa') {
                if (!drum) drum = {name: '*kit', cast, team};
                if (
                    team.activity > drumActivity
                    || (team.activity === drumActivity && drumTeam !== null && team.name < drumTeam.name)
                ) {
                    drumActivity = team.activity;
                    drumTeam = team;
                }
                continue;
            }
            if (cast === 'carollers') {
                choir.push(team);
                continue;
            }
            if (cast === 'reindeer') {
                const key = teamKey(team.name);
                const prev = reindeerMap.get(key);
                if (!prev || team.activity > prev.activity) reindeerMap.set(key, team);
                continue;
            }
            cands.push({name: team.name, cast, team});
        }
        for (const [key, team] of reindeerMap) {
            cands.push({name: key, cast: 'reindeer', team});
        }
        if (choir.length) {
            choir.sort((a, b) => a.name.localeCompare(b.name));
            cands.push({name: '*choir', cast: 'carollers', team: null});
        }
        cands.sort((a, b) => RANK[a.cast] - RANK[b.cast] || a.name.localeCompare(b.name));

        // Promote duplicate casts to unused character costumes so the band has maximum visual variety.
        const usedCasts = new Set<Cast>(cands.map((c) => c.cast));
        const first: Cand[] = [];
        const extra: Cand[] = [];
        const seen = new Set<Cast>();
        for (const cand of cands) {
            if (!seen.has(cand.cast)) {
                seen.add(cand.cast);
                first.push(cand);
                continue;
            }
            const alts = PROMOTE[cand.cast];
            let promoted = false;
            if (alts) {
                for (const alt of alts) {
                    if (!usedCasts.has(alt)) {
                        cand.cast = alt;
                        usedCasts.add(alt);
                        seen.add(alt);
                        first.push(cand);
                        promoted = true;
                        break;
                    }
                }
            }
            if (!promoted) extra.push(cand);
        }
        first.sort((a, b) => RANK[a.cast] - RANK[b.cast] || a.name.localeCompare(b.name));
        extra.sort((a, b) => EXTRA[a.cast] - EXTRA[b.cast] || a.name.localeCompare(b.name));
        const staged = drum ? [drum, ...first, ...extra] : [...first, ...extra];
        const picked = staged.slice(0, CAP);
        const front = picked.filter((c) => c.cast !== 'santa');
        this.dress(picked);
        const ink = this.ink;
        this.members.length = 0;
        this.stockings.length = 0;
        for (const cand of picked) {
            const singers: Singer[] = [];
            let accentTeam = cand.cast === 'santa' ? drumTeam : cand.team;
            let activity = cand.cast === 'santa' ? Math.max(0, drumActivity) : (cand.team?.activity ?? 0);
            if (cand.cast === 'carollers') {
                for (const team of choir.slice(0, MAX_SINGERS)) {
                    const pose = this.poseFor(team.name);
                    singers.push({
                        accent: this.colorOf(team.rgb),
                        frame: pose.frame,
                        hit: pose.hit,
                        lift: pose.lift,
                        held: this.field.cycle < pose.hold,
                    });
                    if (team.activity > activity) {
                        activity = team.activity;
                        accentTeam = team;
                    }
                }
                if (!accentTeam) accentTeam = choir[0];
            }
            const pose = this.poseFor(cand.name);
            const x = cand.cast === 'santa' ? PW / 2 : this.walk(cand.name, front.indexOf(cand), front.length, dt);
            const accent = accentTeam ? this.colorOf(accentTeam.rgb) : ink.gold;
            this.members.push({
                key: cand.name,
                cast: cand.cast,
                variant: this.hats.get(cand.name) ?? 0,
                x,
                foot: cand.cast === 'santa' ? BACK_FOOT : FRONT_FOOT,
                accent,
                activity,
                frame: pose.frame,
                hit: pose.hit,
                lift: pose.lift,
                held: this.field.cycle < pose.hold,
                singers,
            });
            if (cand.cast !== 'santa') this.stockings.push(accent);
        }
        this.paintKitColors(ink.gold);
        const fired = this.members.find((m) => m.key === this.lastFired);
        this.lastName = fired ? castName(fired.cast) : '--';
        const live = new Set(this.field.teams.map((t) => t.name));
        for (const key of reindeerMap.keys()) live.add(key);
        if (drum) live.add('*kit');
        if (choir.length) live.add('*choir');
        for (const key of [...this.spots.keys()]) {
            if (!front.some((c) => c.name === key)) this.spots.delete(key);
        }
        for (const key of [...this.poses.keys()]) {
            if (!live.has(key)) this.poses.delete(key);
        }
    }

    private paintKitColors(fallback: string): void {
        for (const piece of PIECES) {
            const team = this.field.teams.find((t) => t.name === this.kitTeam[piece]);
            const css = team ? this.colorOf(team.rgb) : fallback;
            if (piece === 'kick') this.kit.kickCss = css;
            else if (piece === 'snare') this.kit.snareCss = css;
            else if (piece === 'hat') this.kit.hatCss = css;
            else if (piece === 'tom') this.kit.tomCss = css;
            else this.kit.crashCss = css;
        }
    }

    render(ctx: CanvasRenderingContext2D, s: VizServices): void {
        const p = this.screen.ctx;
        const ink = this.ink;
        const hop = this.thump > 0.5 ? 1 : 0;
        p.setTransform(1, 0, 0, 1, 0, 0);
        p.imageSmoothingEnabled = false;
        p.fillStyle = ink.bg;
        p.fillRect(0, 0, PW, PH);
        p.setTransform(1, 0, 0, 1, 0, hop);
        drawBackdrop(p, ink, s.cycle, this.thump, this.twinkle, this.stockings);
        drawFloor(p, ink, this.thump);
        for (const m of this.members) {
            if (m.cast !== 'santa') continue;
            drawPerformer(p, m.cast, m.variant, m.x, m.foot, m.frame, m.hit, m.lift, m.held, m.accent, ink, this.kit);
        }
        for (const m of this.members) {
            if (m.cast === 'santa') continue;
            drawPerformer(p, m.cast, m.variant, m.x, m.foot, m.frame, m.hit, m.lift, m.held, m.accent, ink, undefined, m.singers);
        }
        drawFootlights(p, this.members, ink);
        p.setTransform(1, 0, 0, 1, 0, 0);
        if (hop) {
            p.fillStyle = ink.line;
            p.fillRect(0, 0, PW, 1);
        }

        const cink = this.cink;
        const level = this.alert.level;
        ctx.save();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        ctx.fillStyle = cink.bg;
        ctx.fillRect(0, 0, s.width, s.height);
        drawMonitor(ctx, this.screen, this.mon, this.plateLit ? this.hotInk[level] : cink, level, MONITOR_LABEL, this.lay.small);
        drawStrip(ctx, this.lay, cink, this.stripCells());
        drawConsole(ctx, s, this.lay, cink, this.alert, STATION);
        ctx.restore();
    }

    /** LINK, AUDIENCE, ON STAGE, LAST, MORALE. */
    private stripCells(): StripCell[] {
        const cink = this.cink;
        const level = this.alert.level;
        const locked = this.field.locked;
        return [
            {label: 'LINK', value: locked ? 'LOCKED' : 'NO SIGNAL', color: locked ? cink.value : cink.labelDim},
            {label: 'AUDIENCE', value: group(this.audience)},
            {label: 'ON STAGE', value: String(this.members.length).padStart(2, '0')},
            {label: 'LAST', value: this.lastName},
            {label: 'MORALE', value: moraleTag(level), meter: level / 5, color: alertColor(cink, level, 0.85)},
        ];
    }
}

function drawFootlights(ctx: CanvasRenderingContext2D, members: readonly Member[], ink: Ink): void {
    for (const m of members) {
        const on = m.activity > 0.18;
        const w = on ? 14 : 8;
        ctx.fillStyle = ink.line;
        ctx.fillRect(m.x - (w >> 1) - 1, LIGHT_Y - 1, w + 2, (on ? 4 : 2) + 2);
        ctx.fillStyle = on ? m.accent : ink.floorLine;
        ctx.fillRect(m.x - (w >> 1), LIGHT_Y, w, on ? 4 : 2);
        if (on) {
            ctx.fillStyle = ink.snow;
            ctx.fillRect(m.x - 2, LIGHT_Y, 4, 2);
        }
    }
}

export const christmasBandDef: VizModeDef = {
    id: 'christmas-band',
    name: 'MORALE FEED',
    create: () => new ChristmasBandMode(),
};
