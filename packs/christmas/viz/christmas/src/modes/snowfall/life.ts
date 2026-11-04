/**
 * Life in the SAT FEED village: reindeer walking the snowfield, Santa popping
 * out of a chimney now and then, and the sleigh crossing the sky.
 * The herd is baked from hashes of the reindeer index. The chimney pop and the
 * fly-by are pure functions of the bar, set in update() from the cycle alone,
 * so a seek lands on the same frame. Flat silhouettes, batched by colour.
 */

import {hash32, rand01, TAU} from '@cycletron/viz-sdk';
import type {Rect} from '../../lib/console/chrome.js';
import {type Chimney, GROUND} from './scene.js';

const DEER = 4;
/** Reindeer that graze, head down. */
const GRAZING = [false, true, false, true];
/** One in POP_EVERY bars has a chimney pop; never two bars running. */
const POP_EVERY = 6;
const POP_SALT = 401;
const POP_CHIMNEY_SALT = 402;
/** One in FLY_EVERY bars starts a fly-by; it lasts FLY_BARS. */
const FLY_EVERY = 10;
const FLY_BARS = 2;
const FLY_SALT = 403;
const FLY_DIR_SALT = 404;
const TEAM = 4;
const TRAIL = 16;

export interface LifePalette {
    deer: string;
    nose: string;
    noseDim: string;
    santaRed: string;
    santaWhite: string;
    santaSkin: string;
    runner: string;
    team: string;
    trail: string;
    trailDim: string;
}

interface Deer {
    /** Start along the field, 0..1. */
    x0: number;
    /** Feet, below the ground line, px. */
    feet: number;
    /** Size unit, px. */
    u: number;
    dir: number;
    /** Px a bar. */
    speed: number;
    grazing: boolean;
}

/** A pose's head, for the nose and the antlers. */
interface Head {
    x: number;
    y: number;
    rx: number;
    rot: number;
}

export class Life {
    private b: Rect = {x: 0, y: 0, w: 1, h: 1};
    private gy = 0;
    private herd: Deer[] = [];
    private chimneys: readonly Chimney[] = [];
    private readonly head: Head = {x: 0, y: 0, rx: 0, rot: 0};
    /** The chimney Santa is in this bar (-1 for none) and how far he is up, 0..1. */
    private popChimney = -1;
    private popRise = 0;
    /** The fly-by in flight: bar it started (NaN for none), progress 0..1, direction. */
    private flyStart = NaN;
    private flyT = 0;
    private flyDir = 1;

    bake(b: Rect, chimneys: readonly Chimney[]): void {
        this.b = b;
        this.gy = Math.round(b.y + b.h * GROUND);
        this.chimneys = chimneys;
        const herd: Deer[] = [];
        for (let i = 0; i < DEER; i++) {
            // Deeper in the field is nearer, so a little bigger.
            const depth = rand01(hash32(i, 302));
            herd.push({
                x0: (i + 0.15 + 0.7 * rand01(hash32(i, 301))) / DEER,
                feet: Math.round(b.h * (0.115 + 0.06 * depth)),
                u: b.h * (0.022 + 0.006 * depth),
                dir: (hash32(i, 303) & 1) === 0 ? 1 : -1,
                speed: b.w * (0.003 + 0.003 * rand01(hash32(i, 304))) * (GRAZING[i] ? 0.5 : 1),
                grazing: GRAZING[i],
            });
        }
        this.herd = herd;
    }

    /** Which chimney pop and which fly-by are on, from the cycle alone. */
    update(cycle: number): void {
        const bar = Math.floor(cycle);
        const f = cycle - bar;
        this.popChimney = -1;
        if (this.chimneys.length > 0 && popsAt(bar)) {
            this.popChimney = hash32(bar, POP_CHIMNEY_SALT) % this.chimneys.length;
            // Up in the first quarter of the bar, hold, down in the last quarter.
            const up = f < 0.25 ? f / 0.25 : f > 0.75 ? (1 - f) / 0.25 : 1;
            this.popRise = up * up * (3 - 2 * up);
        }
        this.flyStart = NaN;
        for (let k = 0; k < FLY_BARS; k++) {
            if (fliesAt(bar - k)) {
                this.flyStart = bar - k;
                this.flyT = (cycle - this.flyStart) / FLY_BARS;
                this.flyDir = (hash32(this.flyStart, FLY_DIR_SALT) & 1) === 0 ? 1 : -1;
                break;
            }
        }
    }

    /** The herd on the snowfield. `dy` is the kick shake; heads bob with `thump`. */
    drawHerd(ctx: CanvasRenderingContext2D, pal: LifePalette, cycle: number, thump: number, dy: number): void {
        const b = this.b;
        const g = this.gy + Math.round(dy);
        // Legs swap on each half beat.
        const step = (Math.floor(cycle * 8) & 1) === 0 ? 1 : -1;
        const xs: number[] = [];
        for (const d of this.herd) {
            const m = d.u * 3;
            const span = b.w + 2 * m;
            const run = (((d.x0 * span + d.dir * cycle * d.speed) % span) + span) % span;
            xs.push(Math.round(b.x - m + run));
        }

        ctx.fillStyle = pal.deer;
        ctx.beginPath();
        this.herd.forEach((d, i) => this.deerFill(ctx, xs[i], g + d.feet, d, thump));
        ctx.fill();
        ctx.strokeStyle = pal.deer;
        ctx.lineCap = 'round';
        for (const pass of [0, 1, 2]) {
            ctx.beginPath();
            this.herd.forEach((d, i) => {
                if (pass === 0) ctx.lineWidth = Math.max(2, d.u * 0.3);
                if (pass === 1) ctx.lineWidth = Math.max(1.5, d.u * 0.16);
                if (pass === 2) ctx.lineWidth = Math.max(1, d.u * 0.08);
                this.deerStroke(ctx, xs[i], g + d.feet, d, thump, step, pass);
            });
            ctx.stroke();
        }
        ctx.lineCap = 'butt';

        // The first one wears a red nose, lit on the beat.
        const d = this.herd[0];
        this.headOf(xs[0], g + d.feet, d, thump);
        const h = this.head;
        const nx = h.x + d.dir * Math.cos(h.rot) * h.rx, ny = h.y + Math.sin(h.rot) * h.rx;
        const lit = cycle * 4 - Math.floor(cycle * 4) < 0.4;
        ctx.fillStyle = lit ? pal.nose : pal.noseDim;
        ctx.beginPath();
        ctx.arc(nx, ny, Math.max(1.5, d.u * (lit ? 0.14 : 0.1)), 0, TAU);
        ctx.fill();
    }

    /** Where a standing or grazing head sits, into `this.head`. */
    private headOf(x: number, y: number, d: Deer, thump: number): void {
        const u = d.u, h = this.head;
        const bob = thump * u * 0.15;
        h.x = x + d.dir * (d.grazing ? 1.35 : 1.2) * u;
        h.y = y + (d.grazing ? -0.45 : -2.45) * u + bob;
        h.rx = 0.32 * u;
        h.rot = d.grazing ? 1.25 : 0.35;
    }

    /** Body, tail and head as ellipses, all wound the same way. */
    private deerFill(ctx: CanvasRenderingContext2D, x: number, y: number, d: Deer, thump: number): void {
        const u = d.u;
        ellipse(ctx, x, y - 1.45 * u, 0.95 * u, 0.4 * u, 0);
        ellipse(ctx, x - d.dir * 0.95 * u, y - 1.62 * u, 0.15 * u, 0.1 * u, 0);
        this.headOf(x, y, d, thump);
        const h = this.head;
        ellipse(ctx, h.x, h.y, h.rx, 0.16 * u, d.dir > 0 ? h.rot : Math.PI - h.rot);
    }

    /** Pass 0 the neck, 1 the legs, 2 the antlers. */
    private deerStroke(ctx: CanvasRenderingContext2D, x: number, y: number, d: Deer, thump: number, step: number, pass: number): void {
        const u = d.u, dir = d.dir;
        this.headOf(x, y, d, thump);
        const h = this.head;
        if (pass === 0) {
            ctx.moveTo(x + dir * 0.7 * u, y - 1.6 * u);
            ctx.lineTo(h.x - dir * 0.12 * u, h.y + (d.grazing ? -0.2 : 0.05) * u);
            return;
        }
        if (pass === 1) {
            // Diagonal pairs swing together.
            const s = 0.16 * u * step;
            const legs = [[-0.62, s], [-0.42, -s], [0.48, -s], [0.68, s]];
            for (const [lx, swing] of legs) {
                ctx.moveTo(x + dir * lx * u, y - 1.25 * u);
                ctx.lineTo(x + dir * (lx * u + swing), y);
            }
            return;
        }
        const bx = h.x - dir * 0.12 * u, by = h.y - 0.12 * u;
        for (const [ox, lean] of [[0, -1], [0.12, 1]]) {
            const x0 = bx + dir * ox * u;
            const mx = x0 + dir * lean * 0.18 * u, my = by - 0.5 * u;
            ctx.moveTo(x0, by);
            ctx.lineTo(mx, my);
            ctx.lineTo(mx + dir * 0.12 * u, by - 0.92 * u);
            ctx.moveTo(mx, my);
            ctx.lineTo(mx + dir * 0.3 * u, my - 0.18 * u);
        }
    }

    /** Santa in the chimney this bar, waving; drawn over the town and clipped at the chimney's snow cap. */
    drawSanta(ctx: CanvasRenderingContext2D, pal: LifePalette, cycle: number, dy: number): void {
        if (this.popChimney < 0 || this.popRise <= 0) return;
        const b = this.b;
        const ch = this.chimneys[this.popChimney];
        const g = this.gy + Math.round(dy);
        const cap = Math.max(2, Math.round(b.h * 0.006));
        const top = g + ch.y - Math.ceil(cap / 2);
        const k = Math.max(ch.w * 1.1, b.h * 0.018);
        const x = ch.x;
        const y = top + (1 - this.popRise) * 2.1 * k;

        ctx.save();
        ctx.beginPath();
        ctx.rect(b.x, b.y, b.w, top - b.y);
        ctx.clip();
        // Coat, hat, and the waving arm.
        const wave = -1.25 + 0.45 * Math.sin(cycle * TAU * 8);
        const sx = x + 0.38 * k, sy = y - 0.6 * k;
        const hx = sx + Math.cos(wave) * 0.6 * k, hy = sy + Math.sin(wave) * 0.6 * k;
        ctx.fillStyle = pal.santaRed;
        ctx.beginPath();
        ctx.rect(x - 0.45 * k, y - 0.75 * k, 0.9 * k, 1.2 * k);
        ctx.moveTo(x - 0.32 * k, y - 1.3 * k);
        ctx.lineTo(x + 0.5 * k, y - 1.78 * k);
        ctx.lineTo(x + 0.32 * k, y - 1.3 * k);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = pal.santaRed;
        ctx.lineWidth = Math.max(2, 0.22 * k);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        ctx.lineCap = 'butt';
        // Face, then beard, brim, pom-pom and mitten.
        ctx.fillStyle = pal.santaSkin;
        ctx.fillRect(x - 0.22 * k, y - 1.2 * k, 0.44 * k, 0.26 * k);
        ctx.fillStyle = pal.santaWhite;
        ctx.beginPath();
        ellipse(ctx, x, y - 0.82 * k, 0.36 * k, 0.3 * k, 0);
        ctx.rect(x - 0.38 * k, y - 1.34 * k, 0.76 * k, 0.16 * k);
        ellipse(ctx, x + 0.5 * k, y - 1.78 * k, 0.13 * k, 0.13 * k, 0);
        ellipse(ctx, hx, hy, 0.13 * k, 0.13 * k, 0);
        ctx.fill();
        ctx.restore();
    }

    /** The sleigh and its team crossing the sky on a shallow arc, a sparkle trail behind. */
    drawSleigh(ctx: CanvasRenderingContext2D, pal: LifePalette, cycle: number, thump: number): void {
        if (Number.isNaN(this.flyStart)) return;
        const b = this.b;
        const v = Math.max(4, b.h * 0.013);
        const dir = this.flyDir;
        const t = this.flyT;
        const lift = thump * b.h * 0.012;
        // The whole rig is about 12v long; it starts and ends off the body.
        const margin = 14 * v;
        const pathX = (tt: number) => (dir > 0 ? b.x - margin + tt * (b.w + 2 * margin) : b.x + b.w + margin - tt * (b.w + 2 * margin));
        // Below the moon and the flag row, above the mountains.
        const pathY = (tt: number) => b.y + b.h * (0.36 - 0.08 * Math.sin(Math.PI * tt));
        const x = Math.round(pathX(t));
        const y = Math.round(pathY(t) - lift + Math.sin(cycle * TAU * 2) * 0.15 * v);

        // Trail: the path behind the sleigh, with a little jitter, fading.
        const eighth = Math.floor(cycle * 8);
        for (const bright of [true, false]) {
            ctx.fillStyle = bright ? pal.trail : pal.trailDim;
            ctx.beginPath();
            for (let j = bright ? 1 : 7; j <= (bright ? 6 : TRAIL); j++) {
                const tt = t - j * 0.006;
                const jx = (rand01(hash32(eighth * 31 + j, 405)) - 0.5) * v;
                const jy = (rand01(hash32(eighth * 31 + j, 406)) - 0.5) * v;
                const px = Math.round(pathX(tt) - dir * 1.6 * v + jx);
                const py = Math.round(pathY(tt) - lift + jy);
                const s = j < 4 ? 2 : 1;
                ctx.rect(px, py, s, s);
            }
            ctx.fill();
        }

        // The team: four reindeer ahead of the sleigh, rocking on the beat.
        const deerY: number[] = [];
        for (let k = 0; k < TEAM; k++) deerY.push(y - 0.9 * v + Math.sin(cycle * TAU * 4 + k * 0.9) * 0.25 * v);
        const deerX = (k: number) => x + dir * (2.6 + k * 2.3) * v;
        const u = 0.75 * v;
        ctx.strokeStyle = pal.trailDim;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + dir * 1.3 * v, y - 0.5 * v);
        for (let k = 0; k < TEAM; k++) ctx.lineTo(deerX(k) + dir * 0.4 * u, deerY[k] + 0.1 * u);
        ctx.stroke();

        ctx.fillStyle = pal.team;
        ctx.beginPath();
        for (let k = 0; k < TEAM; k++) {
            const dx = deerX(k), dy = deerY[k];
            ellipse(ctx, dx, dy, 0.9 * u, 0.35 * u, 0);
            ellipse(ctx, dx + dir * 1.2 * u, dy - 0.8 * u, 0.3 * u, 0.15 * u, dir > 0 ? 0.2 : Math.PI - 0.2);
        }
        ctx.fill();
        ctx.strokeStyle = pal.team;
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(1.5, 0.28 * u);
        ctx.beginPath();
        for (let k = 0; k < TEAM; k++) {
            const dx = deerX(k), dy = deerY[k];
            ctx.moveTo(dx + dir * 0.7 * u, dy - 0.15 * u);
            ctx.lineTo(dx + dir * 1.05 * u, dy - 0.75 * u);
        }
        ctx.stroke();
        ctx.lineWidth = Math.max(1, 0.12 * u);
        ctx.beginPath();
        for (let k = 0; k < TEAM; k++) {
            const dx = deerX(k), dy = deerY[k];
            // Legs stretched fore and aft, at a gallop.
            ctx.moveTo(dx + dir * 0.5 * u, dy + 0.2 * u); ctx.lineTo(dx + dir * 1.1 * u, dy + 0.45 * u);
            ctx.moveTo(dx + dir * 0.35 * u, dy + 0.25 * u); ctx.lineTo(dx + dir * 0.95 * u, dy + 0.6 * u);
            ctx.moveTo(dx - dir * 0.5 * u, dy + 0.2 * u); ctx.lineTo(dx - dir * 1.1 * u, dy + 0.45 * u);
            ctx.moveTo(dx - dir * 0.35 * u, dy + 0.25 * u); ctx.lineTo(dx - dir * 0.95 * u, dy + 0.6 * u);
            // Antlers.
            const ax = dx + dir * 1.05 * u, ay = dy - 0.92 * u;
            ctx.moveTo(ax, ay); ctx.lineTo(ax - dir * 0.15 * u, ay - 0.55 * u);
            ctx.moveTo(ax - dir * 0.08 * u, ay - 0.3 * u); ctx.lineTo(ax + dir * 0.2 * u, ay - 0.5 * u);
        }
        ctx.stroke();
        // The lead's red nose.
        ctx.fillStyle = pal.nose;
        ctx.beginPath();
        const lx = deerX(TEAM - 1) + dir * 1.5 * u, ly = deerY[TEAM - 1] - 0.73 * u;
        ellipse(ctx, lx, ly, Math.max(1.5, 0.14 * u), Math.max(1.5, 0.14 * u), 0);
        ctx.fill();

        // Sack, Santa, sleigh, runner.
        ctx.fillStyle = pal.team;
        ctx.beginPath();
        ellipse(ctx, x - dir * 1.0 * v, y - 1.45 * v, 0.5 * v, 0.45 * v, 0);
        ctx.fill();
        ctx.fillStyle = pal.santaRed;
        ctx.beginPath();
        ellipse(ctx, x - dir * 0.2 * v, y - 1.05 * v, 0.5 * v, 0.55 * v, 0);
        ctx.moveTo(x - dir * 0.05 * v, y - 1.75 * v);
        ctx.lineTo(x - dir * 0.45 * v, y - 2.35 * v);
        ctx.lineTo(x + dir * 0.35 * v, y - 1.75 * v);
        ctx.closePath();
        const tub = [[-1.5, -1.3], [-1.2, 0], [1.1, 0], [1.5, -0.6], [1.1, -0.5], [-0.8, -0.5], [-1.0, -1.3]];
        ctx.moveTo(x + dir * tub[0][0] * v, y + tub[0][1] * v);
        for (const [px, py] of tub) ctx.lineTo(x + dir * px * v, y + py * v);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = pal.santaWhite;
        ctx.beginPath();
        ellipse(ctx, x + dir * 0.1 * v, y - 1.45 * v, 0.3 * v, 0.28 * v, 0);
        ellipse(ctx, x - dir * 0.45 * v, y - 2.35 * v, 0.14 * v, 0.14 * v, 0);
        ctx.fill();
        ctx.strokeStyle = pal.runner;
        ctx.lineWidth = Math.max(1, 0.14 * v);
        ctx.beginPath();
        ctx.moveTo(x - dir * 1.6 * v, y + 0.4 * v);
        ctx.lineTo(x + dir * 1.3 * v, y + 0.4 * v);
        ctx.lineTo(x + dir * 1.75 * v, y);
        ctx.lineTo(x + dir * 1.6 * v, y - 0.3 * v);
        ctx.moveTo(x - dir * 0.8 * v, y); ctx.lineTo(x - dir * 0.8 * v, y + 0.4 * v);
        ctx.moveTo(x + dir * 0.6 * v, y); ctx.lineTo(x + dir * 0.6 * v, y + 0.4 * v);
        ctx.stroke();
        ctx.lineCap = 'butt';
    }
}

function popsAt(bar: number): boolean {
    return hash32(bar, POP_SALT) % POP_EVERY === 0 && hash32(bar - 1, POP_SALT) % POP_EVERY !== 0;
}

/** A fly-by starts here; never one that would overlap the last. */
function fliesAt(bar: number): boolean {
    if (hash32(bar, FLY_SALT) % FLY_EVERY !== 0) return false;
    for (let k = 1; k < FLY_BARS; k++) if (hash32(bar - k, FLY_SALT) % FLY_EVERY === 0) return false;
    return true;
}

/** An ellipse as its own subpath, starting where the arc starts so no stray edge joins it. */
function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot: number): void {
    ctx.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot));
    ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
}
