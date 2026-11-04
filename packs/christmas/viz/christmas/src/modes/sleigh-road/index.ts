/**
 * SLEIGH ROAD — Santa's sleigh run along a Christmas ribbon road through the
 * night sky, forked from the app's STAR ROAD kart race. A full-frame
 * cinematic, not a console station: the album cuts to it on the builds,
 * letterboxed, so the HUD keeps to the middle of the frame.
 *
 * Distance is musical time: each hap sits at onset × Z_PER_CYCLE and the
 * camera advances at cycle × Z_PER_CYCLE, so the sleigh reaches every object
 * exactly on its onset. Kicks are glowing snow patches (a boost), snares are
 * gift boxes the sleigh smashes into ribbon and paper, hats are bells to
 * collect, other percussion is a wreath to fly through (one per track per
 * quarter bar, the nearest six drawn, each further one fainter). Pitched notes light
 * tiles across the road by pitch; a held note is a drift, its runner sparks
 * climbing ice, gold, holly, and releasing it fires a sparkle trail. Each
 * unpitched drum track is a rival, a small sleigh or an elf sled in the
 * track's colour, that surges when its track plays.
 *
 * The sleigh takes a smooth line through the patches and gifts ahead; bells
 * lie on that line. Four pairs of reindeer and a red-nosed lead pull it
 * along the same line, galloping, banking into the bends; the lead's nose
 * glows on every beat, and so do the lights on the pines along the verges.
 * Everything is a function of the schedule, the cycle and accumulated time.
 */

import type {Theme, VizMode, VizModeDef, VizServices} from '@cycletron/viz-sdk';
import {type FieldHap, type FieldTeam, HapField, type Rgb, TAU, clamp01, follow, hash32, rand01} from '@cycletron/viz-sdk';
import {
    GOLD, HALF_WIDTH, RoadCamera, type TreeInk, bakeTreeInk, drawRails, drawRoad, drawSigns, drawSpace, drawTrees,
    roadCurve, roadHeading, roadX, roadY, starPath,
} from './road.js';
import {SPARK_TIERS, drawReindeer, drawRival, drawSleigh, drawSparks, drawTrail} from './sleigh.js';
import {
    type HudLayout, type Racer, drawBanner, drawEta, drawItemSlot, drawPlace, drawRoster, drawRoute,
} from './hud.js';

/** Meters per cycle: 28 m/s cruise at 120 BPM. */
const Z_PER_CYCLE = 56;
const LOOKAHEAD = 2;
/** The sleigh rides this far ahead of the camera; objects meet it there. */
const KART_AHEAD = 6.2;
/** Higher and looking further down than STAR ROAD's chase cam, so the team shows over Santa. */
const CAM_HEIGHT = 2.8;
const LOOK = KART_AHEAD + 8;
const LOOK_HEIGHT = 0.3;
/** The sleigh flies this high over the road. */
const HOVER = 0.45;
/** Sprite scale for the sleighs: Santa's sits about 1.3 m tall. */
const SLEIGH_SCALE = 0.68;
const FAR = 230;
const IDLE_SPEED = 14;
const FOV_Y = (50 * Math.PI) / 180;
const REFERENCE_HEIGHT = 1080;

const MAX_HAPS = 420;
const MAX_PER_TRACK = 64;
/** Held notes at least this long are drifts. */
const DRIFT_MIN = 0.5;
/** Seconds of drift for each spark tier. */
const TIER_AT = [0.45, 1.05, 1.65] as const;
/** Boost seconds from a snow patch, then per released tier. */
const PANEL_BOOST = 0.55;
const TIER_BOOST = [0.55, 0.85, 1.15] as const;
const MAX_RIVALS = 7;
const LAPS = 3;
const BARS_PER_LAP = 8;
/** One steering slot. Consecutive patches step by at most this, inside LANE_MAX. */
const LANE_STEP = 1.4;
const LANE_MAX = 2.8;
/** Targets less than this far apart share a gate, so a chord cannot step the line. */
const GATE = 12;
/** Patches stay this far behind the camera so a blend still has its start gate. */
const STEER_BEHIND = 90;
/** Chase camera: fraction of the sleigh's lane it eases toward. */
const CAM_GAIN = 0.3;
const CAM_RATE = 2;
/** Rival surge follower. */
const RIVAL_RATE = 4.2;
const RIVAL_LANES = [-3.2, 3.2, -1.2, 1.2, -4.6, 4.6, 0] as const;
/** The team: pairs ahead of the sleigh, then the lead. */
const PAIRS = 4;
const TEAM_GAP = 1.9;
const TEAM_FIRST = 3.0;
const TEAM_SPREAD = 0.5;

/** Wreaths: one per track per quarter bar, at most this many ahead, each further one fainter. */
const WREATH_GAP = 0.25;
const WREATH_LIVE = 6;
const WREATH_FADE = 0.14;
/** Wreath radius and centre height, m: about 60% of STAR ROAD's ring. */
const WREATH_R = 2.5;
const WREATH_Y = 2.7;

const PANEL_EDGE = '#18262f';
const PANEL_FIELD = '#2c5873';
const PANEL_HOT = '#9fd8ff';
const GIFT_PAPER: readonly Rgb[] = [[200, 36, 44], [40, 130, 72], [214, 170, 90], [226, 230, 236]];
const PAPER_CSS = ['#e0383e', '#3ddc84', '#ffd166', '#f4f1ea', '#e0383e', '#3ddc84'] as const;
const BELL = '#efbd73';
const BELL_DARK = '#9a6a2e';
const BELL_LIGHT = '#fff1c4';
const WREATH = '#2f7d4a';
const WREATH_LIT = '#58c27a';
const BERRY = '#e0383e';

type Kind = 'panel' | 'box' | 'coin' | 'ring' | 'note';

interface Team extends FieldTeam {
    trim: string;
}

interface Thing extends FieldHap<Team> {
    kind: Kind;
    /** Road distance where the sleigh meets it. */
    s: number;
    /** Offset across the road from the centerline. */
    lane: number;
    /** Patch or gift lane has been chosen from the previous gate. */
    steered: boolean;
    flash: number;
    /** Wreaths: rank among the live ones ahead, nearest 0. */
    depth: number;
    /** Wreaths: -1 not yet checked, 0 thinned out, 1 shown. */
    wreath: number;
}

interface Burst {
    kind: 'paper' | 'sparkle';
    lane: number;
    height: number;
    seed: number;
    age: number;
}

interface Rival {
    team: Team;
    ds: number;
    lane: number;
}

function kindFor(team: Team, note: number): Kind {
    if (Number.isFinite(note)) return 'note';
    switch (team.family) {
        case 'kick': return 'panel';
        case 'snare': return 'box';
        case 'hat': return 'coin';
        default: return 'ring';
    }
}

function shadeRgb(rgb: Rgb, k: number): string {
    return `rgb(${Math.round(rgb[0] * k)}, ${Math.round(rgb[1] * k)}, ${Math.round(rgb[2] * k)})`;
}

/** Quintic smootherstep, clamped. Zero velocity and acceleration at both ends. */
function smoother(t: number): number {
    const x = t < 0 ? 0 : t > 1 ? 1 : t;
    return x * x * x * (x * (x * 6 - 15) + 10);
}

class SleighRoadMode implements VizMode {
    private readonly cam = new RoadCamera();
    private readonly field = new HapField<Team, Thing>({
        lookahead: LOOKAHEAD,
        maxHaps: MAX_HAPS,
        maxPerTrack: MAX_PER_TRACK,
        idleRate: IDLE_SPEED / Z_PER_CYCLE,
        team: (base) => ({...base, trim: base.css}),
        hap: (base) => this.makeThing(base),
        keep: (h, cycle) => {
            const cam = cycle * Z_PER_CYCLE;
            if (h.kind === 'note') return h.end * Z_PER_CYCLE + KART_AHEAD >= cam - 2;
            // Steering gates outlive the draw so the line can finish its blend.
            if (h.kind === 'panel' || h.kind === 'box') return h.s >= cam - STEER_BEHIND;
            return h.s >= cam - 2;
        },
    });
    private time = 0;
    private themeKey = '';
    private trees!: TreeInk;

    // Sleigh state, all driven by onsets and the clock.
    private lane = 0;
    private prevLane = 0;
    /** Lane held when the next gate is still out of reach, so a dropped gate doesn't snap the line. */
    private heldLane = 0;
    /** Camera's lateral offset, lagged behind the sleigh. */
    private camLane = 0;
    private bob = 0;
    private lean = 0;
    private boost = 0;
    private boostTier = 0;
    private fov = 0;
    private pulse = 0;
    private signFlash = 0;
    private drifting = false;
    private driftTier = -1;
    private driftCharge = 0;
    private bells = 0;
    private item = -1;
    private itemSpin = 0;
    private itemHold = 0;
    private readonly bursts: Burst[] = [];
    private readonly rivals: Rival[] = [];
    /** Smoothed along-track offset per rival team. */
    private readonly rivalDs = new Map<Team, number>();
    private readonly steerS: number[] = [];
    private readonly steerLane: number[] = [];
    private readonly drawList: Thing[] = [];
    private readonly fresh: Thing[] = [];
    /** Onset of the last wreath shown, per track. */
    private readonly lastWreath = new Map<Team, number>();

    private vw = 0;
    private vh = 0;
    private renderScale = 1;
    private sc = 1;
    private focal = 800;

    layout(s: VizServices): void {
        this.renderScale = Math.max(1, s.height / REFERENCE_HEIGHT);
        this.vw = s.width / this.renderScale;
        this.vh = s.height / this.renderScale;
        this.sc = Math.max(0.55, this.vh / REFERENCE_HEIGHT);
        this.focal = this.vh / 2 / Math.tan(FOV_Y / 2);
        this.themeKey = '';
        this.ensurePalette(s.theme);
        this.field.invalidate();
    }

    private get camS(): number {
        return this.field.cycle * Z_PER_CYCLE;
    }

    private makeThing(base: FieldHap<Team>): Thing {
        const kind = kindFor(base.team, base.note);
        let lane = 0;
        if (kind === 'note') {
            // Pitch runs across the road, low on the left.
            const n = Math.min(96, Math.max(36, base.note));
            lane = -HALF_WIDTH + 1 + ((n - 36) / 60) * (HALF_WIDTH * 2 - 2);
        }
        // Patch and gift lanes are chosen in time order by placeLanes, once.
        return {...base, kind, s: base.begin * Z_PER_CYCLE + KART_AHEAD, lane, steered: false, flash: 0, depth: 0, wreath: -1};
    }

    // ---------------------------------------------------------------------
    // Update
    // ---------------------------------------------------------------------

    update(dt: number, s: VizServices): void {
        this.time += dt;
        this.ensurePalette(s.theme);
        this.field.update(dt, s);
        const bpm = Math.max(30, s.bpm);
        if (this.field.restarted) {
            this.bursts.length = 0;
            this.boost = 0;
            this.drifting = false;
            this.driftTier = -1;
            this.heldLane = 0;
            this.rivalDs.clear();
            this.lastWreath.clear();
        }
        this.thinWreaths();

        // Lanes before hits, so a gift smashed on its first frame bursts where it sits.
        this.placeLanes();
        for (const h of this.field.haps) {
            if (this.field.crossed(h)) this.hit(h);
            h.flash *= Math.exp(-dt * 5);
        }

        this.buildSteer();
        const kartS = this.camS + KART_AHEAD;
        const line = this.lineAt(kartS);
        // Commit the hold only once a gate is reached, so the ramp into the next keeps a fixed start.
        if (this.steerS.length > 0 && kartS >= this.steerS[0]) this.heldLane = line;
        this.updateDrift(bpm);
        if (this.field.restarted) {
            this.lane = this.prevLane = line;
            this.camLane = line * CAM_GAIN;
            this.lean = 0;
        } else {
            const vLat = dt > 1e-4 ? (line - this.prevLane) / dt : 0;
            this.prevLane = this.lane = line;
            this.camLane = follow(this.camLane, line * CAM_GAIN, dt, CAM_RATE, CAM_RATE);
            const dir = Math.sign(roadCurve(kartS)) || 1;
            // Lean follows lateral speed, and a drift adds a small held tilt.
            const steerLean = Math.max(-0.18, Math.min(0.18, vLat * 0.04));
            const driftLean = this.drifting ? dir * 0.28 : 0;
            const leanTarget = Math.max(-0.36, Math.min(0.36, steerLean + driftLean));
            this.lean = follow(this.lean, leanTarget, dt, 4, 3);
        }

        // The sleigh floats: a slow rise and fall, lifted a little on a kick.
        const idleBob = 0.05 * (0.5 - 0.5 * Math.cos(this.time * 2.4));
        this.bob = follow(this.bob, idleBob + this.pulse * 0.04, dt, 6, 3);
        this.boost = Math.max(0, this.boost - dt);
        this.fov = follow(this.fov, this.boost > 0 ? 1 : 0, dt, 4.5, 2.6);
        this.pulse *= Math.exp(-dt * 6);
        this.signFlash *= Math.exp(-dt * 5);
        this.itemSpin = Math.max(0, this.itemSpin - dt);
        if (this.itemSpin <= 0) {
            this.itemHold = Math.max(0, this.itemHold - dt);
            if (this.itemHold <= 0) this.item = -1;
        }
        for (let i = this.bursts.length - 1; i >= 0; i--) {
            this.bursts[i].age += dt;
            if (this.bursts[i].age > 0.5) this.bursts.splice(i, 1);
        }
        this.updateRivals(dt);
    }

    private ensurePalette(t: Theme): void {
        const key = t.bg + t.neon;
        if (key === this.themeKey) return;
        this.themeKey = key;
        this.trees = bakeTreeInk(t);
    }

    private hit(h: Thing): void {
        h.flash = 1;
        h.team.activity = Math.min(1, h.team.activity + 0.5);
        h.team.trim = shadeRgb(h.team.rgb, 0.55);
        switch (h.kind) {
            case 'panel':
                h.done = true;
                this.startBoost(PANEL_BOOST, 1);
                this.pulse = 1;
                break;
            case 'box':
                h.done = true;
                this.burst('paper', h.lane, 1.1, h.seed);
                this.item = h.seed % 4;
                this.itemSpin = 1;
                this.itemHold = 2;
                this.signFlash = 1;
                break;
            case 'coin':
                h.done = true;
                this.bells = Math.min(999, this.bells + 1);
                this.burst('sparkle', this.lane + (h.seed & 1 ? 0.9 : -0.9), 1.1, h.seed);
                break;
            case 'ring':
            case 'note':
                break;
        }
    }

    /**
     * Decide each new wreath once, in onset order: one within a quarter bar
     * of the last one shown on its track is thinned out.
     */
    private thinWreaths(): void {
        const fresh = this.fresh;
        fresh.length = 0;
        for (const h of this.field.haps) if (h.kind === 'ring' && h.wreath < 0) fresh.push(h);
        if (fresh.length === 0) return;
        fresh.sort((a, b) => a.begin - b.begin || a.seed - b.seed);
        for (const h of fresh) {
            const last = this.lastWreath.get(h.team);
            h.wreath = last !== undefined && h.begin - last < WREATH_GAP ? 0 : 1;
            if (h.wreath === 1) this.lastWreath.set(h.team, h.begin);
        }
        fresh.length = 0;
    }

    private startBoost(seconds: number, tier: number): void {
        this.boost = Math.max(this.boost, seconds);
        this.boostTier = tier;
    }

    private burst(kind: Burst['kind'], lane: number, height: number, seed: number): void {
        this.bursts.push({kind, lane, height, seed, age: 0});
        if (this.bursts.length > 40) this.bursts.shift();
    }

    /**
     * Give each new patch and gift a lane one slot from the previous gate, in
     * onset order. A lane sticks: dropping an old gate must not reshuffle the
     * ones still ahead.
     */
    private placeLanes(): void {
        const all = this.field.haps.filter((h) => h.kind === 'panel' || h.kind === 'box');
        all.sort((a, b) => a.s - b.s || a.seed - b.seed);
        let anchor = 0;
        let anchorS = -Infinity;
        for (const h of all) {
            const sameGate = h.s - anchorS < GATE;
            if (!h.steered) {
                const dir = ((h.seed >>> 3) % 3) - 1;
                let lane = anchor + dir * LANE_STEP;
                if (lane > LANE_MAX) lane = anchor - LANE_STEP;
                else if (lane < -LANE_MAX) lane = anchor + LANE_STEP;
                h.lane = Math.max(-LANE_MAX, Math.min(LANE_MAX, lane));
                h.steered = true;
            }
            if (!sameGate) {
                anchor = h.lane;
                anchorS = h.s;
            }
        }
    }

    /** One gate per GATE meters: the first target's lane is the line there. */
    private buildSteer(): void {
        const raw = this.field.haps.filter((h) => h.kind === 'panel' || h.kind === 'box');
        raw.sort((a, b) => a.s - b.s || a.seed - b.seed);
        const ss = this.steerS, ll = this.steerLane;
        ss.length = 0;
        ll.length = 0;
        for (const h of raw) {
            if (ss.length > 0 && h.s - ss[ss.length - 1] < GATE) continue;
            ss.push(h.s);
            ll.push(h.lane);
        }
    }

    /**
     * Racing line at road distance `s`. Quintic so the sleigh arrives at each
     * gate without a kink. Before the first gate in view, hold `heldLane`.
     */
    private lineAt(s: number): number {
        const ss = this.steerS, ll = this.steerLane;
        const n = ss.length;
        if (n === 0) return this.heldLane;
        if (s <= ss[0]) {
            const dist = ss[0] - s;
            if (dist >= GATE) return this.heldLane;
            return this.heldLane + (ll[0] - this.heldLane) * smoother(1 - dist / GATE);
        }
        let i = 1;
        while (i < n && ss[i] <= s) i++;
        if (i >= n) return ll[n - 1];
        const span = Math.max(ss[i] - ss[i - 1], GATE);
        return ll[i - 1] + (ll[i] - ll[i - 1]) * smoother((s - (ss[i] - span)) / span);
    }

    /** A held note under the sleigh is a drift; releasing it fires the trail at the tier reached. */
    private updateDrift(bpm: number): void {
        const c = this.field.cycle;
        let held: Thing | null = null;
        for (const h of this.field.haps) {
            if (h.kind !== 'note' || !h.seen || h.end - h.begin < DRIFT_MIN) continue;
            if (h.begin <= c && c < h.end && (!held || h.begin < held.begin)) held = h;
        }
        if (held && this.field.locked) {
            const seconds = (c - held.begin) * 240 / bpm;
            this.drifting = true;
            this.driftTier = seconds >= TIER_AT[2] ? 2 : seconds >= TIER_AT[1] ? 1 : seconds >= TIER_AT[0] ? 0 : -1;
            this.driftCharge = clamp01(seconds / TIER_AT[2]);
            return;
        }
        if (this.drifting && this.driftTier >= 0) this.startBoost(TIER_BOOST[this.driftTier], this.driftTier === 2 ? 2 : 0);
        this.drifting = false;
        this.driftTier = -1;
        this.driftCharge = 0;
    }

    /** One rival per unpitched drum track, surging when its track plays. */
    private updateRivals(dt: number): void {
        this.rivals.length = 0;
        const live = new Set<Team>();
        for (const t of this.field.teams) {
            if (t.pitched || this.rivals.length >= MAX_RIVALS) continue;
            live.add(t);
            // Slot, not roster index: a rival leaving must not slide the others sideways.
            const lane = RIVAL_LANES[t.slot % RIVAL_LANES.length] + 0.6 * Math.sin(this.time * 0.5 + t.slot);
            const dsTarget = 9 * Math.sin(this.time * 0.17 + t.slot * 1.9) + 16 * (t.activity - 0.3);
            let ds = this.rivalDs.get(t);
            ds = ds === undefined ? dsTarget : follow(ds, dsTarget, dt, RIVAL_RATE, RIVAL_RATE);
            this.rivalDs.set(t, ds);
            this.rivals.push({team: t, ds, lane});
        }
        for (const t of this.rivalDs.keys()) if (!live.has(t)) this.rivalDs.delete(t);
    }

    // ---------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------

    /** 1 on each beat, falling to 0 by the next: the nose and the tree lights. */
    private beatGlow(): number {
        const c = this.field.cycle * 4;
        const f = c - Math.floor(c);
        return (1 - f) * (1 - f);
    }

    render(ctx: CanvasRenderingContext2D, s: VizServices): void {
        const {vw, vh} = this;
        const camS = this.camS;
        const kartS = camS + KART_AHEAD;
        const f = this.focal / (1 + 0.17 * this.fov);
        this.cam.set(camS, this.camLane, CAM_HEIGHT, LOOK, LOOK_HEIGHT, f, vw / 2, vh / 2);
        const heading = roadHeading(camS);
        const roll = Math.max(-0.2, Math.min(0.2, roadCurve(kartS) * 16));

        ctx.save();
        ctx.scale(this.renderScale, this.renderScale);
        drawSpace(ctx, vw, vh, heading, this.time, s.theme);

        ctx.save();
        // Bank into the bends; oversize the clear so corners never show.
        ctx.translate(vw / 2, vh / 2);
        ctx.rotate(roll);
        ctx.translate(-vw / 2, -vh / 2);
        drawSigns(ctx, this.cam, FAR, this.time, this.signFlash);
        drawRoad(ctx, this.cam, FAR, this.pulse, s.theme);
        this.drawDecals(ctx);
        drawRails(ctx, this.cam, FAR, this.pulse);
        drawTrees(ctx, this.cam, this.trees, this.beatGlow(), this.time);
        this.drawUprights(ctx, kartS);
        this.drawBursts(ctx, kartS);
        ctx.restore();

        this.drawSpeedLines(ctx);
        this.drawHud(ctx, s);
        ctx.restore();
    }

    private visible(h: Thing): boolean {
        if (h.done && h.kind !== 'note' && h.kind !== 'ring') return false;
        const d = h.s - this.cam.s;
        return h.fade > 0.01 && d < FAR && (h.kind === 'note' ? h.end * Z_PER_CYCLE + KART_AHEAD - this.cam.s > 0.6 : d > 0.6);
    }

    /** Flat things on the road: note tiles and snow patches. */
    private drawDecals(ctx: CanvasRenderingContext2D): void {
        const list = this.field.haps.filter((h) => (h.kind === 'note' || h.kind === 'panel') && this.visible(h))
            .sort((a, b) => b.s - a.s);
        for (const h of list) {
            ctx.globalAlpha = h.fade;
            if (h.kind === 'note') this.drawNoteTile(ctx, h);
            else this.drawPanel(ctx, h);
        }
        ctx.globalAlpha = 1;
    }

    /** A road-hugging quad from s0 to s1 across [x0, x1], split to follow bends. */
    private roadQuad(ctx: CanvasRenderingContext2D, s0: number, s1: number, x0: number, x1: number, lift = 0.02): boolean {
        const {cam} = this;
        s0 = Math.max(s0, cam.s + 0.7);
        if (s1 <= s0) return false;
        const steps = Math.max(1, Math.ceil((s1 - s0) / 4));
        const left: number[] = [];
        const right: number[] = [];
        for (let i = 0; i <= steps; i++) {
            const s = s0 + (s1 - s0) * (i / steps);
            const cx = roadX(s), y = roadY(s) + lift;
            if (!cam.project(cx + x0, y, s)) return false;
            left.push(cam.sx, cam.sy);
            cam.project(cx + x1, y, s);
            right.push(cam.sx, cam.sy);
        }
        ctx.beginPath();
        ctx.moveTo(left[0], left[1]);
        for (let i = 2; i < left.length; i += 2) ctx.lineTo(left[i], left[i + 1]);
        for (let i = right.length - 2; i >= 0; i -= 2) ctx.lineTo(right[i], right[i + 1]);
        ctx.closePath();
        return true;
    }

    private drawNoteTile(ctx: CanvasRenderingContext2D, h: Thing): void {
        const len = Math.max(1.6, Math.min(h.end - h.begin, 1) * Z_PER_CYCLE);
        if (!this.roadQuad(ctx, h.s, h.s + len, h.lane - 0.55, h.lane + 0.55)) return;
        const a = ctx.globalAlpha;
        ctx.fillStyle = h.team.css;
        ctx.globalAlpha = a * (0.22 + 0.6 * h.flash);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1 + 2 * h.flash;
        ctx.globalAlpha = a * (0.35 + 0.55 * h.flash);
        ctx.stroke();
        ctx.globalAlpha = a;
    }

    /** Snow patch: a dark frame, an icy field and white chevrons sliding forward. */
    private drawPanel(ctx: CanvasRenderingContext2D, h: Thing): void {
        const {cam} = this;
        const half = 0.9, len = 1.6;
        if (!this.roadQuad(ctx, h.s - len - 0.12, h.s + len + 0.12, h.lane - half - 0.14, h.lane + half + 0.14)) return;
        ctx.fillStyle = PANEL_EDGE;
        ctx.fill();
        if (!this.roadQuad(ctx, h.s - len, h.s + len, h.lane - half, h.lane + half, 0.03)) return;
        ctx.fillStyle = PANEL_FIELD;
        ctx.fill();
        if (this.roadQuad(ctx, h.s - len, h.s + len, h.lane - half * 0.45, h.lane + half * 0.45, 0.035)) {
            ctx.fillStyle = PANEL_HOT;
            ctx.fill();
        }
        // Chevrons are shapes on the surface, so they foreshorten with it.
        ctx.fillStyle = '#ffffff';
        const pt = (s: number, x: number): boolean => cam.project(roadX(s) + h.lane + x, roadY(s) + 0.05, s);
        const scroll = (this.time * 6) % 1.05;
        for (let i = 0; i < 3; i++) {
            const tip = h.s - len + 0.75 + i * 1.05 + scroll;
            if (tip > h.s + len - 0.05) continue;
            const back = tip - 0.6, w = half * 0.8, t = 0.32;
            const ring: Array<[number, number]> = [[back, -w], [tip, 0], [back, w], [back + t, w], [tip + t, 0], [back + t, -w]];
            ctx.beginPath();
            let ok = true;
            for (const [ps, px] of ring) {
                if (!pt(ps, px)) { ok = false; break; }
                ctx.lineTo(cam.sx, cam.sy);
            }
            if (!ok) continue;
            ctx.closePath();
            ctx.fill();
        }
    }

    /** Bells, gifts, wreaths, rivals and the sleigh, far to near. */
    private drawUprights(ctx: CanvasRenderingContext2D, kartS: number): void {
        const list = this.drawList;
        list.length = 0;
        for (const h of this.field.haps) {
            if (h.kind === 'ring' && h.wreath !== 1) continue;
            if ((h.kind === 'coin' || h.kind === 'box' || h.kind === 'ring') && this.visible(h)) list.push(h);
        }
        list.sort((a, b) => b.s - a.s);
        // Rank the wreaths nearest first; past WREATH_LIVE they are not drawn.
        let rank = 0;
        for (let i = list.length - 1; i >= 0; i--) if (list[i].kind === 'ring') list[i].depth = rank++;
        const rivals = this.rivals.slice().sort((a, b) => b.ds - a.ds);
        let r = 0;
        let player = false;
        const drawRivalsAbove = (s: number) => {
            while (r < rivals.length && kartS + rivals[r].ds > s) this.drawRivalAt(ctx, rivals[r++], kartS);
        };
        for (const h of list) {
            drawRivalsAbove(h.s);
            if (!player && h.s < kartS) {
                this.drawPlayer(ctx, kartS);
                player = true;
            }
            ctx.globalAlpha = h.fade;
            if (h.kind === 'coin') this.drawBell(ctx, h);
            else if (h.kind === 'box') this.drawGift(ctx, h);
            else if (h.depth < WREATH_LIVE) this.drawWreath(ctx, h, h.fade * (1 - h.depth * WREATH_FADE));
            ctx.globalAlpha = 1;
        }
        drawRivalsAbove(kartS);
        if (!player) this.drawPlayer(ctx, kartS);
        drawRivalsAbove(-Infinity);
    }

    /** A rival: small sleighs (even slots) bring one reindeer pair; elf sleds (odd) don't. */
    private drawRivalAt(ctx: CanvasRenderingContext2D, v: Rival, kartS: number): void {
        const s = kartS + v.ds;
        const elf = (v.team.slot & 1) === 1;
        const tilt = Math.sin(this.time * 1.3 + v.team.slot) * 0.15;
        ctx.globalAlpha = v.team.fade;
        if (!elf) {
            const rs = s + TEAM_FIRST;
            const phase0 = Math.floor(this.time * 8 + v.team.slot);
            for (const side of [-1, 1]) {
                if (!this.cam.project(roadX(rs) + v.lane + side * TEAM_SPREAD * 0.8, roadY(rs), rs)) continue;
                drawReindeer(ctx, this.cam.sx, this.cam.sy, this.cam.f / this.cam.d, HOVER * 0.6 + 0.3, (phase0 + (side > 0 ? 1 : 0)) & 1, tilt * 0.4, 0);
            }
        }
        if (this.cam.project(roadX(s) + v.lane, roadY(s) + HOVER * 0.6, s)) {
            drawRival(ctx, this.cam.sx, this.cam.sy, this.cam.f / this.cam.d * SLEIGH_SCALE, v.team.css, v.team.trim, tilt, elf);
        }
        ctx.globalAlpha = 1;
    }

    /** The team on the racing line ahead, the harness, then the sleigh. */
    private drawPlayer(ctx: CanvasRenderingContext2D, kartS: number): void {
        const {cam} = this;
        const nose = this.beatGlow();
        const curve = Math.max(-0.25, Math.min(0.25, roadCurve(kartS) * 30));
        // Collar points for the harness, sleigh first: [x, y] per side.
        const reinL: number[] = [], reinR: number[] = [];
        const team: Array<() => void> = [];
        // The lead runs alone in front, then the pairs back to the sleigh.
        for (let p = PAIRS; p >= 0; p--) {
            const s = kartS + TEAM_FIRST + p * TEAM_GAP;
            const lane = this.lineAt(s);
            const lift = HOVER + 0.4 + p * 0.12 + this.bob;
            const sides = p === PAIRS ? [0] : [-1, 1];
            for (const side of sides) {
                const n = p * 2 + (side > 0 ? 1 : 0);
                if (!cam.project(roadX(s) + lane + side * TEAM_SPREAD, roadY(s), s)) continue;
                const x = cam.sx, y = cam.sy, k = cam.f / cam.d;
                const phase = (Math.floor(this.time * 8) + n) & 1;
                const rock = curve + 0.06 * Math.sin(this.time * 12 + n * 1.7);
                const gallop = phase === 0 ? 0.04 : 0;
                team.push(() => {
                    // Shadow on the road, then the deer.
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
                    ctx.beginPath();
                    ctx.ellipse(x, y, 0.22 * k, 0.05 * k, 0, 0, TAU);
                    ctx.fill();
                    drawReindeer(ctx, x, y, k, lift + gallop, phase, rock, p === PAIRS ? nose : 0);
                });
                const cy = y - (lift + gallop - 0.18) * k;
                if (side <= 0) reinL.push(x, cy);
                if (side >= 0) reinR.push(x, cy);
            }
        }
        for (const draw of team) draw();

        if (!cam.project(roadX(kartS) + this.lane, roadY(kartS), kartS)) return;
        const gx = cam.sx, gy = cam.sy;
        const k = cam.f / cam.d;
        const ry = gy - (HOVER + this.bob) * k;
        // The harness: two lit traces from the sleigh's front through each collar.
        for (const [pts, dx] of [[reinL, -0.4], [reinR, 0.4]] as const) {
            if (pts.length < 2) continue;
            ctx.beginPath();
            ctx.moveTo(gx + dx * k * SLEIGH_SCALE, ry - 0.9 * k * SLEIGH_SCALE);
            for (let i = pts.length - 2; i >= 0; i -= 2) ctx.lineTo(pts[i], pts[i + 1]);
            ctx.strokeStyle = GOLD;
            ctx.lineWidth = Math.max(2, 0.05 * k);
            ctx.globalAlpha = 0.25;
            ctx.stroke();
            ctx.lineWidth = Math.max(1, 0.015 * k);
            ctx.globalAlpha = 0.9;
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
        // The sleigh's shadow stays on the road as it floats.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.ellipse(gx, gy, 0.6 * k, 0.1 * k, 0, 0, TAU);
        ctx.fill();
        const sk = k * SLEIGH_SCALE;
        drawSparks(ctx, gx, ry, sk, this.drifting ? this.driftTier : -1, this.time, this.lean);
        drawSleigh(ctx, gx, ry, sk, this.lean);
        const idle = this.field.locked ? 0.12 : 0;
        drawTrail(ctx, gx, ry, sk, Math.max(idle, Math.min(1, this.boost / 0.55)), this.time, this.boostTier, this.lean);
    }

    /** A bell swinging over the line; you collect it. */
    private drawBell(ctx: CanvasRenderingContext2D, h: Thing): void {
        const lane = this.lineAt(h.s);
        if (!this.cam.project(roadX(h.s) + lane, roadY(h.s) + HOVER + 0.75, h.s)) return;
        const k = this.cam.f / this.cam.d;
        const r = 0.34 * k;
        if (r < 0.8) return;
        const {sx, sy} = this.cam;
        ctx.save();
        ctx.translate(sx, sy - r);
        ctx.rotate(Math.sin(this.time * 5 + (h.seed % 13)) * 0.4);
        ctx.fillStyle = BELL;
        ctx.strokeStyle = BELL_DARK;
        ctx.lineWidth = Math.max(1, r * 0.12);
        ctx.beginPath();
        ctx.moveTo(-r * 0.9, r * 1.6);
        ctx.quadraticCurveTo(-r * 0.6, r * 1.3, -r * 0.55, r * 0.6);
        ctx.arc(0, r * 0.6, r * 0.55, Math.PI, 0);
        ctx.quadraticCurveTo(r * 0.6, r * 1.3, r * 0.9, r * 1.6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = BELL_LIGHT;
        ctx.fillRect(-r * 0.32, r * 0.35, r * 0.14, r * 0.9);
        ctx.fillStyle = BELL_DARK;
        ctx.beginPath();
        ctx.arc(0, r * 1.75, r * 0.2, 0, TAU);
        ctx.fill();
        ctx.restore();
    }

    /** Gift box: a slowly turning wrapped cube with a gold ribbon round it and a bow on top. */
    private drawGift(ctx: CanvasRenderingContext2D, h: Thing): void {
        const {cam} = this;
        const size = 0.52;
        const bob = Math.sin(this.time * 2.2 + h.seed) * 0.12;
        const yaw = this.time * 0.8 + (h.seed % 100) * 0.07;
        const cx = roadX(h.s) + h.lane, cy = roadY(h.s) + HOVER + 0.8 + bob, cz = h.s;
        const px: number[] = [], py: number[] = [];
        for (let i = 0; i < 8; i++) {
            const ux = (i & 1 ? 1 : -1) * size, uy = (i & 2 ? 1 : -1) * size, uz = (i & 4 ? 1 : -1) * size;
            const x = ux * Math.cos(yaw) - uz * Math.sin(yaw);
            const z = ux * Math.sin(yaw) + uz * Math.cos(yaw);
            if (!cam.project(cx + x, cy + uy, cz + z)) return;
            px.push(cam.sx);
            py.push(cam.sy);
        }
        const paper = GIFT_PAPER[h.seed % GIFT_PAPER.length];
        const ribbon = paper[0] > 200 && paper[1] > 200 ? '#e0383e' : '#ffd166';
        const faces = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 2, 6, 4], [1, 5, 7, 3], [0, 4, 5, 1], [2, 3, 7, 6]];
        const shade = [0.8, 0.8, 0.62, 0.62, 0.5, 1];
        faces.forEach((f, i) => {
            const area = (px[f[1]] - px[f[0]]) * (py[f[2]] - py[f[0]]) - (py[f[1]] - py[f[0]]) * (px[f[2]] - px[f[0]]);
            if (area >= 0) return;
            ctx.fillStyle = shadeRgb(paper, shade[i]);
            ctx.beginPath();
            ctx.moveTo(px[f[0]], py[f[0]]);
            for (let k = 1; k < 4; k++) ctx.lineTo(px[f[k]], py[f[k]]);
            ctx.closePath();
            ctx.fill();
            // The ribbon crosses each face through the midpoints of its edges.
            ctx.strokeStyle = ribbon;
            ctx.lineWidth = Math.max(1, Math.abs(px[f[1]] - px[f[0]]) * 0.12 + 1);
            ctx.beginPath();
            ctx.moveTo((px[f[0]] + px[f[1]]) / 2, (py[f[0]] + py[f[1]]) / 2);
            ctx.lineTo((px[f[2]] + px[f[3]]) / 2, (py[f[2]] + py[f[3]]) / 2);
            ctx.moveTo((px[f[1]] + px[f[2]]) / 2, (py[f[1]] + py[f[2]]) / 2);
            ctx.lineTo((px[f[3]] + px[f[0]]) / 2, (py[f[3]] + py[f[0]]) / 2);
            ctx.stroke();
        });
        if (!cam.project(cx, cy + size, cz)) return;
        const k = cam.f / cam.d;
        ctx.fillStyle = ribbon;
        ctx.beginPath();
        ctx.ellipse(cam.sx - 0.18 * k, cam.sy - 0.1 * k, 0.18 * k, 0.1 * k, -0.5, 0, TAU);
        ctx.ellipse(cam.sx + 0.18 * k, cam.sy - 0.1 * k, 0.18 * k, 0.1 * k, 0.5, 0, TAU);
        ctx.fill();
    }

    /** A wreath standing over the road at `alpha`; it lights as you fly through. */
    private drawWreath(ctx: CanvasRenderingContext2D, h: Thing, alpha: number): void {
        if (!this.cam.project(roadX(h.s), roadY(h.s) + WREATH_Y, h.s)) return;
        const k = this.cam.f / this.cam.d;
        const {sx, sy} = this.cam;
        const R = WREATH_R * k;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = WREATH;
        ctx.lineWidth = Math.max(1.5, 0.13 * k);
        ctx.beginPath();
        ctx.arc(sx, sy, R, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = WREATH_LIT;
        ctx.lineWidth = Math.max(1, 0.06 * k);
        ctx.globalAlpha = alpha * (0.6 + 0.4 * h.flash);
        ctx.beginPath();
        ctx.arc(sx, sy, R - 0.08 * k, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = BERRY;
        const br = Math.max(1, 0.06 * k);
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const a = (i / 10) * TAU + 0.3;
            ctx.moveTo(sx + Math.cos(a) * R + br, sy + Math.sin(a) * R);
            ctx.arc(sx + Math.cos(a) * R, sy + Math.sin(a) * R, br, 0, TAU);
        }
        ctx.fill();
        // The bow at the bottom.
        const bx = sx, by = sy + R;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx - 0.21 * k, by - 0.12 * k); ctx.lineTo(bx - 0.21 * k, by + 0.12 * k); ctx.closePath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + 0.21 * k, by - 0.12 * k); ctx.lineTo(bx + 0.21 * k, by + 0.12 * k); ctx.closePath();
        ctx.fill();
    }

    /** Bursts ride with the sleigh, at the point it hit them: paper and ribbon, or a gold sparkle. */
    private drawBursts(ctx: CanvasRenderingContext2D, kartS: number): void {
        const {cam} = this;
        ctx.save();
        for (const b of this.bursts) {
            const s = kartS + 1.5 + b.age * 4;
            if (!cam.project(roadX(s) + b.lane, roadY(s) + HOVER + b.height, s)) continue;
            const k = cam.f / cam.d;
            const t = b.age / 0.5;
            const x = cam.sx, y = cam.sy;
            ctx.globalAlpha = 1 - t;
            if (b.kind === 'paper') {
                for (let i = 0; i < 12; i++) {
                    const h = hash32(b.seed, i);
                    const ang = rand01(h) * TAU;
                    const dist = (4 + rand01(hash32(h, 1)) * 3) * b.age * k;
                    const sx = x + Math.cos(ang) * dist, sy = y + Math.sin(ang) * dist + 6 * b.age * b.age * k;
                    const sz = 0.22 * k * (1 - t * 0.5);
                    ctx.fillStyle = PAPER_CSS[i % PAPER_CSS.length];
                    ctx.beginPath();
                    ctx.moveTo(sx, sy - sz);
                    ctx.lineTo(sx + sz * Math.cos(ang + 2), sy + sz);
                    ctx.lineTo(sx - sz, sy + sz * 0.4);
                    ctx.closePath();
                    ctx.fill();
                }
                // Ribbon curls.
                ctx.strokeStyle = '#ffd166';
                ctx.lineWidth = Math.max(1, 0.05 * k);
                ctx.beginPath();
                for (let i = 0; i < 4; i++) {
                    const ang = rand01(hash32(b.seed, 40 + i)) * TAU;
                    const d = 3.5 * b.age * k;
                    const cx = x + Math.cos(ang) * d, cy = y + Math.sin(ang) * d;
                    ctx.moveTo(cx + 0.2 * k, cy);
                    ctx.arc(cx, cy, 0.2 * k, 0, Math.PI * 1.5 + t * 2);
                }
                ctx.stroke();
            } else {
                ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = 'rgb(255, 236, 170)';
                ctx.beginPath();
                starPath(ctx, x, y - t * 0.6 * k, (0.1 + 0.12 * t) * k, t * 2);
                ctx.fill();
                ctx.globalCompositeOperation = 'source-over';
            }
        }
        ctx.restore();
    }

    /** Boost streaks in the outer frame, never over the sleigh. */
    private drawSpeedLines(ctx: CanvasRenderingContext2D): void {
        if (this.boost <= 0 && this.fov < 0.3) return;
        const {vw, vh} = this;
        const cx = vw / 2, cy = vh * 0.45;
        const R = Math.hypot(vw, vh) / 2;
        ctx.save();
        ctx.lineWidth = 2 * this.sc;
        ctx.lineCap = 'round';
        for (let i = 0; i < 18; i++) {
            const h = hash32(i, 313);
            const life = (this.time * 4 + rand01(h)) % 1;
            const ang = rand01(hash32(h, Math.floor(this.time * 4 + rand01(h)))) * TAU;
            const r0 = R * (0.62 + life * 0.45);
            const len = (50 + rand01(hash32(h, 2)) * 90) * this.sc;
            ctx.strokeStyle = i % 3 === 0 ? 'rgba(255, 90, 90, 0.7)' : 'rgba(244, 241, 234, 0.7)';
            ctx.globalAlpha = Math.sin(life * Math.PI) * this.fov;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
            ctx.lineTo(cx + Math.cos(ang) * (r0 + len), cy + Math.sin(ang) * (r0 + len));
            ctx.stroke();
        }
        ctx.restore();
    }

    private drawHud(ctx: CanvasRenderingContext2D, s: VizServices): void {
        const L: HudLayout = {vw: this.vw, vh: this.vh, sc: this.sc, theme: s.theme};
        const bpm = Math.max(30, s.bpm);
        const cycle = this.field.locked ? s.cycle : 0;
        const bar = Math.floor(cycle);
        const race = LAPS * BARS_PER_LAP;
        const leg = Math.floor(bar / BARS_PER_LAP) % LAPS + 1;
        const eta = (Math.floor(bar / race + 1) * race - cycle) * 240 / bpm;

        const field: Array<{ds: number; racer: Racer}> = this.rivals.map((v) => ({
            ds: v.ds,
            racer: {label: v.team.name.slice(0, 3).toUpperCase(), css: v.team.css, player: false},
        }));
        field.push({ds: 0, racer: {label: 'SANTA', css: '#e0383e', player: true}});
        field.sort((a, b) => b.ds - a.ds);
        const place = field.findIndex((r) => r.racer.player) + 1;

        drawEta(ctx, L, eta, bar, leg, LAPS, this.field.locked);
        if (this.vw >= 580 && this.vh >= 420) drawRoster(ctx, L, field.map((r) => r.racer));
        drawItemSlot(ctx, L, this.item, this.itemSpin, this.time);
        const charge = this.drifting ? this.driftCharge : clamp01(this.boost / TIER_BOOST[2]);
        const chargeCss = this.drifting && this.driftTier >= 0 ? SPARK_TIERS[this.driftTier][0] : '#ffb020';
        drawPlace(ctx, L, place, this.bells, charge, chargeCss);
        drawRoute(ctx, L, this.camS + KART_AHEAD, 40, FAR * 0.6,
            this.rivals.map((v) => ({ds: v.ds, lane: v.lane, css: v.team.css})), this.lane);
        // FINAL LEG for the first 1.5 s of the last leg, then a fade.
        if (leg === LAPS && this.field.locked) {
            const start = bar - (bar % BARS_PER_LAP);
            const t = (cycle - start) * 240 / bpm;
            drawBanner(ctx, L, 'FINAL LEG', t < 1.5 ? 1 : clamp01(1 - (t - 1.5) / 0.5));
        }
    }
}

export const sleighRoadDef: VizModeDef = {
    id: 'sleigh-road',
    name: 'SLEIGH ROAD',
    create: () => new SleighRoadMode(),
};
