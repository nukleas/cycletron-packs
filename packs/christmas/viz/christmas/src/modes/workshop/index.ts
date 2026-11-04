/**
 * PRODUCTION — station STN-02 of the SLEIGHCON ops room. An isometric toy
 * factory fills the console body, and a readout strip under it reads the
 * line's numbers off the same state.
 *
 * The floor: each pitched track has a bench, placed by slot, front row and
 * back row in turn, with an elf in a hat of the track's colour who raises an
 * arm on its onsets. A pitched note loads a blank onto the belt, a plain box
 * in a dull shade of the track's colour. The belt steps one slot a beat, and
 * every blank dwells a beat under the press: the die comes down on it,
 * flattens it and throws chips in its colour, and it leaves as a toy in the
 * full colour: low notes a train or horse, mid a bear or blocks, high a star
 * or doll, with a bow on a held note. The toys tip into the bin by the dock,
 * where the sleigh's sack fills. Kicks also drop the press and flash the
 * floor under it, toms half-drop it, snares throw sparks off the anvil at the
 * hammer bench, hats
 * flicker the ceiling lamps and a crash flares them all. The forklift laps
 * the floor every four bars with a crate in the colour of the last track
 * that fired; the windows snow and the sign counts down with the bar. At
 * SLEIGHCON 2 and below the lamps and the sign run in the alert colour; at 1
 * the belt gets a hazard edge and the floor grid pulses on the beat; at 5 the
 * floor wears a NOMINAL tag.
 *
 * The strip: UNITS/HR is last bar's stamped toys scaled to an hour at the
 * bpm, QUOTA a meter that fills with the alert level, BELT RUNNING or IDLE
 * with the field lock, PRESS STRIKE while the die is down (else ARMED),
 * STAMPED the toys out of the press this bar, BACKLOG the blanks the belt
 * could not take this bar, LAST the newest toy stamped. At SLEIGHCON 2 and
 * below the values flash.
 *
 * Spawns, counters, sparks and envelopes (the thump, the strike) run in
 * update(); the belt, the forklift, the snow, the lamp flicker and blank or
 * toy are functions of the cycle. The belt steps into each beat and lands
 * on it, so the strike is on the beat.
 */

import type {VizMode, VizModeDef, VizServices} from '@cycletron/viz-sdk';
import {type FieldHap, type FieldTeam, HapField, type Rgb} from '@cycletron/viz-sdk';
import {clamp01, drawLabel, hash32, rampAt, rand01, TAU} from '@cycletron/viz-sdk';
import {Alert} from '../../lib/console/alert.js';
import {
    alertColor, bakeConsoleInk, type ConsoleInk, type ConsoleLayout, drawConsole, layoutConsole, type Rect,
    type Station,
} from '../../lib/console/chrome.js';
import {group} from '../../lib/console/panel.js';
import {drawStrip, pictureRect} from '../../lib/console/strip.js';
import {bakeInk, type Ink, nearestIndex} from './ink.js';
import {box, cone, diamond, ISO_W, quad, type Shade, star, View} from '../../lib/iso.js';
import {drumRole, workshopRole} from './roles.js';
import {type Role, isLong} from '@naderlabs/pixel-kit/roles';

const LOOKAHEAD = 2;
const MAX_HAPS = 800;
const MAX_PER_TRACK = 96;
const DRUM_CAP = 64;
const IDLE_RATE = 0.25;
const MAX_TOYS = 40;
const MAX_SPARKS = 48;
const SPARKS_PER_HIT = 8;
/** Toys a beat, over every track. */
const TOYS_PER_BEAT = 2;
const PUFF_LIFE = 0.1;
const STATION: Station = {code: 'STN-02', name: 'PRODUCTION'};
/** The press reads STRIKE while the die's drop is above this. */
const STRIKE_HOLD = 0.25;

// The floor, in tiles: i runs down-right to the dock, j down-left to the front.
const FLOOR_I = 12.4;
const FLOOR_J = 9;
const WALL_H = 3.6;
const DOCK_I = 16.95;
const DOCK_J0 = 2.2;
const DOCK_J1 = 6.8;
const BELT_I0 = 2.4;
const BELT_I1 = 10.2;
const BELT_J0 = 3.9;
const BELT_J1 = 5.1;
const BELT_K = 0.6;
/** The die is centred on PRESS_X; every toy dwells there one beat. */
const PRESS_X = 6.7;
const PRESS_I = PRESS_X - 0.4;
/** The die's bottom at rest, over the belt, and its travel at full drop (to a flattened blank). */
const DIE_REST = 0.9;
const DIE_TRAVEL = 0.81;
/** Toys this close to PRESS_X are under the die and squash with it. */
const DIE_REACH = 0.4;
const SQUASH = 0.55;
/** Toys load here, so they rest on whole slots from it, PRESS_X among them. */
const LOAD_I = PRESS_X - 4;
const BLANK_H = 0.2;
const CHIPS_PER_STRIKE = 4;
const EPS = 1e-6;
const LAMP_I: readonly number[] = [2.0, 4.3, 9.0, 11.3];
const LAMP_J = 4.5;
const LAMP_K = 3.3;
const WINDOWS: readonly (readonly [number, number])[] = [[0.6, 2.0], [2.5, 3.9], [8.9, 10.3], [10.8, 12.2]];
const SIGN_I0 = 4.7;
const SIGN_I1 = 7.9;
const BENCH_W = 1.3;
const BENCH_D = 0.6;
/** Bench spots in seating order, front and back in turn, left to right. The hammer bench is the last back spot. */
const SPOTS: readonly {i: number; front: boolean}[] = [
    {i: 1.6, front: true}, {i: 1.6, front: false}, {i: 3.6, front: true}, {i: 3.6, front: false},
    {i: 5.6, front: true}, {i: 5.6, front: false}, {i: 7.6, front: true}, {i: 7.6, front: false},
    {i: 9.6, front: true},
];
const HAMMER_I = 9.6;
/** The forklift's loop: back aisle, left side, front aisle, right side. */
const LOOP: readonly (readonly [number, number])[] = [[11.6, 2.6], [0.9, 2.6], [0.9, 6.1], [11.6, 6.1]];
const LOOP_BARS = 4;
/** Toys shipped per sack. */
const SACK = 24;
/** The scene's extremes, for the fit: wall tops, floor and dock corners, lamp cords. */
const EXTENT: readonly number[] = [
    0, 0, WALL_H + 0.4, FLOOR_I, 0, WALL_H + 0.4, 0, FLOOR_J, WALL_H + 0.4,
    0, FLOOR_J, 0, FLOOR_I, FLOOR_J, 0, 16.2, DOCK_J0, 0, 16.2, DOCK_J1, 0,
];

type ToyKind = 'TRAIN' | 'HORSE' | 'BEAR' | 'BLOCKS' | 'STAR' | 'DOLL';
const LOW_TOYS: readonly ToyKind[] = ['TRAIN', 'HORSE'];
const MID_TOYS: readonly ToyKind[] = ['BEAR', 'BLOCKS'];
const HIGH_TOYS: readonly ToyKind[] = ['STAR', 'DOLL'];

interface Team extends FieldTeam {
    /** The drum this track is, or null for a pitched one. */
    drum: Role | null;
    /** Arm raise, bumped on onsets. */
    swing: number;
    /** SPOTS index, or -1 with no bench. */
    spot: number;
    /** Beat of the last toy, so a run of notes is one toy a beat. */
    lastSpawn: number;
}

interface Hap extends FieldHap<Team> {
    role: Role;
}

interface Toy {
    i0: number;
    b0: number;
    j: number;
    kind: ToyKind;
    role: Role;
    seed: number;
    color: number;
    begin: number;
    long: boolean;
    /** Set once in update(), for the chips and the counters; drawing reads toyI. */
    struck: boolean;
    stamped: boolean;
}

interface Spark {
    i: number;
    j: number;
    k: number;
    vi: number;
    vj: number;
    vk: number;
    age: number;
    /** A chip's colour, or null for an anvil spark. */
    color: string | null;
}

/** One thing on the floor to paint in depth order. */
interface Item {
    depth: number;
    draw: () => void;
}

class WorkshopMode implements VizMode {
    private readonly alert = new Alert();
    private readonly field = new HapField<Team, Hap>({
        lookahead: LOOKAHEAD,
        maxHaps: MAX_HAPS,
        maxPerTrack: MAX_PER_TRACK,
        idleRate: IDLE_RATE,
        team: (base) => ({...base, drum: drumRole(base.name), swing: 0, spot: -1, lastSpawn: -1}),
        hap: (base) => ({...base, role: workshopRole(base.team.name, base.note)}),
        cap: (_team, note) => (Number.isFinite(note) ? Infinity : DRUM_CAP),
        recolor: (team) => {
            const pool = this.ink.pool;
            return pool[team.slot % pool.length];
        },
        keep: (h, cycle) => h.end + 0.1 >= cycle,
    });
    private readonly view = new View();
    private readonly toys: Toy[] = [];
    private readonly sparks: Spark[] = [];
    private readonly colors = new Map<number, number>();
    private readonly seated: Team[] = [];
    private readonly pending: Hap[] = [];
    private readonly items: Item[] = [];
    /** Toys in depth order, rebuilt each frame. */
    private readonly order: Toy[] = [];
    private ink!: Ink;
    private cink!: ConsoleInk;
    private lay!: ConsoleLayout;
    /** Where the floor is drawn. */
    private scene!: Rect;
    private thump = 0;
    private flicker = 0;
    private flash = 0;
    private hammer = 0;
    private puffAge = 1;
    private pressPuffAge = 1;
    /** The strike, set as a blank lands under the die, decaying like the thump. */
    private press = 0;
    /** The colour of the last track that fired, for the forklift's crate. */
    private lastRgb: Rgb | null = null;
    private shipped = 0;
    private seatBar = -1;
    private seatCount = -1;
    private spawnBeat = -1;
    private spawnCount = 0;
    /** Readout counters: toys stamped this bar and last bar, drops this bar. */
    private countBar = -1;
    private barStamped = 0;
    private lastBarStamped = 0;
    private backlog = 0;
    /** The newest toy out of the press, for the strip's LAST cell. */
    private lastStamp = '';
    /** Values blink while the alert is hot, hashed by the eighth of a bar. */
    private flashOn = false;

    layout(s: VizServices): void {
        const lay = layoutConsole(s);
        this.lay = lay;
        const p = pictureRect(lay);
        const m = lay.margin;
        this.scene = {x: p.x + m * 0.5, y: p.y + m * 0.6, w: p.w - m, h: p.h - m * 1.2};
        this.view.fit(this.scene, EXTENT);
        this.cink = bakeConsoleInk(s.theme);
        this.ink = bakeInk(s.theme);
        this.view.line = this.ink.line;
        this.colors.clear();
        this.field.invalidate();
    }

    update(dt: number, s: VizServices): void {
        this.alert.update(dt, s);
        const field = this.field;
        field.update(dt, s);
        if (field.restarted) {
            this.toys.length = 0;
            this.sparks.length = 0;
            this.thump = 0;
            this.flicker = 0;
            this.flash = 0;
            this.hammer = 0;
            this.puffAge = 1;
            this.pressPuffAge = 1;
            this.press = 0;
            this.lastRgb = null;
            this.shipped = 0;
            this.seatBar = -1;
            this.spawnBeat = -1;
            this.countBar = -1;
            this.barStamped = 0;
            this.lastBarStamped = 0;
            this.backlog = 0;
            this.lastStamp = '';
        }
        const cycle = field.cycle;
        const bar = Math.floor(cycle);
        if (bar !== this.countBar) {
            // A fresh bar: last bar's count feeds UNITS/HR, this bar starts at zero.
            this.lastBarStamped = this.countBar < 0 ? 0 : this.barStamped;
            this.barStamped = 0;
            this.backlog = 0;
            this.countBar = bar;
        }
        for (const h of field.haps) {
            if (!field.crossed(h)) continue;
            h.done = true;
            const team = h.team;
            team.activity = 1;
            team.swing = 1;
            this.lastRgb = team.rgb;
            switch (h.role) {
                case 'kick':
                    this.thump = 1;
                    break;
                case 'tom': this.thump = Math.max(this.thump, 0.5); break;
                case 'snare':
                    this.hammer = 1;
                    this.spawnSparks(h.seed);
                    break;
                case 'hat': this.flicker = 1; break;
                case 'crash': this.flash = 1; break;
                case 'perc': break;
                default: this.pending.push(h); break;
            }
        }
        // The melody gets the belt first, then the middle, then the bass.
        this.pending.sort((a, b) => rank(b.role) - rank(a.role) || a.team.slot - b.team.slot);
        for (const h of this.pending) this.spawnToy(h, cycle);
        this.pending.length = 0;
        if (bar !== this.seatBar || field.teams.length !== this.seatCount) this.seat(bar);
        this.flashOn = this.alert.level <= 2 && (hash32(Math.floor(cycle * 8), 23) & 1) === 0;

        const k = Math.exp(-dt * 7);
        for (const t of field.teams) t.swing *= k;
        for (let n = this.toys.length - 1; n >= 0; n--) {
            const t = this.toys[n];
            const i = toyI(t, cycle);
            if (!t.struck && i >= PRESS_X - EPS) {
                // The die lands on the blank as it comes to rest under it, on the beat.
                t.struck = true;
                this.press = 1;
                this.pressPuffAge = 0;
                this.spawnChips(t);
            }
            if (!t.stamped && isStamped(i)) {
                t.stamped = true;
                this.barStamped++;
                this.lastStamp = t.kind;
            }
            if (i < BELT_I1) continue;
            this.toys.splice(n, 1);
            this.shipped++;
        }
        for (let n = this.sparks.length - 1; n >= 0; n--) {
            const p = this.sparks[n];
            p.age += dt;
            p.i += p.vi * dt;
            p.j += p.vj * dt;
            p.k += p.vk * dt;
            p.vk -= 9 * dt;
            if (p.age > 0.5 || p.k < 0) this.sparks.splice(n, 1);
        }
        this.thump *= Math.exp(-dt * 9);
        this.press *= Math.exp(-dt * 9);
        this.flicker *= Math.exp(-dt * 6);
        this.flash *= Math.exp(-dt * 5);
        this.hammer *= k;
        this.puffAge = Math.min(1, this.puffAge + dt);
        this.pressPuffAge = Math.min(1, this.pressPuffAge + dt);
    }

    /** A burst off the anvil, seeded by the hap. */
    private spawnSparks(seed: number): void {
        for (let n = 0; n < SPARKS_PER_HIT; n++) this.pushSpark(HAMMER_I + 0.9, 1.3, 0.75, seed, n, null);
    }

    /** Chips in the toy's colour off the die, seeded by its hap. */
    private spawnChips(t: Toy): void {
        const seed = hash32(t.seed, 7);
        const color = this.ink.poolShade[t.color].top;
        for (let c = 0; c < CHIPS_PER_STRIKE; c++) this.pushSpark(PRESS_X, t.j, BELT_K + 0.12, seed, c, color);
    }

    private pushSpark(i: number, j: number, k: number, seed: number, n: number, color: string | null): void {
        if (this.sparks.length >= MAX_SPARKS) this.sparks.shift();
        const a = rand01(hash32(seed, 40 + n)) * TAU;
        const sp = 1.2 + rand01(hash32(seed, 60 + n)) * 1.8;
        this.sparks.push({
            i, j, k, vi: Math.cos(a) * sp, vj: Math.sin(a) * sp, vk: 2 + rand01(hash32(seed, 80 + n)) * 2.5, age: 0, color,
        });
    }

    /**
     * One blank a beat per track, and two a beat in all, so the belt keeps up.
     * A blank the belt cannot take (the beat is full, or the belt is) is backlog.
     */
    private spawnToy(h: Hap, cycle: number): void {
        const team = h.team;
        const beat = Math.floor(h.begin * 4);
        if (team.lastSpawn === beat) return;
        if (beat !== this.spawnBeat) {
            this.spawnBeat = beat;
            this.spawnCount = 0;
        }
        if (this.spawnCount >= TOYS_PER_BEAT) {
            this.backlog++;
            return;
        }
        const at = this.spawnCount++;
        team.lastSpawn = beat;
        const set = h.role === 'bass' ? LOW_TOYS : h.role === 'mid' ? MID_TOYS : HIGH_TOYS;
        const kind = set[Math.floor(rand01(hash32(h.seed, 3)) * set.length)];
        if (this.toys.length >= MAX_TOYS) {
            this.toys.shift();
            this.backlog++;
        }
        // A beat's two blanks load side by side, one per lane, on the belt's last whole slot.
        this.toys.push({
            i0: LOAD_I,
            b0: Math.floor(beltOffset(cycle)),
            j: at ? 4.75 : 4.25,
            kind,
            role: h.role,
            seed: h.seed,
            color: this.colorOf(team.rgb),
            begin: h.begin,
            long: isLong(h.begin, h.end),
            struck: false,
            stamped: false,
        });
        this.puffAge = 0;
    }

    /** A bench for each pitched track present, by slot. */
    private seat(bar: number): void {
        const teams = this.field.teams;
        this.seatBar = bar;
        this.seatCount = teams.length;
        for (const t of teams) t.spot = -1;
        const order = teams.filter((t) => t.present && t.drum === null && t.pitched).sort((a, b) => a.slot - b.slot);
        this.seated.length = 0;
        for (let n = 0; n < order.length && n < SPOTS.length; n++) {
            order[n].spot = n;
            this.seated.push(order[n]);
        }
    }

    render(ctx: CanvasRenderingContext2D, s: VizServices): void {
        const cink = this.cink;
        ctx.save();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.fillStyle = cink.bg;
        ctx.fillRect(0, 0, s.width, s.height);
        this.drawScene(ctx);
        this.drawReadout(ctx, s);
        drawConsole(ctx, s, this.lay, cink, this.alert, STATION);
        ctx.restore();
    }

    /** Walls, floor, then the back of the floor, the belt, the lamps and the front, far to near. */
    private drawScene(ctx: CanvasRenderingContext2D): void {
        const cycle = this.field.cycle;
        this.drawWalls(ctx, cycle);
        this.drawFloor(ctx, cycle);

        const items = this.items;
        items.length = 0;
        const benchCount = Math.max(6, this.seated.length);
        // Behind the belt: back benches, the hammer bench, the press's back post, the forklift on its back half.
        for (let s = 0; s < benchCount && s < SPOTS.length; s++) {
            if (!SPOTS[s].front) this.pushSpot(ctx, s, this.seated[s] ?? null, cycle);
        }
        items.push({depth: HAMMER_I + 0.65 + 1.3, draw: () => this.drawBench(ctx, HAMMER_I, false, null, this.hammer, true, 8, cycle)});
        items.push({depth: PRESS_I + 0.4 + 3.5, draw: () => this.drawPost(ctx, 3.4)});
        const fork = forkAt(cycle);
        if (fork.seg < 2) items.push({depth: fork.i + fork.j, draw: () => this.drawForklift(ctx, fork, cycle)});
        this.flush();

        this.drawBelt(ctx, cycle);
        this.drawSparks(ctx);
        this.drawLamps(ctx, cycle);

        for (let s = 0; s < benchCount && s < SPOTS.length; s++) {
            if (SPOTS[s].front) this.pushSpot(ctx, s, this.seated[s] ?? null, cycle);
        }
        items.push({depth: PRESS_I + 0.4 + 5.3, draw: () => this.drawPost(ctx, 5.2)});
        if (fork.seg >= 2) items.push({depth: fork.i + fork.j, draw: () => this.drawForklift(ctx, fork, cycle)});
        this.flush();

        this.drawDock(ctx, cycle);
        if (this.alert.level === 5) this.drawTag(ctx, 'LINE A · NOMINAL');
    }

    private flush(): void {
        this.items.sort((a, b) => a.depth - b.depth);
        for (const it of this.items) it.draw();
        this.items.length = 0;
    }

    private pushSpot(ctx: CanvasRenderingContext2D, spotIdx: number, t: Team | null, cycle: number): void {
        const spot = SPOTS[spotIdx];
        const idle = this.field.locked ? Math.max(0, Math.sin(cycle * TAU * 2 + spotIdx * 1.35)) * 0.28 : 0;
        const swing = t ? Math.max(t.swing, idle * 0.6) : idle;
        this.items.push({
            depth: spot.i + 0.65 + (spot.front ? 7.2 : 1.3),
            draw: () => this.drawBench(ctx, spot.i, spot.front, t, swing, false, spotIdx, cycle),
        });
    }

    private drawWalls(ctx: CanvasRenderingContext2D, cycle: number): void {
        const v = this.view;
        const ink = this.ink;
        const hot = this.alert.level <= 2;
        // Back wall faces +j, the left wall +i.
        quad(ctx, v, [0, 0, 0, FLOOR_I, 0, 0, FLOOR_I, 0, WALL_H, 0, 0, WALL_H], ink.wall.left);
        quad(ctx, v, [0, 0, 0, 0, FLOOR_J, 0, 0, FLOOR_J, WALL_H, 0, 0, WALL_H], ink.wall.right);
        ctx.strokeStyle = ink.plank;
        ctx.lineWidth = v.lw;
        ctx.beginPath();
        for (let k = 0.9; k < WALL_H; k += 0.9) {
            ctx.moveTo(v.x(0, FLOOR_J), v.y(0, FLOOR_J, k));
            ctx.lineTo(v.x(0, 0), v.y(0, 0, k));
            ctx.lineTo(v.x(FLOOR_I, 0), v.y(FLOOR_I, 0, k));
        }
        ctx.stroke();
        ctx.strokeStyle = ink.line;
        ctx.beginPath();
        ctx.moveTo(v.x(0, FLOOR_J), v.y(0, FLOOR_J, WALL_H));
        ctx.lineTo(v.x(0, 0), v.y(0, 0, WALL_H));
        ctx.lineTo(v.x(FLOOR_I, 0), v.y(FLOOR_I, 0, WALL_H));
        ctx.moveTo(v.x(0, 0), v.y(0, 0, 0));
        ctx.lineTo(v.x(0, 0), v.y(0, 0, WALL_H));
        ctx.stroke();

        // High windows, snow behind them a pure function of the cycle.
        const k0 = 1.8, k1 = 3.1;
        ctx.fillStyle = ink.night;
        ctx.beginPath();
        for (const [a, b] of WINDOWS) {
            ctx.moveTo(v.x(a, 0), v.y(a, 0, k0));
            ctx.lineTo(v.x(b, 0), v.y(b, 0, k0));
            ctx.lineTo(v.x(b, 0), v.y(b, 0, k1));
            ctx.lineTo(v.x(a, 0), v.y(a, 0, k1));
        }
        ctx.fill();
        const flake = Math.max(1, Math.round(v.scale * 1.6));
        ctx.fillStyle = ink.snow;
        ctx.beginPath();
        for (let w = 0; w < WINDOWS.length; w++) {
            const [a, b] = WINDOWS[w];
            for (let n = 0; n < 9; n++) {
                const seed = w * 16 + n;
                const speed = 0.25 + rand01(hash32(seed, 62)) * 0.3;
                const fall = (rand01(hash32(seed, 61)) + cycle * speed) % 1;
                const wob = Math.sin(cycle * TAU * 0.5 + n) * 0.08;
                const u = (((rand01(hash32(seed, 63)) + wob) % 1) + 1) % 1;
                const i = a + 0.05 + u * (b - a - 0.1);
                const k = k1 - 0.05 - fall * (k1 - k0 - 0.1);
                ctx.rect(Math.round(v.x(i, 0)), Math.round(v.y(i, 0, k)), flake, flake);
            }
        }
        ctx.fill();
        ctx.strokeStyle = ink.wood.right;
        ctx.lineWidth = Math.max(1, v.lw * 1.5);
        ctx.beginPath();
        for (const [a, b] of WINDOWS) {
            const m = (a + b) / 2, km = (k0 + k1) / 2;
            ctx.moveTo(v.x(a, 0), v.y(a, 0, k0));
            ctx.lineTo(v.x(b, 0), v.y(b, 0, k0));
            ctx.lineTo(v.x(b, 0), v.y(b, 0, k1));
            ctx.lineTo(v.x(a, 0), v.y(a, 0, k1));
            ctx.closePath();
            ctx.moveTo(v.x(m, 0), v.y(m, 0, k0));
            ctx.lineTo(v.x(m, 0), v.y(m, 0, k1));
            ctx.moveTo(v.x(a, 0), v.y(a, 0, km));
            ctx.lineTo(v.x(b, 0), v.y(b, 0, km));
        }
        ctx.stroke();

        // The DAYS TO XMAS sign, sheared onto the wall.
        const s0 = 1.95, s1 = 3.15;
        quad(ctx, v, [SIGN_I0, 0, s0, SIGN_I1, 0, s0, SIGN_I1, 0, s1, SIGN_I0, 0, s1], ink.sign);
        const level = this.alert.level;
        if (hot) quad(ctx, v, [SIGN_I0, 0, s0, SIGN_I1, 0, s0, SIGN_I1, 0, s1, SIGN_I0, 0, s1], alertColor(this.cink, level, 0.45));
        ctx.strokeStyle = hot ? alertColor(this.cink, level) : ink.gold.top;
        ctx.lineWidth = v.lw;
        ctx.beginPath();
        ctx.moveTo(v.x(SIGN_I0, 0), v.y(SIGN_I0, 0, s0));
        ctx.lineTo(v.x(SIGN_I1, 0), v.y(SIGN_I1, 0, s0));
        ctx.lineTo(v.x(SIGN_I1, 0), v.y(SIGN_I1, 0, s1));
        ctx.lineTo(v.x(SIGN_I0, 0), v.y(SIGN_I0, 0, s1));
        ctx.closePath();
        ctx.stroke();
        const days = daysToXmas(cycle);
        const mi = (SIGN_I0 + SIGN_I1) / 2;
        const unit = 22 * v.scale;
        ctx.save();
        ctx.translate(v.x(mi, 0), v.y(mi, 0, s1 - 0.28));
        ctx.transform(1, 0.5, 0, 1, 0, 0);
        drawLabel(ctx, 'DAYS TO XMAS', 0, 0, ink.snow, Math.max(6, Math.round(unit * 0.34)), 'center');
        ctx.restore();
        ctx.save();
        ctx.translate(v.x(mi, 0), v.y(mi, 0, s0 + 0.4));
        ctx.transform(1, 0.5, 0, 1, 0, 0);
        drawLabel(ctx, days === 0 ? 'XMAS!' : String(days), 0, 0, hot ? ink.snow : ink.signText, Math.max(8, Math.round(unit * 0.62)), 'center');
        ctx.restore();
    }

    private drawFloor(ctx: CanvasRenderingContext2D, cycle: number): void {
        const v = this.view;
        const ink = this.ink;
        const level = this.alert.level;
        quad(ctx, v, [0, 0, 0, FLOOR_I, 0, 0, FLOOR_I, FLOOR_J, 0, 0, FLOOR_J, 0], ink.floor);
        // The grid, pulsing on the beat at SLEIGHCON 1.
        const beat = cycle * 4 - Math.floor(cycle * 4);
        ctx.strokeStyle = level === 1 ? alertColor(this.cink, 1, 0.2 + 0.6 * (1 - beat) ** 3) : ink.grid;
        ctx.lineWidth = v.lw;
        ctx.beginPath();
        for (let i = 1; i < FLOOR_I; i++) {
            ctx.moveTo(v.x(i, 0), v.y(i, 0, 0));
            ctx.lineTo(v.x(i, FLOOR_J), v.y(i, FLOOR_J, 0));
        }
        for (let j = 1; j < FLOOR_J; j++) {
            ctx.moveTo(v.x(0, j), v.y(0, j, 0));
            ctx.lineTo(v.x(FLOOR_I, j), v.y(FLOOR_I, j, 0));
        }
        ctx.stroke();
        // Lamp pools, one path per brightness, and the press flash on a kick.
        for (const glow of [1, 2]) {
            let any = false;
            ctx.beginPath();
            for (let n = 0; n < LAMP_I.length; n++) {
                if (this.lampLit(n, cycle) !== glow) continue;
                any = true;
                const i = LAMP_I[n], r = 1.5;
                ctx.moveTo(v.x(i - r, LAMP_J - r), v.y(i - r, LAMP_J - r, 0));
                ctx.lineTo(v.x(i + r, LAMP_J - r), v.y(i + r, LAMP_J - r, 0));
                ctx.lineTo(v.x(i + r, LAMP_J + r), v.y(i + r, LAMP_J + r, 0));
                ctx.lineTo(v.x(i - r, LAMP_J + r), v.y(i - r, LAMP_J + r, 0));
            }
            if (!any) continue;
            ctx.fillStyle = rampAt(ink.glow, glow > 1 ? 0.16 : 0.07);
            ctx.fill();
        }
        if (this.thump > 0.05) diamond(ctx, v, PRESS_I + 0.4, LAMP_J, 1.8, rampAt(ink.glow, this.thump * 0.35));
        // The dock apron past the floor's edge, with its hazard line.
        quad(ctx, v, [FLOOR_I, DOCK_J0, 0, DOCK_I, DOCK_J0, 0, DOCK_I, DOCK_J1, 0, FLOOR_I, DOCK_J1, 0], ink.apron);
        ctx.fillStyle = ink.hazard;
        ctx.beginPath();
        for (let j = DOCK_J0; j < DOCK_J1 - 0.1; j += 0.5) {
            const a = j, b = Math.min(DOCK_J1, j + 0.25);
            ctx.moveTo(v.x(FLOOR_I, a), v.y(FLOOR_I, a, 0));
            ctx.lineTo(v.x(FLOOR_I, b), v.y(FLOOR_I, b, 0));
            ctx.lineTo(v.x(FLOOR_I + 0.18, b), v.y(FLOOR_I + 0.18, b, 0));
            ctx.lineTo(v.x(FLOOR_I + 0.18, a), v.y(FLOOR_I + 0.18, a, 0));
        }
        ctx.fill();
    }

    /** 0 dark, 1 on, 2 flare. Hats black out a bar-hashed half of the lamps; a crash flares them all. */
    private lampLit(n: number, cycle: number): number {
        if (this.flash > 0.4) return 2;
        if (this.flicker > 0.25 && (hash32(Math.floor(cycle * 32), n) & 1)) return 0;
        return 1;
    }

    private drawLamps(ctx: CanvasRenderingContext2D, cycle: number): void {
        const v = this.view;
        const ink = this.ink;
        const level = this.alert.level;
        const hot = level <= 2;
        const top = this.lay.body.y;
        ctx.strokeStyle = ink.line;
        ctx.lineWidth = v.lw;
        ctx.beginPath();
        for (const i of LAMP_I) {
            ctx.moveTo(v.x(i, LAMP_J), top);
            ctx.lineTo(v.x(i, LAMP_J), v.y(i, LAMP_J, LAMP_K + 0.4));
        }
        ctx.stroke();
        const unit = ISO_W * v.scale;
        for (let n = 0; n < LAMP_I.length; n++) {
            const i = LAMP_I[n];
            const x = v.x(i, LAMP_J), y = v.y(i, LAMP_J, LAMP_K);
            const lit = this.lampLit(n, cycle);
            const bulb = lit === 0 ? ink.lampDim : hot ? alertColor(this.cink, level) : ink.lamp;
            if (lit > 0) {
                // The light cone toward the floor.
                ctx.fillStyle = hot ? alertColor(this.cink, level, lit > 1 ? 0.2 : 0.1) : rampAt(ink.glow, lit > 1 ? 0.2 : 0.08);
                ctx.beginPath();
                ctx.moveTo(x - unit * 0.3, y);
                ctx.lineTo(x + unit * 0.3, y);
                ctx.lineTo(x + unit * 1.3, v.y(i, LAMP_J, 0) - unit * 0.4);
                ctx.lineTo(x - unit * 1.3, v.y(i, LAMP_J, 0) - unit * 0.4);
                ctx.fill();
            }
            ctx.fillStyle = bulb;
            ctx.beginPath();
            ctx.arc(x, y, unit * 0.12, 0, TAU);
            ctx.fill();
            // The shade over the bulb.
            ctx.fillStyle = ink.metalDark.left;
            ctx.beginPath();
            ctx.moveTo(x - unit * 0.32, y);
            ctx.lineTo(x + unit * 0.32, y);
            ctx.lineTo(x, y - unit * 0.3);
            ctx.fill();
        }
    }

    /** The hopper, the belt and its toys, the press and the bin. */
    private drawBelt(ctx: CanvasRenderingContext2D, cycle: number): void {
        const v = this.view;
        const ink = this.ink;
        const level = this.alert.level;
        box(ctx, v, 1.7, 3.95, 0, BELT_I0 - 1.7, 1.1, 1.3, ink.metal);
        box(ctx, v, 1.6, 3.85, 1.3, BELT_I0 - 1.5, 1.3, 0.3, ink.metalDark);
        box(ctx, v, BELT_I0, BELT_J0, 0, BELT_I1 - BELT_I0, BELT_J1 - BELT_J0, BELT_K, ink.belt);
        // Slats step with the belt.
        const off = beltOffset(cycle) % 0.5;
        ctx.strokeStyle = ink.slat;
        ctx.lineWidth = v.lw;
        ctx.beginPath();
        for (let i = BELT_I0 + off; i < BELT_I1; i += 0.5) {
            ctx.moveTo(v.x(i, BELT_J0 + 0.05), v.y(i, BELT_J0 + 0.05, BELT_K));
            ctx.lineTo(v.x(i, BELT_J1 - 0.05), v.y(i, BELT_J1 - 0.05, BELT_K));
        }
        ctx.stroke();
        if (level === 1) {
            // Hazard stripes along the belt's front edge.
            ctx.fillStyle = alertColor(this.cink, 1, 0.9);
            ctx.beginPath();
            for (let i = BELT_I0; i < BELT_I1 - 0.1; i += 0.5) {
                const a = i, b = Math.min(BELT_I1, i + 0.25);
                const c = Math.min(BELT_I1, i + 0.15), d = Math.min(BELT_I1, i + 0.4);
                ctx.moveTo(v.x(a, BELT_J1), v.y(a, BELT_J1, 0));
                ctx.lineTo(v.x(b, BELT_J1), v.y(b, BELT_J1, 0));
                ctx.lineTo(v.x(d, BELT_J1), v.y(d, BELT_J1, BELT_K));
                ctx.lineTo(v.x(c, BELT_J1), v.y(c, BELT_J1, BELT_K));
            }
            ctx.fill();
        }
        if (this.puffAge < PUFF_LIFE) {
            const r = (0.15 + this.puffAge * 3) * ISO_W * v.scale;
            ctx.fillStyle = ink.snow;
            ctx.beginPath();
            ctx.arc(v.x(BELT_I0 + 0.1, 4.5), v.y(BELT_I0 + 0.1, 4.5, 1.1), r * 0.5, 0, TAU);
            ctx.fill();
        }

        // Toys far to near; the die goes over the toys under it and behind the ones past it.
        const order = this.order;
        order.length = 0;
        for (const t of this.toys) order.push(t);
        order.sort((a, b) => toyI(a, cycle) + a.j - (toyI(b, cycle) + b.j));
        const drop = this.dieDrop();
        const bottom = DIE_REST - DIE_TRAVEL * drop;
        let pressed = false;
        for (const t of order) {
            const i = toyI(t, cycle);
            if (!pressed && i > PRESS_I + 0.8) {
                this.drawPress(ctx, bottom);
                pressed = true;
            }
            const under = Math.abs(i - PRESS_X) < DIE_REACH;
            this.drawToy(ctx, t, i, cycle, under ? 1 - SQUASH * drop : 1, under ? bottom : Infinity);
        }
        if (!pressed) this.drawPress(ctx, bottom);
        if (this.pressPuffAge < PUFF_LIFE) {
            const r = (0.15 + this.pressPuffAge * 3) * ISO_W * v.scale;
            ctx.fillStyle = ink.snow;
            ctx.beginPath();
            ctx.arc(v.x(PRESS_X, BELT_J1 + 0.05), v.y(PRESS_X, BELT_J1 + 0.05, BELT_K + 0.1), r * 0.5, 0, TAU);
            ctx.fill();
        }

        // The bin the belt tips into.
        box(ctx, v, BELT_I1, 3.85, 0, 0.8, 1.3, 0.75, ink.wood);
        quad(ctx, v, [BELT_I1 + 0.1, 3.95, 0.75, BELT_I1 + 0.7, 3.95, 0.75, BELT_I1 + 0.7, 5.05, 0.75, BELT_I1 + 0.1, 5.05, 0.75], ink.line);
    }

    /** How far down the die is, 0..1: the kick's thump or the strike, whichever is higher. */
    private dieDrop(): number {
        return clamp01(Math.max(this.thump, this.press));
    }

    /** The die with its bottom `bottom` over the belt, on its ram, under the crossbar. */
    private drawPress(ctx: CanvasRenderingContext2D, bottom: number): void {
        const v = this.view;
        const ink = this.ink;
        const k = BELT_K + bottom;
        const w = BELT_J1 - BELT_J0;
        box(ctx, v, PRESS_X - 0.15, 4.35, k + 0.45, 0.3, 0.3, 3.0 - (k + 0.45), ink.metal);
        box(ctx, v, PRESS_I, BELT_J0, k, 0.8, w, 0.1, ink.red);
        box(ctx, v, PRESS_I, BELT_J0, k + 0.1, 0.8, w, 0.35, ink.metalDark);
        box(ctx, v, PRESS_I - 0.05, 3.4, 3.0, 0.9, 2.0, 0.3, ink.metalDark);
    }

    /** A press post at j, floor to crossbar. */
    private drawPost(ctx: CanvasRenderingContext2D, j: number): void {
        box(ctx, this.view, PRESS_I + 0.3, j, 0, 0.2, 0.2, 3.0, this.ink.metal);
    }

    /** A blank before the press, the toy after it; heights scaled by `sq` and kept under `cap`. */
    private drawToy(ctx: CanvasRenderingContext2D, t: Toy, i: number, cycle: number, sq: number, cap: number): void {
        const v = this.view;
        const ink = this.ink;
        const j = t.j;
        const k = BELT_K;
        if (!isStamped(i)) {
            const h = Math.min(BLANK_H * sq, cap);
            box(ctx, v, i - 0.2, j - 0.15, k, 0.4, 0.3, h, ink.blankShade[t.color]);
            box(ctx, v, i - 0.04, j - 0.16, k, 0.08, 0.32, h + 0.01, ink.wood, false);
            return;
        }
        this.drawShape(ctx, t, i, j, k, cycle, Math.min(1, sq, cap / TOY_H[t.kind]));
    }

    /** The toy's parts, their heights scaled by `z` about the belt while it is under the die. */
    private drawShape(ctx: CanvasRenderingContext2D, t: Toy, i: number, j: number, k: number, cycle: number, z: number): void {
        const v = this.view;
        const ink = this.ink;
        const s = ink.poolShade[t.color];
        const bx = (bi: number, bj: number, bk: number, w: number, d: number, h: number, sh: Shade, edges = true) =>
            box(ctx, v, bi, bj, k + (bk - k) * z, w, d, h * z, sh, edges);
        let h = 0;
        switch (t.kind) {
            case 'TRAIN':
                // Wheels, chassis, boiler, cab with gold roof, smokestack and cowcatcher.
                bx(i - 0.22, j - 0.16, k, 0.12, 0.32, 0.08, ink.metalDark);
                bx(i + 0.06, j - 0.16, k, 0.12, 0.32, 0.08, ink.metalDark);
                bx(i - 0.26, j - 0.14, k + 0.05, 0.52, 0.28, 0.15, s);
                bx(i - 0.26, j - 0.15, k + 0.20, 0.22, 0.30, 0.18, s);
                bx(i - 0.28, j - 0.16, k + 0.36, 0.26, 0.32, 0.04, ink.gold);
                bx(i + 0.11, j - 0.05, k + 0.20, 0.09, 0.10, 0.15, ink.metalDark);
                bx(i + 0.24, j - 0.11, k + 0.03, 0.06, 0.22, 0.08, ink.gold);
                h = 0.4;
                break;
            case 'HORSE':
                // Curved wooden rocker rails, legs, body, saddle, neck/head and mane.
                bx(i - 0.28, j - 0.12, k, 0.56, 0.05, 0.06, ink.wood);
                bx(i - 0.28, j + 0.07, k, 0.56, 0.05, 0.06, ink.wood);
                bx(i - 0.18, j - 0.08, k + 0.06, 0.07, 0.16, 0.14, s);
                bx(i + 0.08, j - 0.08, k + 0.06, 0.07, 0.16, 0.14, s);
                bx(i - 0.21, j - 0.08, k + 0.18, 0.38, 0.16, 0.17, s);
                bx(i - 0.07, j - 0.09, k + 0.33, 0.14, 0.18, 0.05, ink.red);
                bx(i + 0.11, j - 0.07, k + 0.31, 0.13, 0.14, 0.22, s);
                bx(i + 0.18, j - 0.05, k + 0.41, 0.10, 0.10, 0.09, s);
                h = 0.54;
                break;
            case 'BEAR':
                // Seated paws, plump belly, ribbon bow-tie, head, snout and ears.
                bx(i - 0.15, j - 0.13, k, 0.30, 0.26, 0.09, s);
                bx(i - 0.13, j - 0.12, k + 0.07, 0.26, 0.24, 0.20, s);
                bx(i - 0.07, j + 0.10, k + 0.22, 0.14, 0.05, 0.05, ink.red, false);
                bx(i - 0.11, j - 0.10, k + 0.27, 0.22, 0.20, 0.18, s);
                bx(i - 0.05, j + 0.08, k + 0.31, 0.10, 0.06, 0.07, ink.skin, false);
                bx(i - 0.12, j - 0.08, k + 0.44, 0.07, 0.07, 0.07, s);
                bx(i + 0.05, j - 0.08, k + 0.44, 0.07, 0.07, 0.07, s);
                h = 0.51;
                break;
            case 'BLOCKS':
                // Three colourful alphabet blocks stacked in a pyramid with white/gold trim.
                bx(i - 0.21, j - 0.11, k, 0.2, 0.2, 0.2, s);
                bx(i + 0.01, j - 0.11, k, 0.2, 0.2, 0.2, ink.gold);
                bx(i - 0.10, j - 0.11, k + 0.2, 0.2, 0.2, 0.2, ink.red);
                bx(i - 0.05, j + 0.08, k + 0.25, 0.1, 0.03, 0.1, ink.snowShade, false);
                h = 0.4;
                break;
            case 'STAR':
                bx(i - 0.10, j - 0.10, k, 0.20, 0.20, 0.07, ink.metalDark);
                bx(i - 0.06, j - 0.06, k + 0.07, 0.12, 0.12, 0.05, ink.gold);
                star(ctx, v, i, j, k + 0.10 * z, 0.26 * z, s.top, Math.max(1.5, v.scale * 2.2));
                h = 0.6;
                break;
            case 'DOLL':
                cone(ctx, v, i, j, k, 0.14, 0.35 * z, s);
                bx(i - 0.10, j - 0.09, k + 0.26, 0.20, 0.18, 0.05, ink.snowShade);
                bx(i - 0.08, j - 0.08, k + 0.31, 0.16, 0.16, 0.15, ink.skin);
                bx(i - 0.09, j - 0.09, k + 0.43, 0.18, 0.17, 0.06, ink.gold);
                h = 0.49;
                break;
        }
        // A held note gets a bow once it has been on the belt half a bar.
        if (t.long && cycle - t.begin >= 0.5) {
            const bow = t.color === 0 ? ink.gold : ink.red;
            bx(i - 0.08, j - 0.05, k + h, 0.16, 0.1, 0.06, bow, false);
            bx(i - 0.03, j - 0.06, k + h + 0.04, 0.06, 0.12, 0.05, ink.snowShade, false);
        }
    }

    /** A bench with its elf; `hammer` puts an anvil on it. The elf stands on the belt side. */
    private drawBench(
        ctx: CanvasRenderingContext2D, i: number, front: boolean, t: Team | null, swing: number, hammer: boolean,
        spotIdx: number, cycle: number,
    ): void {
        const v = this.view;
        const ink = this.ink;
        const bj = front ? 7.2 : 1.0;
        const ej = front ? 6.82 : 2.18;
        const colorIdx = t ? this.colorOf(t.rgb) : spotIdx % ink.poolShade.length;
        const hat = hammer ? ink.red : ink.poolShade[colorIdx];
        const benchFirst = !front;

        if (!benchFirst) this.drawElf(ctx, i + 0.65, ej, front, hat, swing, hammer, spotIdx, cycle);

        // Floor shadow under bench
        diamond(ctx, v, i + BENCH_W * 0.5, bj + BENCH_D * 0.5, 0.46, ink.line);
        // Four sturdy wooden legs
        const lw = 0.13, ld = 0.13, lh = 0.35;
        box(ctx, v, i + 0.05, bj + 0.05, 0, lw, ld, lh, ink.metalDark);
        box(ctx, v, i + BENCH_W - 0.18, bj + 0.05, 0, lw, ld, lh, ink.metalDark);
        box(ctx, v, i + 0.05, bj + BENCH_D - 0.18, 0, lw, ld, lh, ink.metalDark);
        box(ctx, v, i + BENCH_W - 0.18, bj + BENCH_D - 0.18, 0, lw, ld, lh, ink.metalDark);
        // Lower shelf with spare blank stock
        box(ctx, v, i + 0.08, bj + 0.08, 0.10, BENCH_W - 0.16, BENCH_D - 0.16, 0.06, ink.wood);
        box(ctx, v, i + 0.22, bj + 0.15, 0.16, 0.24, 0.20, 0.12, ink.blankShade[colorIdx]);
        box(ctx, v, i + 0.52, bj + 0.16, 0.16, 0.22, 0.18, 0.10, ink.blankShade[(colorIdx + 2) % ink.blankShade.length]);
        // Thick overhanging butcher-block tabletop with brass corner plates
        box(ctx, v, i, bj, 0.35, BENCH_W, BENCH_D, 0.11, ink.wood);
        box(ctx, v, i + 0.02, bj + BENCH_D - 0.08, 0.36, 0.16, 0.09, 0.09, ink.gold, false);
        box(ctx, v, i + BENCH_W - 0.18, bj + BENCH_D - 0.08, 0.36, 0.16, 0.09, 0.09, ink.gold, false);

        if (hammer) {
            // Quench bucket beside the anvil bench
            box(ctx, v, i + 0.12, bj + 0.14, 0.46, 0.24, 0.24, 0.20, ink.metalDark);
            box(ctx, v, i + 0.15, bj + 0.17, 0.63, 0.18, 0.18, 0.04, ink.belt, false);
            // Heavy blacksmith anvil: base, waist, face and horn
            box(ctx, v, i + 0.72, bj + 0.12, 0.46, 0.38, 0.32, 0.12, ink.metalDark);
            box(ctx, v, i + 0.66, bj + 0.10, 0.58, 0.48, 0.36, 0.09, ink.metal);
            box(ctx, v, i + 0.54, bj + 0.17, 0.59, 0.14, 0.20, 0.07, ink.metal);
            // Hot glowing bar on the anvil
            const hotBar = swing > 0.12 ? ink.red : ink.gold;
            box(ctx, v, i + 0.78, bj + 0.18, 0.67, 0.22, 0.14, 0.06, hotBar);
        } else {
            // Bench vice on the left corner
            box(ctx, v, i + 0.10, bj + 0.14, 0.46, 0.20, 0.22, 0.11, ink.metalDark);
            box(ctx, v, i + 0.08, bj + 0.18, 0.57, 0.24, 0.14, 0.06, ink.metal);
            // Paint pot & brush jar on the right corner
            box(ctx, v, i + 1.02, bj + 0.12, 0.46, 0.16, 0.16, 0.14, ink.metal);
            box(ctx, v, i + 1.04, bj + 0.14, 0.58, 0.12, 0.12, 0.04, hat, false);
            // Active workpiece or gift on the bench center
            const gift = t ? hat : ink.blankShade[colorIdx];
            const gh = t ? 0.22 : 0.16;
            box(ctx, v, i + 0.52, bj + 0.14, 0.46, 0.32, 0.28, gh, gift);
            if (t) {
                const ribbon = colorIdx === 0 ? ink.gold : ink.snowShade;
                box(ctx, v, i + 0.64, bj + 0.13, 0.46, 0.08, 0.30, gh + 0.02, ribbon, false);
                box(ctx, v, i + 0.51, bj + 0.24, 0.46, 0.34, 0.08, gh + 0.02, ribbon, false);
            }
        }

        if (benchFirst) this.drawElf(ctx, i + 0.65, ej, front, hat, swing, hammer, spotIdx, cycle);
    }

    /**
     * Detailed isometric workshop elf: curled boots with gold bells, candy-striped
     * stockings, belted tunic with apron & scalloped collar, two articulated 3D arms
     * holding workshop tools, head with pointed ears & face, and pompom cone hat.
     */
    private drawElf(
        ctx: CanvasRenderingContext2D, i: number, j: number, front: boolean, hat: Shade, swing: number,
        hammer: boolean, spotIdx: number, cycle: number,
    ): void {
        const v = this.view;
        const ink = this.ink;
        const up = clamp01(swing);
        const bob = up * 0.04;
        const k0 = 0.24 - bob;

        // 1. Ground shadow
        diamond(ctx, v, i, j, 0.27, ink.line);

        // 2. Boots & candy-striped stockings (left leg then right leg in painter's order)
        const legs: readonly [number, number][] = [
            [i - 0.14, j - 0.05],
            [i + 0.02, j + 0.01],
        ];
        for (const [li, lj] of legs) {
            // Boot base, curled toe, and tiny gold toe-bell
            box(ctx, v, li, lj, 0, 0.12, 0.14, 0.09, ink.metalDark);
            box(ctx, v, li + 0.01, lj + 0.12, 0.02, 0.09, 0.07, 0.08, ink.metalDark, false);
            box(ctx, v, li + 0.03, lj + 0.17, 0.09, 0.05, 0.05, 0.05, ink.gold, false);
            // Striped stocking (white and red bands)
            box(ctx, v, li + 0.01, lj + 0.01, 0.09, 0.10, 0.10, 0.08, ink.snowShade, false);
            box(ctx, v, li + 0.01, lj + 0.01, 0.16, 0.10, 0.10, Math.max(0.05, k0 - 0.14), ink.red, false);
        }

        // 3. Left/back arm (reaches toward the workbench to steady the work)
        const reachJ = front ? 0.09 : -0.11;
        const lai = i - 0.25, laj = j - 0.04 + reachJ * 0.5;
        box(ctx, v, lai, laj, k0 + 0.30, 0.11, 0.13, 0.16, ink.tunic, false);
        box(ctx, v, lai, laj + reachJ * 0.4, k0 + 0.26, 0.10, 0.11, 0.05, ink.snowShade, false);
        box(ctx, v, lai, laj + reachJ * 0.7, k0 + 0.21, 0.10, 0.10, 0.09, ink.skin, false);

        // 4. Tunic body, red scalloped hem, leather belt + gold buckle, apron & white collar
        box(ctx, v, i - 0.18, j - 0.16, k0, 0.36, 0.32, 0.52, ink.tunic);
        box(ctx, v, i - 0.19, j - 0.17, k0, 0.38, 0.34, 0.07, ink.red, false);
        box(ctx, v, i - 0.19, j - 0.17, k0 + 0.20, 0.38, 0.34, 0.07, ink.metalDark, false);
        box(ctx, v, i - 0.05, j + 0.12, k0 + 0.19, 0.11, 0.06, 0.09, ink.gold, false);
        // Workshop apron on front of tunic
        const apron = hammer ? ink.metalDark : ink.wood;
        box(ctx, v, i - 0.10, j + 0.12, k0 + 0.06, 0.22, 0.05, 0.38, apron, false);
        // Scalloped white collar
        box(ctx, v, i - 0.19, j - 0.17, k0 + 0.50, 0.38, 0.34, 0.06, ink.snowShade, false);

        // 5. Head, hair, pointed elf ears & facial features
        const hk0 = k0 + 0.56;
        const hair = spotIdx % 3 === 0 ? ink.gold : spotIdx % 3 === 1 ? ink.wood : ink.red;
        // Back/side hair lock
        box(ctx, v, i - 0.16, j - 0.16, hk0 + 0.06, 0.32, 0.30, 0.20, hair, false);
        // Far pointed ear (-i side)
        box(ctx, v, i - 0.23, j - 0.03, hk0 + 0.09, 0.09, 0.08, 0.10, ink.skin, false);
        // Head block
        box(ctx, v, i - 0.15, j - 0.14, hk0, 0.30, 0.28, 0.28, ink.skin);
        // Near pointed ear (+i side)
        box(ctx, v, i + 0.15, j + 0.01, hk0 + 0.09, 0.09, 0.08, 0.10, ink.skin, false);
        // Eyes, rosy cheeks & smith/inspector goggles
        const px = Math.max(1.5, v.scale * 2.2);
        const eyeY = hk0 + 0.14;
        ctx.fillStyle = ink.line;
        ctx.fillRect(Math.round(v.x(i - 0.05, j + 0.14) - px * 0.5), Math.round(v.y(i - 0.05, j + 0.14, eyeY) - px * 0.5), px, px * 1.2);
        ctx.fillRect(Math.round(v.x(i + 0.06, j + 0.14) - px * 0.5), Math.round(v.y(i + 0.06, j + 0.14, eyeY) - px * 0.5), px, px * 1.2);
        ctx.fillRect(Math.round(v.x(i + 0.15, j + 0.04) - px * 0.5), Math.round(v.y(i + 0.15, j + 0.04, eyeY) - px * 0.5), px, px * 1.2);
        // Rosy cheeks
        ctx.fillStyle = ink.red.top;
        ctx.fillRect(Math.round(v.x(i - 0.09, j + 0.14) - px * 0.5), Math.round(v.y(i - 0.09, j + 0.14, hk0 + 0.08)), px * 1.2, px * 0.9);
        ctx.fillRect(Math.round(v.x(i + 0.08, j + 0.14) - px * 0.5), Math.round(v.y(i + 0.08, j + 0.14, hk0 + 0.08)), px * 1.2, px * 0.9);
        // Brass goggles on forehead for the blacksmith and lead inspector spots
        if (hammer || spotIdx % 4 === 0) {
            box(ctx, v, i - 0.12, j + 0.10, hk0 + 0.18, 0.11, 0.06, 0.07, ink.gold, false);
            box(ctx, v, i + 0.02, j + 0.10, hk0 + 0.18, 0.11, 0.06, 0.07, ink.gold, false);
        }

        // 6. Fluffy white hat brim, tall cone hat & white pompom at tip
        box(ctx, v, i - 0.18, j - 0.17, hk0 + 0.27, 0.36, 0.34, 0.08, ink.snowShade);
        cone(ctx, v, i, j, hk0 + 0.35, 0.20, 0.52, hat);
        const pomWob = Math.sin(cycle * TAU + spotIdx) * 0.02;
        box(ctx, v, i - 0.055 + pomWob, j - 0.055, hk0 + 0.84 - up * 0.03, 0.11, 0.11, 0.11, ink.snowShade, false);

        // 7. Right/tool arm (3D shoulder sleeve, forearm, white cuff, hand & active workshop tool)
        const si = i + 0.17, sj = j + 0.02;
        const hi = si + 0.05 + up * 0.04;
        const hj = sj + 0.06 - up * 0.02;
        const hk = k0 + 0.24 + up * 0.70;
        // Shoulder puff sleeve
        box(ctx, v, si - 0.02, sj - 0.04, k0 + 0.36, 0.13, 0.13, 0.15, ink.tunic, false);
        // Forearm segment
        ctx.strokeStyle = ink.tunic.left;
        ctx.lineWidth = Math.max(2, ISO_W * v.scale * 0.12);
        ctx.beginPath();
        ctx.moveTo(v.x(si + 0.04, sj + 0.02), v.y(si + 0.04, sj + 0.02, k0 + 0.43));
        ctx.lineTo(v.x(hi, hj), v.y(hi, hj, hk));
        ctx.stroke();
        // White cuff & hand
        box(ctx, v, hi - 0.05, hj - 0.05, hk - 0.04, 0.10, 0.10, 0.05, ink.snowShade, false);
        box(ctx, v, hi - 0.05, hj - 0.05, hk, 0.10, 0.10, 0.09, ink.skin, false);

        // Tool in hand
        if (hammer) {
            // Heavy blacksmith hammer
            box(ctx, v, hi - 0.02, hj - 0.02, hk + 0.08, 0.05, 0.05, 0.18, ink.wood, false);
            box(ctx, v, hi - 0.09, hj - 0.06, hk + 0.22, 0.18, 0.12, 0.11, ink.metal);
        } else if (spotIdx % 3 === 0) {
            // Wooden toymaker's mallet
            box(ctx, v, hi - 0.02, hj - 0.02, hk + 0.08, 0.05, 0.05, 0.16, ink.wood, false);
            box(ctx, v, hi - 0.08, hj - 0.05, hk + 0.20, 0.16, 0.10, 0.10, ink.wood);
            box(ctx, v, hi - 0.09, hj - 0.04, hk + 0.21, 0.03, 0.08, 0.08, ink.gold, false);
        } else if (spotIdx % 3 === 1) {
            // Paintbrush dipped in track colour
            box(ctx, v, hi - 0.02, hj - 0.02, hk + 0.08, 0.05, 0.05, 0.16, ink.wood, false);
            box(ctx, v, hi - 0.03, hj - 0.03, hk + 0.22, 0.07, 0.07, 0.05, ink.snowShade, false);
            box(ctx, v, hi - 0.04, hj - 0.04, hk + 0.26, 0.09, 0.09, 0.09, hat, false);
        } else {
            // Steel wrench / spanner
            box(ctx, v, hi - 0.02, hj - 0.02, hk + 0.08, 0.06, 0.06, 0.18, ink.metal, false);
            box(ctx, v, hi - 0.06, hj - 0.05, hk + 0.24, 0.13, 0.10, 0.07, ink.metalDark);
        }
    }

    private drawForklift(ctx: CanvasRenderingContext2D, f: ForkPose, cycle: number): void {
        const v = this.view;
        const ink = this.ink;
        const crate = this.lastRgb ? ink.poolShade[this.colorOf(this.lastRgb)] : ink.wood;
        // Footprint along the travel axis.
        const along = f.di !== 0;
        const L = 0.76, W = 0.50;
        const ci = f.i, cj = f.j;
        const bi = along ? ci - L / 2 : ci - W / 2;
        const bj = along ? cj - W / 2 : cj - L / 2;
        const bw = along ? L : W, bd = along ? W : L;
        // The forks and crate lead; far parts draw first.
        const fi = ci + f.di * 0.58, fj = cj + f.dj * 0.58;
        const towardViewer = f.di + f.dj > 0;
        const drawFront = () => {
            // Dual steel fork tines under the crate
            box(ctx, v, fi - 0.22, fj - 0.22, 0.08, 0.44, 0.44, 0.05, ink.metalDark);
            // Crate with ribbon band
            box(ctx, v, fi - 0.2, fj - 0.2, 0.13, 0.4, 0.4, 0.36, crate);
            box(ctx, v, fi - 0.05, fj - 0.21, 0.13, 0.10, 0.42, 0.37, ink.gold, false);
            // Mast rails
            const mi = ci + f.di * 0.34, mj = cj + f.dj * 0.34;
            box(ctx, v, mi - 0.05, mj - 0.05, 0.04, 0.10, 0.10, 1.02, ink.metalDark);
        };
        // A shadow under it grounds it on the floor.
        diamond(ctx, v, ci + f.di * 0.15, cj + f.dj * 0.15, 0.55, ink.line);
        if (!towardViewer) drawFront();
        // Four dark rubber wheels at the corners
        box(ctx, v, bi + 0.03, bj + 0.02, 0, 0.16, 0.16, 0.12, ink.belt);
        box(ctx, v, bi + bw - 0.19, bj + 0.02, 0, 0.16, 0.16, 0.12, ink.belt);
        box(ctx, v, bi + 0.03, bj + bd - 0.18, 0, 0.16, 0.16, 0.12, ink.belt);
        box(ctx, v, bi + bw - 0.19, bj + bd - 0.18, 0, 0.16, 0.16, 0.12, ink.belt);
        // Forklift body chassis & counterweight
        box(ctx, v, bi, bj, 0.09, bw, bd, 0.30, ink.fork);
        const cwi = ci - f.di * 0.22, cwj = cj - f.dj * 0.22;
        box(ctx, v, cwi - 0.16, cwj - 0.16, 0.12, 0.32, 0.32, 0.32, ink.metalDark);
        // Seated Driver Elf inside the cab (green tunic, skin head, pointed ears, gold safety helmet)
        const di = ci - f.di * 0.06, dj = cj - f.dj * 0.06;
        box(ctx, v, di - 0.11, dj - 0.11, 0.39, 0.22, 0.22, 0.22, ink.tunic);
        box(ctx, v, di - 0.09, dj - 0.09, 0.61, 0.18, 0.18, 0.18, ink.skin);
        box(ctx, v, di - 0.11, dj - 0.11, 0.78, 0.22, 0.22, 0.06, ink.snowShade, false);
        cone(ctx, v, di, dj, 0.84, 0.13, 0.28, ink.gold);
        // Overhead roll-cage pillars & roof cap
        ctx.strokeStyle = ink.metalDark.left;
        ctx.lineWidth = Math.max(1.2, v.lw * 1.4);
        ctx.beginPath();
        for (const [pi, pj] of [[bi + 0.08, bj + 0.08], [bi + bw - 0.08, bj + 0.08], [bi + 0.08, bj + bd - 0.08], [bi + bw - 0.08, bj + bd - 0.08]]) {
            ctx.moveTo(v.x(pi, pj), v.y(pi, pj, 0.39));
            ctx.lineTo(v.x(pi, pj), v.y(pi, pj, 1.05));
        }
        ctx.stroke();
        box(ctx, v, bi + 0.06, bj + 0.06, 1.05, bw - 0.12, bd - 0.12, 0.05, ink.metalDark);
        // Flashing amber beacon on cab roof
        const beacon = (Math.floor(cycle * 8) & 1) === 0 ? ink.gold : ink.red;
        box(ctx, v, di - 0.04, dj - 0.04, 1.10, 0.08, 0.08, 0.07, beacon, false);
        if (towardViewer) drawFront();
    }

    private drawDock(ctx: CanvasRenderingContext2D, cycle: number): void {
        const v = this.view;
        const ink = this.ink;

        // Runway guide lights along both edges of the loading bay apron.
        const beatStep = Math.floor(cycle * 4) & 3;
        for (let n = 0; n < 4; n++) {
            const li = 13.0 + n * 1.15;
            const sh = n === beatStep ? ink.gold : ink.red;
            box(ctx, v, li, DOCK_J0 + 0.14, 0, 0.12, 0.12, 0.06, sh, false);
            box(ctx, v, li, DOCK_J1 - 0.26, 0, 0.12, 0.12, 0.06, sh, false);
        }

        // 1. Far sleigh runner & upturned front curl (j = 3.50)
        box(ctx, v, 12.50, 3.50, 0, 2.20, 0.12, 0.15, ink.gold);
        box(ctx, v, 14.66, 3.50, 0.06, 0.16, 0.12, 0.22, ink.gold);

        // 2. Sleigh floorbed, far side wall, and rear high-backrest
        box(ctx, v, 12.68, 3.52, 0.15, 1.84, 1.96, 0.28, ink.red);
        box(ctx, v, 12.68, 3.52, 0.43, 1.84, 0.14, 0.26, ink.red);
        box(ctx, v, 12.66, 3.50, 0.67, 1.88, 0.10, 0.06, ink.gold, false);
        box(ctx, v, 12.68, 3.52, 0.43, 0.26, 1.96, 0.68, ink.red);
        box(ctx, v, 12.66, 3.50, 1.09, 0.30, 2.00, 0.07, ink.gold, false);

        // 3. Rear cargo bay: toy sack and overflowing wrapped presents
        const fill = (this.shipped % SACK) / SACK;
        const sh = 0.28 + fill * 0.62;
        box(ctx, v, 12.96, 3.76, 0.43, 0.80, 1.48, sh, ink.wood);
        box(ctx, v, 13.10, 3.96, 0.43 + sh, 0.26, 0.26, 0.18, ink.poolShade[0]);
        box(ctx, v, 13.42, 4.44, 0.43 + sh, 0.25, 0.25, 0.16, ink.gold);
        if (fill > 0.3) {
            box(ctx, v, 13.22, 4.72, 0.43 + sh, 0.24, 0.24, 0.20, ink.poolShade[2]);
        }

        // 4. Front driver's velvet bench seat (elevated so Mrs. Claus has a clear view over the prow)
        box(ctx, v, 13.78, 3.68, 0.43, 0.40, 1.64, 0.30, ink.tunic);

        // 5. Mrs. Claus in the sleigh cockpit tending the reins
        this.drawMrsClaus(ctx, 14.00, 4.46, 0.73, cycle);

        // 6. Front curved prow / dashboard with gold crest & twin brass lanterns
        box(ctx, v, 14.34, 3.52, 0.15, 0.24, 1.96, 0.68, ink.red);
        box(ctx, v, 14.32, 3.50, 0.81, 0.28, 2.00, 0.07, ink.gold);
        box(ctx, v, 14.54, 3.56, 0.64, 0.12, 0.12, 0.18, ink.gold, false);
        box(ctx, v, 14.54, 5.32, 0.64, 0.12, 0.12, 0.18, ink.gold, false);

        // 7. Near side wall & gold trim rail, then near runner (j = 5.34..5.48)
        box(ctx, v, 12.68, 5.34, 0.43, 1.84, 0.14, 0.26, ink.red);
        box(ctx, v, 12.66, 5.40, 0.67, 1.88, 0.10, 0.06, ink.gold, false);
        box(ctx, v, 12.50, 5.38, 0, 2.20, 0.12, 0.15, ink.gold);
        box(ctx, v, 14.66, 5.38, 0.06, 0.16, 0.12, 0.22, ink.gold);

        // 8. Hitched Reindeer team in front of the sleigh (drawn far-to-near in painter's order)
        const rRearI = 15.32, rFrontI = 16.30;
        const rFarJ = 3.84, rNearJ = 5.06;

        // Far-side golden harness rein (drawn behind the near reindeer pair)
        ctx.strokeStyle = ink.gold.top;
        ctx.lineWidth = Math.max(1.2, v.lw * 1.3);
        ctx.beginPath();
        ctx.moveTo(v.x(14.22, 4.30), v.y(14.22, 4.30, 1.14));
        ctx.lineTo(v.x(14.56, 3.88), v.y(14.56, 3.88, 0.82));
        ctx.lineTo(v.x(rRearI + 0.12, rFarJ), v.y(rRearI + 0.12, rFarJ, 0.54));
        ctx.lineTo(v.x(rFrontI + 0.12, rFarJ), v.y(rFrontI + 0.12, rFarJ, 0.54));
        ctx.stroke();

        this.drawReindeer(ctx, rRearI, rFarJ, false, 0, cycle);
        this.drawReindeer(ctx, rFrontI, rFarJ, false, 1, cycle);
        this.drawReindeer(ctx, rRearI, rNearJ, false, 2, cycle);
        this.drawReindeer(ctx, rFrontI, rNearJ, true, 3, cycle);

        // Near-side golden harness rein connecting Mrs. Claus's right hand to the near pair & Rudolph
        ctx.strokeStyle = ink.gold.top;
        ctx.lineWidth = Math.max(1.2, v.lw * 1.3);
        ctx.beginPath();
        ctx.moveTo(v.x(14.22, 4.62), v.y(14.22, 4.62, 1.14));
        ctx.lineTo(v.x(14.56, 5.04), v.y(14.56, 5.04, 0.82));
        ctx.lineTo(v.x(rRearI + 0.12, rNearJ), v.y(rRearI + 0.12, rNearJ, 0.54));
        ctx.lineTo(v.x(rFrontI + 0.12, rNearJ), v.y(rFrontI + 0.12, rNearJ, 0.54));
        ctx.stroke();
    }

    /**
     * Mrs. Claus in the sleigh: crimson velvet gown with white apron, fur-trimmed
     * capelet collar, arms holding the golden reins, gold spectacles, and snowy
     * hair bun topped with a sprig of holly.
     */
    private drawMrsClaus(ctx: CanvasRenderingContext2D, i: number, j: number, k0: number, cycle: number): void {
        const v = this.view;
        const ink = this.ink;
        const bob = Math.sin(cycle * TAU * 2) * 0.025;
        const k = k0 + bob;

        // Full crimson dress skirt & white apron
        box(ctx, v, i - 0.19, j - 0.19, k, 0.38, 0.38, 0.30, ink.red);
        box(ctx, v, i + 0.06, j - 0.13, k + 0.02, 0.15, 0.26, 0.28, ink.snowShade, false);
        // Bodice, belt & fluffy white fur shawl collar
        box(ctx, v, i - 0.16, j - 0.16, k + 0.30, 0.32, 0.32, 0.24, ink.red);
        box(ctx, v, i - 0.17, j - 0.17, k + 0.28, 0.34, 0.34, 0.05, ink.metalDark, false);
        box(ctx, v, i - 0.18, j - 0.18, k + 0.49, 0.36, 0.36, 0.07, ink.snowShade);

        // Arms reaching forward (+i) with white cuffs & hands holding the reins
        for (const dj of [-0.17, 0.13]) {
            box(ctx, v, i + 0.02, j + dj, k + 0.36, 0.20, 0.10, 0.11, ink.red, false);
            box(ctx, v, i + 0.18, j + dj, k + 0.36, 0.06, 0.10, 0.10, ink.snowShade, false);
            box(ctx, v, i + 0.22, j + dj + 0.01, k + 0.36, 0.08, 0.08, 0.09, ink.skin, false);
        }

        // Head, snowy hair sides, and top hair bun with holly berries
        const hk = k + 0.56;
        box(ctx, v, i - 0.16, j - 0.15, hk + 0.04, 0.28, 0.30, 0.22, ink.snowShade, false);
        box(ctx, v, i - 0.14, j - 0.14, hk, 0.28, 0.28, 0.26, ink.skin);
        box(ctx, v, i - 0.15, j - 0.15, hk + 0.23, 0.30, 0.30, 0.08, ink.snowShade, false);
        // Snowy top bun
        box(ctx, v, i - 0.11, j - 0.10, hk + 0.30, 0.20, 0.20, 0.14, ink.snowShade);
        // Holly leaves & red berry on bun
        box(ctx, v, i + 0.03, j - 0.04, hk + 0.42, 0.09, 0.09, 0.05, ink.tunic, false);
        box(ctx, v, i + 0.06, j - 0.02, hk + 0.45, 0.06, 0.06, 0.06, ink.red, false);

        // Eyes, rosy cheeks & gold-rimmed spectacles on the +i and +j faces
        const px = Math.max(1.5, v.scale * 2.2);
        ctx.fillStyle = ink.gold.top;
        ctx.fillRect(Math.round(v.x(i + 0.14, j - 0.06) - px * 0.6), Math.round(v.y(i + 0.14, j - 0.06, hk + 0.14) - px * 0.6), px * 1.4, px * 1.3);
        ctx.fillRect(Math.round(v.x(i + 0.14, j + 0.05) - px * 0.6), Math.round(v.y(i + 0.14, j + 0.05, hk + 0.14) - px * 0.6), px * 1.4, px * 1.3);
        ctx.fillRect(Math.round(v.x(i + 0.04, j + 0.14) - px * 0.6), Math.round(v.y(i + 0.04, j + 0.14, hk + 0.14) - px * 0.6), px * 1.4, px * 1.3);
        ctx.fillStyle = ink.line;
        ctx.fillRect(Math.round(v.x(i + 0.14, j - 0.05) - px * 0.3), Math.round(v.y(i + 0.14, j - 0.05, hk + 0.14) - px * 0.3), px * 0.8, px * 0.9);
        ctx.fillRect(Math.round(v.x(i + 0.14, j + 0.06) - px * 0.3), Math.round(v.y(i + 0.14, j + 0.06, hk + 0.14) - px * 0.3), px * 0.8, px * 0.9);
        ctx.fillRect(Math.round(v.x(i + 0.05, j + 0.14) - px * 0.3), Math.round(v.y(i + 0.05, j + 0.14, hk + 0.14) - px * 0.3), px * 0.8, px * 0.9);
        ctx.fillStyle = ink.red.top;
        ctx.fillRect(Math.round(v.x(i + 0.14, j + 0.08) - px * 0.4), Math.round(v.y(i + 0.14, j + 0.08, hk + 0.07)), px, px * 0.8);
        ctx.fillRect(Math.round(v.x(i + 0.02, j + 0.14) - px * 0.4), Math.round(v.y(i + 0.02, j + 0.14, hk + 0.07)), px, px * 0.8);
    }

    /**
     * Isometric 3D Reindeer hitched in front of the sleigh: 4 legs with hooves,
     * brown coat, white tail tuft, red & gold jingle-bell harness, neck & snout,
     * branching antlers, and Rudolph's glowing red nose on the lead reindeer.
     */
    private drawReindeer(
        ctx: CanvasRenderingContext2D, i: number, j: number, rudolph: boolean, idx: number, cycle: number,
    ): void {
        const v = this.view;
        const ink = this.ink;
        const prance = Math.sin(cycle * TAU * 2 + idx * 1.4) * 0.03;
        const k0 = Math.max(0, prance);

        // Ground shadow
        diamond(ctx, v, i + 0.04, j, 0.28, ink.line);

        // Four slender legs with dark hooves (far legs then near legs)
        const legs: readonly [number, number, number][] = [
            [i - 0.20, j - 0.11, 0],
            [i + 0.12, j - 0.11, 1],
            [i - 0.20, j + 0.03, 1],
            [i + 0.12, j + 0.03, 0],
        ];
        for (const [li, lj, phase] of legs) {
            const lift = Math.max(0, Math.sin(cycle * TAU * 2 + idx + phase * Math.PI)) * 0.05;
            box(ctx, v, li, lj, lift, 0.08, 0.08, 0.06, ink.metalDark, false);
            box(ctx, v, li, lj, lift + 0.06, 0.08, 0.08, 0.21, ink.wood, false);
        }

        // Fluffy white tail tuft at rear (-i)
        box(ctx, v, i - 0.30, j - 0.05, k0 + 0.36, 0.09, 0.10, 0.10, ink.snowShade, false);

        // Brown torso & warm chest
        box(ctx, v, i - 0.24, j - 0.13, k0 + 0.25, 0.48, 0.26, 0.22, ink.wood);

        // Red harness strap & golden jingle bells across torso/collar
        box(ctx, v, i + 0.06, j - 0.14, k0 + 0.24, 0.10, 0.28, 0.24, ink.red, false);
        box(ctx, v, i + 0.08, j + 0.12, k0 + 0.30, 0.07, 0.05, 0.07, ink.gold, false);

        // Upright neck & head facing +i
        const headBob = Math.sin(cycle * TAU * 2 + idx * 0.9) * 0.025;
        const nk = k0 + 0.42 + headBob;
        box(ctx, v, i + 0.10, j - 0.10, nk, 0.16, 0.20, 0.20, ink.wood);
        // Pointed ears
        box(ctx, v, i + 0.12, j - 0.15, nk + 0.26, 0.07, 0.06, 0.08, ink.wood, false);
        box(ctx, v, i + 0.12, j + 0.09, nk + 0.26, 0.07, 0.06, 0.08, ink.wood, false);
        // Head & muzzle
        box(ctx, v, i + 0.12, j - 0.11, nk + 0.16, 0.20, 0.22, 0.18, ink.wood);
        box(ctx, v, i + 0.30, j - 0.08, nk + 0.16, 0.12, 0.16, 0.12, ink.skin, false);

        // Nose: glowing red nose on Rudolph, dark nose on the others
        if (rudolph) {
            const nx = v.x(i + 0.43, j), ny = v.y(i + 0.43, j, nk + 0.24);
            ctx.fillStyle = rampAt(ink.glow, 0.35);
            ctx.beginPath();
            ctx.arc(nx, ny, ISO_W * v.scale * 0.18, 0, TAU);
            ctx.fill();
            box(ctx, v, i + 0.39, j - 0.05, nk + 0.20, 0.09, 0.10, 0.09, ink.red, false);
        } else {
            box(ctx, v, i + 0.39, j - 0.04, nk + 0.21, 0.06, 0.08, 0.07, ink.metalDark, false);
        }

        // Eyes
        const px = Math.max(1.5, v.scale * 2.0);
        ctx.fillStyle = ink.line;
        ctx.fillRect(Math.round(v.x(i + 0.26, j + 0.11) - px * 0.5), Math.round(v.y(i + 0.26, j + 0.11, nk + 0.26) - px * 0.5), px, px);
        ctx.fillRect(Math.round(v.x(i + 0.32, j + 0.06) - px * 0.5), Math.round(v.y(i + 0.32, j + 0.06, nk + 0.26) - px * 0.5), px, px);

        // Branching 3D antlers rising from the crown
        const antler = ink.gold;
        for (const aj of [-0.09, 0.04]) {
            box(ctx, v, i + 0.15, j + aj, nk + 0.34, 0.05, 0.05, 0.22, antler, false);
            box(ctx, v, i + 0.09, j + aj, nk + 0.48, 0.16, 0.05, 0.05, antler, false);
            box(ctx, v, i + 0.09, j + aj, nk + 0.52, 0.05, 0.05, 0.10, antler, false);
            box(ctx, v, i + 0.21, j + aj, nk + 0.42, 0.05, 0.05, 0.12, antler, false);
        }
    }

    /** Anvil sparks in one path, then the press chips in their toys' colours. */
    private drawSparks(ctx: CanvasRenderingContext2D): void {
        if (this.sparks.length === 0) return;
        const v = this.view;
        const sz = Math.max(1, Math.round(v.scale * 2));
        ctx.fillStyle = this.ink.spark;
        ctx.beginPath();
        for (const p of this.sparks) {
            if (p.color === null) ctx.rect(Math.round(v.x(p.i, p.j)), Math.round(v.y(p.i, p.j, p.k)), sz, sz);
        }
        ctx.fill();
        const chip = sz + 1;
        for (const p of this.sparks) {
            if (p.color === null) continue;
            ctx.fillStyle = p.color;
            ctx.fillRect(Math.round(v.x(p.i, p.j)), Math.round(v.y(p.i, p.j, p.k)), chip, chip);
        }
    }

    /** A plate in the scene's top left corner. */
    private drawTag(ctx: CanvasRenderingContext2D, text: string): void {
        const {small} = this.lay;
        const x = this.scene.x, y = this.scene.y;
        const w = small * (text.length * 0.62 + 1.6), h = small * 1.6;
        ctx.fillStyle = this.cink.bg;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = this.cink.frame;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        drawLabel(ctx, text, x + small * 0.8, y + h / 2, alertColor(this.cink, 5), small, 'left');
    }

    /** The strip under the floor: the line's numbers, one cell each. */
    private drawReadout(ctx: CanvasRenderingContext2D, s: VizServices): void {
        const ink = this.cink;
        const level = this.alert.level;
        const alertInk = alertColor(ink, level);
        // Values blink in the alert colour while hot.
        const value = level <= 2 && this.flashOn ? alertInk : ink.value;
        const locked = this.field.locked;
        // One slot a beat, four beats a bar: bars an hour is bpm × 15.
        const bpm = Math.max(1, Math.round(s.bpm));
        const strike = this.dieDrop() > STRIKE_HOLD;
        drawStrip(ctx, this.lay, ink, [
            {label: 'UNITS/HR', value: group(this.lastBarStamped * bpm * 15), color: value},
            {label: 'QUOTA', meter: (6 - level) / 5, color: alertColor(ink, level, 0.85)},
            {label: 'BELT', value: locked ? 'RUNNING' : 'IDLE', color: locked ? value : ink.labelDim},
            {label: 'PRESS', value: strike ? 'STRIKE' : 'ARMED', color: strike ? alertInk : value},
            {label: 'STAMPED', value: String(this.barStamped), color: value},
            {label: 'BACKLOG', value: String(this.backlog), color: this.backlog > 0 ? alertInk : value},
            {label: 'LAST', value: this.lastStamp || '—', color: value},
        ]);
    }

    private colorOf(rgb: readonly [number, number, number]): number {
        return nearestIndex(rgb, this.ink.pool, this.colors);
    }
}

interface ForkPose {
    i: number;
    j: number;
    di: number;
    dj: number;
    /** LOOP segment: 0 back aisle, 1 left side, 2 front aisle, 3 right side. */
    seg: number;
}

/** The forklift's place on its loop, one lap every LOOP_BARS bars. */
function forkAt(cycle: number): ForkPose {
    let total = 0;
    for (let n = 0; n < LOOP.length; n++) total += segLen(n);
    const lap = cycle / LOOP_BARS;
    let d = (lap - Math.floor(lap)) * total;
    for (let n = 0; n < LOOP.length; n++) {
        const len = segLen(n);
        if (d <= len || n === LOOP.length - 1) {
            const [ai, aj] = LOOP[n];
            const [bi, bj] = LOOP[(n + 1) % LOOP.length];
            const f = Math.min(1, d / len);
            return {i: ai + (bi - ai) * f, j: aj + (bj - aj) * f, di: Math.sign(bi - ai), dj: Math.sign(bj - aj), seg: n};
        }
        d -= len;
    }
    return {i: LOOP[0][0], j: LOOP[0][1], di: -1, dj: 0, seg: 0};
}

function segLen(n: number): number {
    const [ai, aj] = LOOP[n];
    const [bi, bj] = LOOP[(n + 1) % LOOP.length];
    return Math.abs(bi - ai) + Math.abs(bj - aj);
}

/** The belt steps one slot (one tile) a beat, moving through the last third of it so toys land on the beat. */
function beltOffset(cycle: number): number {
    const beats = cycle * 4;
    const n = Math.floor(beats);
    const f = beats - n;
    const t = f < 0.65 ? 0 : (f - 0.65) / 0.35;
    return n + t * t * (3 - 2 * t);
}

function toyI(t: Toy, cycle: number): number {
    return t.i0 + beltOffset(cycle) - t.b0;
}

/** At or past the die: a blank becomes its toy the moment it lands under PRESS_X. */
function isStamped(i: number): boolean {
    return i >= PRESS_X - EPS;
}

/** Each toy's full height, for keeping it under the die. */
const TOY_H: Record<ToyKind, number> = {TRAIN: 0.38, HORSE: 0.54, BEAR: 0.5, BLOCKS: 0.4, STAR: 0.6, DOLL: 0.46};

function rank(role: Role): number {
    return role === 'lead' ? 2 : role === 'mid' ? 1 : 0;
}

/** One day every four bars, wrapping at 25 so it always counts. */
function daysToXmas(cycle: number): number {
    const bar = Math.floor(cycle);
    return (((24 - Math.floor(bar / 4)) % 25) + 25) % 25;
}

export const workshopDef: VizModeDef = {
    id: 'workshop',
    name: 'PRODUCTION',
    create: () => new WorkshopMode(),
};
