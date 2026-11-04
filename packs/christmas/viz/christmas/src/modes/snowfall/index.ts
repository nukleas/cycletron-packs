/**
 * SAT FEED — station STN-04 of the SLEIGHCON room: the satellite picture of
 * the village the operators protect on a silent night, inside the shared
 * console. A starry sky with the Milky Way, aurora and a crescent moon over
 * snow-capped mountains, a pine treeline and a two-tier village with a church,
 * smoking chimneys and a town Christmas tree; a snowfield with a fence, pines,
 * a bare tree, a snowman and a streetlamp; three layers of snow over it all.
 * Life in the village: four reindeer walk the snowfield (two grazing, one with
 * a red nose lit on the beat), Santa pops out of a chimney about one bar in
 * six, and about one bar in ten the sleigh and its team cross the sky.
 * Every pitched note blooms a star in its track's colour: pitch class is the
 * column, register is the height. A star sparkles while its note is held,
 * twinkling by the eighth bar, and shrinks through its tail.
 * Kicks shake the ground, bob the reindeer's heads and hop the sleigh; snares
 * fire a shooting star; hats gust the snow sideways; other drums light every
 * window. A reticle drifts over the picture on a slow sine and its target box
 * slides to the brightest star, the longest held among equals (the village
 * centre when none). The readout top left is the Pole's position, altitude,
 * weather (visibility falls with the high band) and the pass countdown; the
 * flag top right follows the alert level. At SLEIGHCON 2 the frame pulls to
 * the alert colour; at 1 the reticle goes with it and the flag blinks.
 *
 * The scene, the snow, the herd, the chimney pop and the fly-by are pure
 * functions of the layout and the cycle, so the frame is the same from a cold
 * start and from a seek. The target box, visibility and the drum envelopes
 * ease in update().
 */

import type {Theme, VizMode, VizModeDef, VizServices} from '@cycletron/viz-sdk';
import {type FieldHap, type FieldTeam, HapField} from '@cycletron/viz-sdk';
import {alphaRamp, clamp01, drawLabel, follow, hash32, lerpRgb, mixRgb, rampAt, rand01, rgbOf, TAU} from '@cycletron/viz-sdk';
import {Alert} from '../../lib/console/alert.js';
import {
    alertColor, bakeConsoleInk, type ConsoleInk, type ConsoleLayout, drawConsole, layoutConsole, type Rect, type Station,
} from '../../lib/console/chrome.js';
import {brackets, pad} from '../../lib/console/panel.js';
import {Life, type LifePalette} from './life.js';
import {GROUND, Scene, type ScenePalette} from './scene.js';
import {css} from '@naderlabs/pixel-kit/color';

const LOOKAHEAD = 1;
const MAX_LANTERNS = 200;
const MAX_PER_TRACK = 32;
const DRUM_CAP = 12;
const IDLE_RATE = 0.25;
const RISE = 0.15;
const TAIL = 0.6;
const MAX_SPARKS = 10;
const SPARK_LIFE = 0.55;
const WHITE: [number, number, number] = [255, 255, 255];
/** Bars in one satellite pass. */
const PASS_BARS = 8;
/** How fast the target box slides, per second. */
const TRACK_RATE = 12;
const STATION: Station = {code: 'STN-04', name: 'SAT FEED'};

interface Team extends FieldTeam {}

interface Lantern extends FieldHap<Team> {
    col: number;
    row: number;
    pitched: boolean;
}

/** A shooting star from a snare: starts at x, y and runs along dx, dy. */
interface Spark {
    age: number;
    x: number;
    y: number;
    dx: number;
    dy: number;
}

/** Where a note's star is this frame, in body fractions. `r` sizes the target box; the core draws at half of it. */
interface Spot {
    x: number;
    y: number;
    r: number;
    alpha: number;
    lit: boolean;
}

interface Palette extends ScenePalette, LifePalette {
    spark: string;
    /** Reticle lines and the target box. */
    reticle: string;
    box: string;
    /** Behind the readout text. */
    plate: string;
}

class SnowfallMode implements VizMode {
    private readonly field = new HapField<Team, Lantern>({
        lookahead: LOOKAHEAD,
        maxHaps: MAX_LANTERNS,
        maxPerTrack: MAX_PER_TRACK,
        idleRate: IDLE_RATE,
        team: (base) => base,
        hap: (base) => makeLantern(base),
        cap: (_team, note) => (Number.isFinite(note) ? Infinity : DRUM_CAP),
        keep: (h, cycle) => h.end + TAIL + 0.05 >= cycle,
    });
    private readonly alert = new Alert();
    private readonly sparks: Spark[] = [];
    private readonly spot: Spot = {x: 0, y: 0, r: 0, alpha: 0, lit: false};
    private readonly scene = new Scene();
    private readonly life = new Life();
    private pal!: Palette;
    private cink!: ConsoleInk;
    private lay!: ConsoleLayout;
    private body: Rect = {x: 0, y: 0, w: 1, h: 1};
    private thump = 0;
    private gust = 0;
    private gustDir = 1;
    private flash = 0;
    /** Target box centre and half size, body fractions, eased. NaN until the first update. */
    private tx = NaN;
    private ty = 0;
    private tr = 0;
    /** Visibility in km, eased from the high band. */
    private vis = 2.1;
    private flagLit = true;

    layout(s: VizServices): void {
        this.lay = layoutConsole(s);
        this.body = this.lay.body;
        this.pal = bakePalette(s.theme);
        this.cink = bakeConsoleInk(s.theme);
        this.scene.bake(this.body);
        this.life.bake(this.body, this.scene.chimneyTops);
        this.field.invalidate();
    }

    update(dt: number, s: VizServices): void {
        this.alert.update(dt, s);
        const field = this.field;
        field.update(dt, s);
        if (field.restarted) {
            this.sparks.length = 0;
            this.thump = 0;
            this.gust = 0;
            this.flash = 0;
            this.tx = NaN;
            this.vis = 2.1;
        }
        for (const h of field.haps) {
            if (!field.crossed(h)) continue;
            h.done = true;
            h.team.activity = 1;
            if (h.pitched) continue;
            switch (h.team.family) {
                case 'kick':
                    this.thump = 1;
                    break;
                case 'snare':
                    if (this.sparks.length < MAX_SPARKS) {
                        const a = 0.25 + 0.3 * rand01(hash32(h.seed, 5));
                        const side = (hash32(h.seed, 6) & 1) === 0 ? 1 : -1;
                        this.sparks.push({
                            age: 0,
                            x: 0.15 + 0.7 * rand01(hash32(h.seed, 3)),
                            y: 0.06 + 0.3 * rand01(hash32(h.seed, 4)),
                            dx: side * Math.cos(a),
                            dy: Math.sin(a),
                        });
                    }
                    break;
                case 'hat':
                    if (this.gust < 0.3) this.gustDir = (h.seed & 1) === 0 ? 1 : -1;
                    this.gust = Math.min(1, this.gust + 0.5);
                    break;
                default:
                    this.flash = 1;
                    break;
            }
        }
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            this.sparks[i].age += dt;
            if (this.sparks[i].age >= SPARK_LIFE) this.sparks.splice(i, 1);
        }
        this.thump *= Math.exp(-dt * 8);
        this.gust *= Math.exp(-dt * 2.5);
        this.flash *= Math.exp(-dt * 6);

        this.track(dt);
        this.vis = follow(this.vis, 2.1 - 1.4 * clamp01(s.high), dt, 4, 1.5);
        const cycle = field.cycle;
        this.life.update(cycle);
        this.flagLit = this.alert.level > 1 || (hash32(Math.floor(cycle * 4), 7) & 1) === 0;
    }

    /** Slide the target box to the brightest lantern, or the village centre. */
    private track(dt: number): void {
        const cycle = this.field.cycle;
        const spot = this.spot;
        let best: Lantern | null = null;
        let bestAlpha = 0;
        for (const l of this.field.haps) {
            if (!l.pitched || !lanternAt(l, cycle, this.thump, spot)) continue;
            // Brightest wins; among equals the one that stays lit longest, so held notes hold the box.
            if (spot.alpha > bestAlpha || (spot.alpha === bestAlpha && best !== null && (l.end > best.end || (l.end === best.end && l.seed < best.seed)))) {
                best = l;
                bestAlpha = spot.alpha;
            }
        }
        let x = 0.5, y = GROUND - 0.07, r = 0.07;
        if (best !== null) {
            lanternAt(best, cycle, this.thump, spot);
            x = spot.x;
            y = spot.y;
            r = Math.max(0.035, spot.r * 3.5);
        }
        if (Number.isNaN(this.tx)) {
            this.tx = x;
            this.ty = y;
            this.tr = r;
            return;
        }
        this.tx = follow(this.tx, x, dt, TRACK_RATE, TRACK_RATE);
        this.ty = follow(this.ty, y, dt, TRACK_RATE, TRACK_RATE);
        this.tr = follow(this.tr, r, dt, TRACK_RATE, TRACK_RATE);
    }

    render(ctx: CanvasRenderingContext2D, s: VizServices): void {
        const pal = this.pal;
        const b = this.body;
        const scene = this.scene;
        const cycle = this.field.cycle;
        const shake = this.thump * b.h * 0.01;
        const crash = this.flash > 0.2;

        ctx.save();
        ctx.fillStyle = this.cink.bg;
        ctx.fillRect(0, 0, s.width, s.height);
        ctx.beginPath();
        ctx.rect(b.x, b.y, b.w, b.h);
        ctx.clip();

        scene.drawSky(ctx, pal, cycle);
        this.drawShootingStars(ctx);
        this.life.drawSleigh(ctx, pal, cycle, this.thump);
        scene.drawTown(ctx, pal, cycle, shake, crash, this.gust, this.gustDir);
        this.life.drawSanta(ctx, pal, cycle, shake);
        scene.drawGround(ctx, pal, cycle, shake, this.flash > 0.05);
        scene.drawNear(ctx, pal, shake);
        this.life.drawHerd(ctx, pal, cycle, this.thump, shake);
        this.drawStars(ctx, cycle);
        scene.drawSnow(ctx, pal, cycle, this.gust, this.gustDir);
        this.drawReticle(ctx, cycle);
        this.drawHotFrame(ctx);
        ctx.restore();

        this.drawReadout(ctx, s, cycle);
        this.drawFlag(ctx);
        drawConsole(ctx, s, this.lay, this.cink, this.alert, STATION);
    }

    /** One star per note: glow rings, a four-point sparkle (vertical arm longer), a bright core. */
    private drawStars(ctx: CanvasRenderingContext2D, cycle: number): void {
        const b = this.body;
        const spot = this.spot;
        const eighth = Math.floor(cycle * 8);
        for (const l of this.field.haps) {
            if (!l.pitched || !lanternAt(l, cycle, this.thump, spot)) continue;
            const alpha = spot.alpha;
            if (alpha <= 0.01) continue;
            const x = Math.round(b.x + spot.x * b.w);
            const y = Math.round(b.y + spot.y * b.h);
            const r = Math.max(3, spot.r * b.h);
            const core = Math.max(1.5, r * 0.5);
            // Held: full sparkle with a small twinkle. Rising or in the tail: it shrinks with the light.
            const twinkle = spot.lit ? 0.88 + 0.24 * rand01(hash32(eighth, l.seed)) : spot.alpha / Math.max(0.01, l.fade);
            const arm = r * 3.2 * twinkle, thin = Math.max(0.75, core * 0.3);
            const team = l.team;
            ctx.fillStyle = team.css;
            ctx.globalAlpha = alpha * 0.08;
            ctx.beginPath();
            ctx.arc(x, y, core * 3.4, 0, TAU);
            ctx.fill();
            ctx.globalAlpha = alpha * 0.16;
            ctx.beginPath();
            ctx.arc(x, y, core * 2.1, 0, TAU);
            ctx.fill();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = lerpRgb(team.rgb, WHITE, 0.45);
            ctx.beginPath();
            ctx.moveTo(x, y - arm);
            ctx.lineTo(x + thin, y);
            ctx.lineTo(x, y + arm);
            ctx.lineTo(x - thin, y);
            ctx.closePath();
            ctx.moveTo(x - arm * 0.6, y);
            ctx.lineTo(x, y - thin);
            ctx.lineTo(x + arm * 0.6, y);
            ctx.lineTo(x, y + thin);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = lerpRgb(team.rgb, WHITE, spot.lit ? 0.6 : 0.25);
            ctx.beginPath();
            ctx.arc(x, y, core, 0, TAU);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    /** A snare's shooting star: a streak from the seed point that grows with age and fades, brighter at the head. */
    private drawShootingStars(ctx: CanvasRenderingContext2D): void {
        const b = this.body;
        ctx.strokeStyle = this.pal.spark;
        ctx.fillStyle = this.pal.spark;
        ctx.lineCap = 'round';
        for (const sp of this.sparks) {
            const t = sp.age / SPARK_LIFE;
            const len = b.w * (0.05 + 0.2 * t);
            const sx = b.x + sp.x * b.w, sy = b.y + sp.y * b.h;
            const hx = sx + sp.dx * len, hy = sy + sp.dy * len;
            const mx = sx + sp.dx * len * 0.6, my = sy + sp.dy * len * 0.6;
            ctx.globalAlpha = (1 - t) * 0.35;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(mx, my);
            ctx.stroke();
            ctx.globalAlpha = 1 - t;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(mx, my);
            ctx.lineTo(hx, hy);
            ctx.stroke();
            ctx.fillRect(hx - 1.5, hy - 1.5, 3, 3);
        }
        ctx.lineCap = 'butt';
        ctx.globalAlpha = 1;
    }

    /** Centre cross with a gap, a dashed ring, and the target box. */
    private drawReticle(ctx: CanvasRenderingContext2D, cycle: number): void {
        const b = this.body;
        const level = this.alert.level;
        const hot = level === 1;
        const line = hot ? alertColor(this.cink, 1, 0.8) : this.pal.reticle;
        const box = hot ? alertColor(this.cink, 1) : this.pal.box;
        const cx = b.x + b.w * (0.5 + 0.03 * Math.sin(cycle * TAU / 13));
        const cy = b.y + b.h * (0.5 + 0.02 * Math.sin(cycle * TAU / 17 + 1));
        const arm = b.w * 0.14, gap = b.h * 0.13;
        ctx.strokeStyle = line;
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(cx - arm, cy); ctx.lineTo(cx - gap, cy);
        ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + arm, cy);
        ctx.moveTo(cx, cy - arm * 0.7); ctx.lineTo(cx, cy - gap);
        ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + arm * 0.7);
        ctx.stroke();
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        ctx.arc(cx, cy, b.h * 0.085, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);

        const tx = b.x + this.tx * b.w, ty = b.y + this.ty * b.h, tr = this.tr * b.h;
        brackets(ctx, tx - tr, ty - tr, tr * 2, tr * 2, tr * 0.45, box);
        drawLabel(ctx, 'TGT', tx + tr + this.lay.small * 0.5, ty - tr + this.lay.small * 0.5, box, this.lay.small, 'left');
    }

    /** The body's edge pulls to the alert colour once the room is hot. */
    private drawHotFrame(ctx: CanvasRenderingContext2D): void {
        const level = this.alert.level;
        if (level > 2) return;
        const b = this.body;
        const wide = b.h * 0.07, thin = b.h * 0.012;
        ctx.strokeStyle = alertColor(this.cink, level, 0.1);
        ctx.lineWidth = wide;
        ctx.strokeRect(b.x + wide / 2, b.y + wide / 2, b.w - wide, b.h - wide);
        ctx.strokeStyle = alertColor(this.cink, level, 0.15);
        ctx.lineWidth = thin;
        ctx.strokeRect(b.x + thin / 2, b.y + thin / 2, b.w - thin, b.h - thin);
    }

    private drawReadout(ctx: CanvasRenderingContext2D, s: VizServices, cycle: number): void {
        const ink = this.cink;
        const {body, margin, font} = this.lay;
        const bar = Math.floor(cycle);
        const lat = (89.9 + 0.1 * rand01(hash32(bar, 31))).toFixed(1);
        const lon = (0.9 * rand01(hash32(bar, 32))).toFixed(1).padStart(5, '0');
        const secondsPerBar = 240 / Math.max(1, s.bpm);
        const left = (PASS_BARS - (((cycle % PASS_BARS) + PASS_BARS) % PASS_BARS)) * secondsPerBar;
        const rows: Array<[string, string]> = [
            ['LAT', `${lat}N`],
            ['LON', lon],
            ['ALT', '412 KM'],
            ['WX', `SNOW · VIS ${this.vis.toFixed(1)} KM`],
            ['PASS', `${pad(Math.floor(bar / PASS_BARS) + 1, 2)} · T-${pad(left, 2)} S`],
        ];
        const step = font * 1.5;
        const x0 = body.x + margin * 0.6;
        const y0 = body.y + font * 1.1;
        ctx.fillStyle = this.pal.plate;
        ctx.fillRect(body.x + margin * 0.2, body.y + font * 0.3, font * 15, step * rows.length + font * 0.6);
        let y = y0;
        for (const [label, value] of rows) {
            drawLabel(ctx, label, x0, y, ink.labelDim, font, 'left');
            drawLabel(ctx, value, x0 + font * 3.2, y, ink.value, font, 'left');
            y += step;
        }
    }

    private drawFlag(ctx: CanvasRenderingContext2D): void {
        const ink = this.cink;
        const {body, margin, font} = this.lay;
        const level = this.alert.level;
        const text = level >= 4 ? 'NO THREAT' : level >= 2 ? 'TRACK ACTIVE' : 'INTERCEPT';
        const color = level >= 4 ? ink.labelDim : alertColor(ink, level, this.flagLit ? 1 : 0.3);
        const x1 = body.x + body.w - margin * 0.6;
        const y = body.y + font * 1.1;
        const w = font * (text.length * 0.62 + 1.6), h = font * 1.5;
        ctx.fillStyle = this.pal.plate;
        ctx.fillRect(x1 - w, y - h / 2, w, h);
        drawLabel(ctx, text, x1 - font * 0.8, y, color, font, 'right');
        if (level <= 3) brackets(ctx, x1 - w, y - h / 2, w, h, font * 0.5, color);
    }
}

/** Where note `l`'s star sits at `cycle`, in body fractions; false when it is not in view. The sky shakes with the kick. */
function lanternAt(l: Lantern, cycle: number, thump: number, out: Spot): boolean {
    const t = cycle - l.begin;
    const dur = l.end - l.begin;
    if (t < -RISE || t > dur + TAIL) return false;
    const drop = t < 0 ? clamp01(1 + t / RISE) : 1;
    const lit = t >= 0 && t <= dur;
    const on = lit ? 1 : t > dur ? clamp01(1 - (t - dur) / TAIL) : 0.35;
    out.x = (l.col + 0.5) / 12 + (rand01(hash32(l.seed, 1)) - 0.5) * 0.05;
    const sky = GROUND + thump * 0.01;
    out.y = sky * (0.12 + 0.58 * (1 - l.row)) - (1 - drop) * sky * 0.1;
    out.r = sky * (0.012 + 0.01 * Math.min(2, dur));
    out.alpha = on * l.fade;
    out.lit = lit;
    return true;
}

function makeLantern(base: FieldHap<Team>): Lantern {
    const pitched = Number.isFinite(base.note);
    return {
        ...base,
        pitched,
        col: pitched ? ((Math.round(base.note) % 12) + 12) % 12 : 0,
        row: pitched ? clamp01((base.note - 36) / 60) : 0,
    };
}

function bakePalette(theme: Theme): Palette {
    const bg = theme.bgRgb;
    const text = theme.textRgb;
    const pool = theme.accentPool;
    const violet = hexRgb(theme.violet);
    const active = rgbOf(theme.active, [255, 230, 90]);
    const red = rgbOf(theme.red, pool[0] ?? [230, 57, 70]);
    const green = rgbOf(theme.neonSecondary, pool[1] ?? [61, 220, 132]);
    const cyan = pool[2] ?? mixRgb(green, text, 0.5);
    const orange = mixRgb(red, active, 0.5);
    const flake = mixRgb(text, WHITE, 0.7);
    const flakeRamp = alphaRamp(flake);
    const activeRamp = alphaRamp(active);
    const textRamp = alphaRamp(text);
    const greenRamp = alphaRamp(mixRgb(green, cyan, 0.4));
    const violetRamp = alphaRamp(mixRgb(violet, cyan, 0.25));
    const house = mixRgb(mixRgb(bg, violet, 0.08), [0, 0, 0], 0.35);
    const houseBack = mixRgb(mixRgb(bg, violet, 0.14), [0, 0, 0], 0.22);
    const snow = mixRgb(mixRgb(bg, WHITE, 0.22), violet, 0.12);
    const near = mixRgb(bg, [0, 0, 0], 0.45);
    const santaRed = mixRgb(red, WHITE, 0.15);
    return {
        sky: theme.bg,
        skyMid: css(mixRgb(bg, violet, 0.18)),
        skyTop: css(mixRgb(bg, violet, 0.38)),
        auroraGreen: rampAt(greenRamp, 0.06),
        auroraViolet: rampAt(violetRamp, 0.05),
        starBright: rampAt(flakeRamp, 0.65),
        starDim: rampAt(flakeRamp, 0.34),
        starFaint: rampAt(flakeRamp, 0.15),
        milky: rampAt(flakeRamp, 0.3),
        moon: css(flake),
        moonHalo: rampAt(flakeRamp, 0.03),
        mountainFar: css(mixRgb(mixRgb(bg, violet, 0.22), text, 0.06)),
        mountainNear: css(mixRgb(mixRgb(bg, violet, 0.15), [0, 0, 0], 0.12)),
        mountainSnow: rampAt(flakeRamp, 0.22),
        forest: css(mixRgb(mixRgb(bg, green, 0.16), [0, 0, 0], 0.28)),
        skyline: css(mixRgb(mixRgb(bg, violet, 0.12), text, 0.04)),
        houseBack: css(houseBack),
        house: css(house),
        houseTrim: css(mixRgb(house, orange, 0.22)),
        roof: css(mixRgb(house, violet, 0.16)),
        chimney: css(mixRgb(house, red, 0.24)),
        windowDark: css(mixRgb(house, violet, 0.2)),
        window: theme.active,
        windowWarm: css(mixRgb(active, orange, 0.35)),
        windowGlow: rampAt(activeRamp, 0.14),
        smoke: rampAt(flakeRamp, 0.11),
        cap: css(mixRgb(flake, violet, 0.15)),
        tree: css(mixRgb(green, [0, 0, 0], 0.45)),
        treeDark: css(mixRgb(mixRgb(bg, green, 0.28), [0, 0, 0], 0.38)),
        ornamentRed: css(mixRgb(red, WHITE, 0.15)),
        ornamentCyan: css(mixRgb(cyan, WHITE, 0.2)),
        ornamentGold: css(mixRgb(active, WHITE, 0.2)),
        near: css(near),
        deer: css(mixRgb(near, snow, 0.25)),
        nose: css(mixRgb(red, WHITE, 0.2)),
        noseDim: css(mixRgb(red, near, 0.55)),
        santaRed: css(santaRed),
        santaWhite: css(mixRgb(flake, WHITE, 0.5)),
        santaSkin: css(mixRgb(mixRgb(flake, WHITE, 0.5), santaRed, 0.3)),
        runner: css(mixRgb(active, WHITE, 0.2)),
        team: css(mixRgb(mixRgb(bg, text, 0.38), violet, 0.15)),
        trail: rampAt(flakeRamp, 0.8),
        trailDim: rampAt(flakeRamp, 0.35),
        pool: rampAt(activeRamp, 0.22),
        poolFaint: rampAt(activeRamp, 0.08),
        ground: css(snow),
        groundLit: css(mixRgb(snow, WHITE, 0.18)),
        drift: css(mixRgb(snow, WHITE, 0.09)),
        sparkle: rampAt(flakeRamp, 0.72),
        flake: css(flake),
        flakeDim: css(mixRgb(bg, text, 0.5)),
        flakeFaint: rampAt(flakeRamp, 0.3),
        spark: theme.active,
        reticle: rampAt(textRamp, 0.55),
        box: rampAt(textRamp, 0.9),
        plate: rampAt(alphaRamp(bg), 0.6),
    };
}

function hexRgb(hex: string): [number, number, number] {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const snowfallDef: VizModeDef = {
    id: 'snowfall',
    name: 'SAT FEED',
    create: () => new SnowfallMode(),
};
