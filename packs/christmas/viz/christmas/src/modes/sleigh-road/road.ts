/**
 * SLEIGH ROAD's course and sky, forked from the app's STAR ROAD: a ribbon road
 * whose centerline bends and rolls over hills as a fixed function of
 * distance, seen by a chase camera that follows the road's heading. The
 * ribbon is dark glass banded in Christmas colours, with snowy verges,
 * candy-cane rails, gold star markers, pine trees along both verges, a
 * starfield and Christmas signs in the void.
 *
 * Distance `s` runs along the road. The camera is a sheared pinhole: points
 * are offset by the road's slope at the camera, which turns the bends into
 * sweeping curves without a full rotation per point.
 */

import type {Theme} from '@cycletron/viz-sdk';
import {TAU, hash32, lerpRgb, rand01} from '@cycletron/viz-sdk';

export type Rgb = [number, number, number];

export const HALF_WIDTH = 6.4;
/** Snowy shoulder outside each rail, where the trees stand. */
export const VERGE = 3.2;
/** The road's depth below its surface, seen at the edges. */
const THICKNESS = 0.45;
const NEAR = 0.6;

/** Band order, nearest first: red, gold, green, ice, white, berry, pine. */
const BANDS: readonly Rgb[] = [
    [222, 72, 72], [239, 189, 115], [82, 198, 120], [120, 196, 232], [226, 232, 238], [196, 70, 112], [96, 178, 132],
];
const BAND_LEN = 7.5;
/** Most of each band blends into the next for a continuous surface. */
const BLEND = 0.75;
const BLEND_STEPS = 16;
const BAND_COLORS: Rgb[][] = BANDS.map((a, i) => {
    const b = BANDS[(i + 1) % BANDS.length];
    const out: Rgb[] = [];
    for (let k = 0; k <= BLEND_STEPS; k++) {
        const t = k / BLEND_STEPS;
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
    return out;
});

const RAIL_STEP = 6;
export const GOLD = '#efbd73';
const RAIL_CORE = '#3a1414';
const UNDERSIDE = '#0b1320';
const CANE_RED = '#e0383e';
const CANE_WHITE = '#f4f1ea';
/** Candy-cane stripe length along the rail, meters. */
const STRIPE = 0.9;

// --- course ---------------------------------------------------------------

const BENDS: ReadonlyArray<readonly [number, number, number]> = [[34, 0.0061, 0.3], [17, 0.0137, 1.1], [4, 0.031, 2.2]];
const HILLS: ReadonlyArray<readonly [number, number, number]> = [[6, 0.009, 0], [2.5, 0.023, 2]];

function wave(table: typeof BENDS, s: number, order: 0 | 1 | 2): number {
    let v = 0;
    for (const [a, b, c] of table) {
        const ph = b * s + c;
        v += order === 0 ? a * Math.sin(ph) : order === 1 ? a * b * Math.cos(ph) : -a * b * b * Math.sin(ph);
    }
    return v;
}

export function roadX(s: number): number {
    return wave(BENDS, s, 0);
}

export function roadY(s: number): number {
    return wave(HILLS, s, 0);
}

/** Heading of the road at `s`, radians from straight ahead. */
export function roadHeading(s: number): number {
    return Math.atan(wave(BENDS, s, 1));
}

/** Signed bend at `s`: positive bends right. */
export function roadCurve(s: number): number {
    return wave(BENDS, s, 2);
}

// --- camera ---------------------------------------------------------------

export class RoadCamera {
    s = 0;
    x = 0;
    y = 0;
    slopeX = 0;
    slopeY = 0;
    f = 800;
    cx = 0;
    cy = 0;
    /** Results of the last `project`. */
    sx = 0;
    sy = 0;
    d = 1;

    /**
     * Sit `height` above the road at `s`, offset `lane` across it, looking at
     * a point `look` ahead and `lookHeight` above the road.
     */
    set(s: number, lane: number, height: number, look: number, lookHeight: number, f: number, cx: number, cy: number): void {
        this.s = s;
        this.x = roadX(s) + lane;
        this.y = roadY(s) + height;
        this.slopeX = (roadX(s + look) + lane - this.x) / look;
        this.slopeY = (roadY(s + look) + lookHeight - this.y) / look;
        this.f = f;
        this.cx = cx;
        this.cy = cy;
    }

    project(x: number, y: number, s: number): boolean {
        const d = s - this.s;
        if (d < NEAR) return false;
        this.d = d;
        this.sx = this.cx + (x - this.x - this.slopeX * d) * this.f / d;
        this.sy = this.cy - (y - this.y - this.slopeY * d) * this.f / d;
        return true;
    }
}

// --- road -----------------------------------------------------------------

function bandCss(s: number, bg: Rgb, light: number): string {
    const u = s / BAND_LEN;
    const i = ((Math.floor(u) % BANDS.length) + BANDS.length) % BANDS.length;
    const f = u - Math.floor(u);
    const t = f < 1 - BLEND ? 0 : (f - (1 - BLEND)) / BLEND;
    return lerpRgb(bg, BAND_COLORS[i][Math.round(t * BLEND_STEPS)], light);
}

const qx = new Float32Array(8);
const qy = new Float32Array(8);

/**
 * Road ribbon, far to near: underside edges, snowy verges, the band, and a
 * soft specular streak down the middle. `glow` (0..1) brightens the streak.
 */
export function drawRoad(ctx: CanvasRenderingContext2D, cam: RoadCamera, far: number, glow: number, theme: Theme): void {
    // Segment length grows with distance; band edges stay crisp up close.
    const starts: number[] = [];
    let d = NEAR;
    while (d < far) {
        starts.push(d);
        d += Math.max(0.75, d * 0.022);
    }
    starts.push(far);
    const specular = 0.012 + 0.025 * glow;
    const snow: Rgb = [214, 224, 232];
    const outer = HALF_WIDTH + VERGE;
    for (let i = starts.length - 2; i >= 0; i--) {
        const s0 = cam.s + starts[i];
        const s1 = cam.s + starts[i + 1];
        const x0 = roadX(s0), x1 = roadX(s1), y0 = roadY(s0), y1 = roadY(s1);
        // Near edge left, right; far edge right, left. 0..3 the road, 4..7 the verge's outer edges.
        if (!cam.project(x0 - HALF_WIDTH, y0, s0)) continue;
        qx[0] = cam.sx; qy[0] = cam.sy;
        cam.project(x0 + HALF_WIDTH, y0, s0);
        qx[1] = cam.sx; qy[1] = cam.sy;
        cam.project(x1 + HALF_WIDTH, y1, s1);
        qx[2] = cam.sx; qy[2] = cam.sy;
        cam.project(x1 - HALF_WIDTH, y1, s1);
        qx[3] = cam.sx; qy[3] = cam.sy;
        cam.project(x0 - outer, y0, s0);
        qx[4] = cam.sx; qy[4] = cam.sy;
        cam.project(x0 + outer, y0, s0);
        qx[5] = cam.sx; qy[5] = cam.sy;
        cam.project(x1 + outer, y1, s1);
        qx[6] = cam.sx; qy[6] = cam.sy;
        cam.project(x1 - outer, y1, s1);
        qx[7] = cam.sx; qy[7] = cam.sy;

        // The ribbon's thickness, visible below the verge's outer edges.
        const t0 = THICKNESS * cam.f / starts[i];
        const t1 = THICKNESS * cam.f / starts[i + 1];
        ctx.fillStyle = UNDERSIDE;
        ctx.beginPath();
        ctx.moveTo(qx[4], qy[4]); ctx.lineTo(qx[7], qy[7]); ctx.lineTo(qx[7], qy[7] + t1); ctx.lineTo(qx[4], qy[4] + t0);
        ctx.moveTo(qx[5], qy[5]); ctx.lineTo(qx[6], qy[6]); ctx.lineTo(qx[6], qy[6] + t1); ctx.lineTo(qx[5], qy[5] + t0);
        ctx.fill();

        const fog = Math.min(1, starts[i] / far);
        ctx.fillStyle = lerpRgb(theme.bgRgb, snow, 0.34 - 0.24 * fog);
        ctx.beginPath();
        ctx.moveTo(qx[4], qy[4]); ctx.lineTo(qx[0], qy[0]); ctx.lineTo(qx[3], qy[3]); ctx.lineTo(qx[7], qy[7]);
        ctx.moveTo(qx[1], qy[1]); ctx.lineTo(qx[5], qy[5]); ctx.lineTo(qx[6], qy[6]); ctx.lineTo(qx[2], qy[2]);
        ctx.fill();
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.6; ctx.stroke();

        ctx.fillStyle = bandCss((s0 + s1) / 2, theme.bgRgb, 0.21 - 0.14 * fog);
        ctx.beginPath();
        ctx.moveTo(qx[0], qy[0]); ctx.lineTo(qx[1], qy[1]); ctx.lineTo(qx[2], qy[2]); ctx.lineTo(qx[3], qy[3]);
        ctx.closePath();
        ctx.fill();
        // Opaque colour mixing avoids bright antialiasing seams between segments.
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.6; ctx.stroke();

        const a = 0.22, b = 0.78;
        ctx.globalAlpha = specular;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(qx[0] + (qx[1] - qx[0]) * a, qy[0] + (qy[1] - qy[0]) * a);
        ctx.lineTo(qx[0] + (qx[1] - qx[0]) * b, qy[0] + (qy[1] - qy[0]) * b);
        ctx.lineTo(qx[3] + (qx[2] - qx[3]) * b, qy[3] + (qy[2] - qy[3]) * b);
        ctx.lineTo(qx[3] + (qx[2] - qx[3]) * a, qy[3] + (qy[2] - qy[3]) * a);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

/** Unit five-point star, ten vertices, point up. */
const STAR: readonly [number, number][] = Array.from({length: 10}, (_, i): [number, number] => {
    const r = i % 2 === 0 ? 1 : 0.42;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    return [Math.cos(a) * r, Math.sin(a) * r];
});

export function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin = 0): void {
    const c = Math.cos(spin), s = Math.sin(spin);
    for (let i = 0; i < STAR.length; i++) {
        const [u, v] = STAR[i];
        const px = x + (u * c - v * s) * r, py = y + (u * s + v * c) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
}

/**
 * Candy-cane rails, red and white stripes fixed to the road, and a gold star
 * every 6 m, far to near. `pulse` (0..1) is a kick: the rails glow.
 */
export function drawRails(ctx: CanvasRenderingContext2D, cam: RoadCamera, far: number, pulse: number): void {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'butt';
    const step = STRIPE / 2;
    const first = Math.ceil((cam.s + 1) / step);
    const last = Math.floor((cam.s + far) / step);
    for (const side of [-1, 1]) {
        // Stripes alternate by their index along the road, so they ride with it.
        for (const red of [true, false]) {
            ctx.beginPath();
            for (let n = last; n >= first; n--) {
                if (((n & 1) === 0) !== red) continue;
                const sa = n * step, sb = sa + step;
                if (!cam.project(roadX(sb) + side * (HALF_WIDTH + 0.05), roadY(sb) + 0.12, sb)) continue;
                const bx = cam.sx, by = cam.sy;
                if (!cam.project(roadX(sa) + side * (HALF_WIDTH + 0.05), roadY(sa) + 0.12, sa)) continue;
                ctx.moveTo(bx, by);
                ctx.lineTo(cam.sx, cam.sy);
            }
            ctx.strokeStyle = red ? CANE_RED : CANE_WHITE;
            ctx.lineWidth = 2.2;
            ctx.globalAlpha = 0.75 + pulse * 0.25;
            ctx.stroke();
        }
    }
    ctx.restore();
    const firstStar = Math.ceil((cam.s + NEAR) / RAIL_STEP);
    const lastStar = Math.floor((cam.s + far) / RAIL_STEP);
    for (let n = lastStar; n >= firstStar; n--) {
        const s = n * RAIL_STEP;
        const x = roadX(s), y = roadY(s) + 0.6;
        for (const side of [-1, 1]) {
            if (!cam.project(x + side * (HALF_WIDTH + 0.35), y, s)) continue;
            const r = 0.2 * cam.f / cam.d;
            if (r < 1.2) {
                ctx.fillStyle = GOLD;
                ctx.fillRect(cam.sx - 1, cam.sy - 1, 2, 2);
                continue;
            }
            ctx.globalAlpha = 0.5 + 0.45 * pulse;
            ctx.fillStyle = GOLD;
            ctx.beginPath();
            starPath(ctx, cam.sx, cam.sy, r);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.fillStyle = RAIL_CORE;
            ctx.beginPath();
            starPath(ctx, cam.sx, cam.sy, r * 0.5);
            ctx.fill();
        }
    }
}

// --- trees ----------------------------------------------------------------

const TREE_STEP = 7;
const TREE_FAR = 150;
const LIGHTS = ['#ff5a5a', '#ffd166', '#7dff9a', '#8fd8ff'] as const;

/** Pine ramp by fog, baked per palette: foliage, the lit edge, snow, trunk. */
export interface TreeInk {
    foliage: string[];
    lit: string[];
    snow: string[];
    trunk: string[];
}

const FOG_STEPS = 8;

export function bakeTreeInk(theme: Theme): TreeInk {
    const out: TreeInk = {foliage: [], lit: [], snow: [], trunk: []};
    for (let i = 0; i < FOG_STEPS; i++) {
        const light = 1 - (i / (FOG_STEPS - 1)) * 0.75;
        out.foliage.push(lerpRgb(theme.bgRgb, [30, 92, 58], light));
        out.lit.push(lerpRgb(theme.bgRgb, [70, 150, 96], light));
        out.snow.push(lerpRgb(theme.bgRgb, [236, 242, 246], light));
        out.trunk.push(lerpRgb(theme.bgRgb, [92, 58, 36], light));
    }
    return out;
}

/**
 * Pines on both verges every TREE_STEP m, far to near: hashed heights and
 * offsets, three layered tiers with a lit edge and a snow cap on each, and
 * one tree in three strung with lights that `beat` (0..1) brightens.
 * Far trees are a single triangle.
 */
export function drawTrees(ctx: CanvasRenderingContext2D, cam: RoadCamera, ink: TreeInk, beat: number, time: number): void {
    const first = Math.ceil((cam.s + 2) / TREE_STEP);
    const last = Math.floor((cam.s + TREE_FAR) / TREE_STEP);
    for (let n = last; n >= first; n--) {
        for (const side of [-1, 1]) {
            const h = hash32(n, side < 0 ? 811 : 823);
            const s = n * TREE_STEP + rand01(hash32(h, 1)) * 3;
            const off = HALF_WIDTH + 0.9 + rand01(hash32(h, 2)) * (VERGE - 1.4);
            if (!cam.project(roadX(s) + side * off, roadY(s), s)) continue;
            const k = cam.f / cam.d;
            const height = (2.6 + rand01(hash32(h, 3)) * 2.6) * k;
            if (height < 3) continue;
            const x = cam.sx, y = cam.sy;
            const w = height * 0.36;
            const fog = Math.min(FOG_STEPS - 1, Math.floor((cam.d / TREE_FAR) * FOG_STEPS));
            if (height < 22) {
                ctx.fillStyle = ink.foliage[fog];
                ctx.beginPath();
                ctx.moveTo(x - w, y); ctx.lineTo(x, y - height); ctx.lineTo(x + w, y);
                ctx.fill();
                continue;
            }
            ctx.fillStyle = ink.trunk[fog];
            ctx.fillRect(x - w * 0.09, y - height * 0.2, w * 0.18, height * 0.2);
            const top = y - height, skirt = y - height * 0.16;
            const tiers = 3;
            // Tiers overlap: each starts below the last one's base.
            ctx.fillStyle = ink.foliage[fog];
            ctx.beginPath();
            for (let i = 0; i < tiers; i++) {
                const yA = skirt + (top - skirt) * (i / tiers) * 0.85;
                const yB = skirt + (top - skirt) * ((i + 1) / tiers);
                const tw = w * (1 - (i / tiers) * 0.62);
                ctx.moveTo(x - tw, yA); ctx.lineTo(x, yB); ctx.lineTo(x + tw, yA);
            }
            ctx.fill();
            // The side away from the road catches the light; snow caps each tier's peak.
            ctx.fillStyle = ink.lit[fog];
            ctx.beginPath();
            for (let i = 0; i < tiers; i++) {
                const yA = skirt + (top - skirt) * (i / tiers) * 0.85;
                const yB = skirt + (top - skirt) * ((i + 1) / tiers);
                const tw = w * (1 - (i / tiers) * 0.62) * side;
                ctx.moveTo(x, yB); ctx.lineTo(x + tw, yA); ctx.lineTo(x + tw * 0.5, yA);
            }
            ctx.fill();
            ctx.fillStyle = ink.snow[fog];
            ctx.beginPath();
            for (let i = 0; i < tiers; i++) {
                const yA = skirt + (top - skirt) * (i / tiers) * 0.85;
                const yB = skirt + (top - skirt) * ((i + 1) / tiers);
                const tw = w * (1 - (i / tiers) * 0.62);
                const c = 0.32;
                ctx.moveTo(x, yB);
                ctx.lineTo(x + tw * c, yB + (yA - yB) * c);
                ctx.lineTo(x, yB + (yA - yB) * c * 0.7);
                ctx.lineTo(x - tw * c, yB + (yA - yB) * c);
            }
            ctx.fill();
            if (h % 3 !== 0) continue;
            // A string of lights; half of them blink on the beat.
            const r = Math.max(1, height * 0.025);
            for (let i = 0; i < 9; i++) {
                const lh = hash32(h, 20 + i);
                const f = 0.15 + (i / 9) * 0.7;
                const ly = skirt + (top - skirt) * f;
                const lw = w * (1 - f * 0.75) * (rand01(lh) * 1.6 - 0.8);
                const blink = (lh & 1) === 0 ? 0.35 + 0.65 * beat : 0.6 + 0.4 * Math.sin(time * 3 + i);
                ctx.globalAlpha = blink;
                ctx.fillStyle = LIGHTS[(lh >>> 3) % LIGHTS.length];
                ctx.fillRect(x + lw - r, ly - r, r * 2, r * 2);
            }
            ctx.globalAlpha = 1;
        }
    }
}

// --- space ----------------------------------------------------------------

const STAR_LAYERS = [
    {count: 220, size: 1, parallax: 0.02, twinkle: 0, colors: ['#ffffff']},
    {count: 70, size: 1.3, parallax: 0.06, twinkle: 3, colors: ['#cfe6ff', '#fff4c8']},
    {count: 18, size: 1.8, parallax: 0.12, twinkle: 5, colors: ['#ffffff']},
] as const;

/** Void, two nebula discs (pine and holly) and a three-layer starfield that pans with the heading. */
export function drawSpace(ctx: CanvasRenderingContext2D, vw: number, vh: number, heading: number, time: number, theme: Theme): void {
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, vw, vh);
    for (const [fx, fy, fr, rgb, a] of [[0.78, 0.2, 0.2, '24, 90, 60', 0.34], [0.18, 0.16, 0.15, '120, 24, 40', 0.26]] as const) {
        const x = fx * vw - heading * vw * 0.3, y = fy * vh, r = fr * vh * 1.6;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${rgb}, ${a})`);
        g.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    let id = 0;
    for (const layer of STAR_LAYERS) {
        const pan = heading * layer.parallax * vw * 8;
        for (let c = 0; c < layer.colors.length; c++) {
            ctx.fillStyle = layer.colors[c];
            for (let i = 0; i < layer.count; i++, id++) {
                if (i % layer.colors.length !== c) continue;
                const h = hash32(id, 977);
                const x = ((rand01(h) * vw - pan) % vw + vw) % vw;
                const y = rand01(hash32(h, 1)) * vh;
                ctx.globalAlpha = layer.twinkle ? 0.35 + 0.2 * Math.sin(time * layer.twinkle + id) : 0.32;
                ctx.fillRect(x, y, layer.size, layer.size);
            }
        }
    }
    ctx.globalAlpha = 1;
}

// --- signs ------------------------------------------------------------------

const NEON = ['#ff5a5a', '#6dff9a', '#ffd166', '#e8f4ff'] as const;
const SIGN_SPACING = 95;

type Shape = Array<Array<[number, number]>>;

function ring(cx: number, cy: number, rx: number, ry: number, n = 20): Array<[number, number]> {
    return Array.from({length: n + 1}, (_, i): [number, number] => [cx + Math.cos((i / n) * TAU) * rx, cy + Math.sin((i / n) * TAU) * ry]);
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number, n = 10): Array<[number, number]> {
    return Array.from({length: n + 1}, (_, i): [number, number] => {
        const a = a0 + (a1 - a0) * (i / n);
        return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    });
}

/** Christmas line art in a unit box (y up). */
const SHAPES: readonly Shape[] = [
    // Star.
    [[...STAR.map(([x, y]): [number, number] => [x * 0.5, -y * 0.5]), [STAR[0][0] * 0.5, -STAR[0][1] * 0.5]]],
    // Candy cane: a hook and its stripes.
    [[[0.12, -0.5], [0.12, 0.2], ...arc(-0.06, 0.2, 0.18, 0, Math.PI)],
        [[0.04, -0.3], [0.2, -0.18]], [[0.04, -0.05], [0.2, 0.07]], [[0.04, 0.18], [0.2, 0.3]]],
    // Bell: dome, flare, clapper.
    [[[-0.4, -0.25], [-0.28, -0.12], ...arc(0, 0.12, 0.28, Math.PI, 0), [0.28, -0.12], [0.4, -0.25], [-0.4, -0.25]],
        ring(0, -0.36, 0.08, 0.08, 10), [[0, 0.4], [0, 0.5]]],
    // Wreath with a bow.
    [ring(0, 0.05, 0.4, 0.4), ring(0, 0.05, 0.24, 0.24), [[-0.18, -0.48], [0, -0.32], [0.18, -0.48], [0.18, -0.2], [0, -0.32], [-0.18, -0.2], [-0.18, -0.48]]],
    // Gift: a box, its ribbon and a bow.
    [[[-0.4, -0.45], [0.4, -0.45], [0.4, 0.2], [-0.4, 0.2], [-0.4, -0.45]], [[0, -0.45], [0, 0.2]], [[-0.4, -0.1], [0.4, -0.1]],
        [[0, 0.2], [-0.22, 0.42], [-0.08, 0.2]], [[0, 0.2], [0.22, 0.42], [0.08, 0.2]]],
];

/**
 * Signs hang off both sides of the course at fixed distances, facing the
 * road. Two in five blink at 2 Hz; `flash` (0..1) brightens them all.
 */
export function drawSigns(ctx: CanvasRenderingContext2D, cam: RoadCamera, far: number, time: number, flash: number): void {
    const first = Math.ceil(cam.s / SIGN_SPACING);
    const last = Math.floor((cam.s + far * 1.4) / SIGN_SPACING);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (let n = last; n >= first; n--) {
        const h = hash32(n, 4099);
        const s = n * SIGN_SPACING;
        const side = (n & 1) === 0 ? -1 : 1;
        const x0 = roadX(s) + side * (40 + rand01(hash32(h, 1)) * 45);
        const y0 = roadY(s) + 10 + rand01(hash32(h, 2)) * 22;
        const size = 11 + rand01(hash32(h, 3)) * 8;
        const shape = SHAPES[h % SHAPES.length];
        const color = NEON[(h >>> 5) % NEON.length];
        const blink = (h >>> 9) % 5 < 2 && Math.sin(time * TAU * 2 + n) < 0;
        const alpha = (blink ? 0.3 : 1) * (0.3 + 0.45 * flash);
        if (!cam.project(x0, y0, s)) continue;
        const k = cam.f / cam.d;
        const fade = Math.min(1, (cam.s + far * 1.4 - s) / 60);
        ctx.strokeStyle = color;
        for (const pass of [0, 1]) {
            ctx.globalAlpha = alpha * fade * (pass === 0 ? 0.28 : 0.95);
            ctx.lineWidth = Math.max(1, (pass === 0 ? 1.2 : 0.35) * k);
            ctx.beginPath();
            for (const line of shape) {
                line.forEach(([u, v], i) => {
                    const px = cam.sx + u * size * k, py = cam.sy - v * size * k;
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                });
            }
            ctx.stroke();
        }
    }
    ctx.restore();
}
