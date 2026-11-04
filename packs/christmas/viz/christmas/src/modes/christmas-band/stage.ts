/**
 * The room: garland along the top, a window with snow falling outside, a
 * fireplace whose fire follows the kick, stockings on the mantel in each
 * member's colour, a wreath behind Santa and a tree whose lights twinkle on
 * the hats. Snow and flicker are functions of the cycle, so a frame is the
 * same from a cold start and from a seek.
 */

import {fillTri, hash32, PH, PW, rand01, TAU} from '@cycletron/viz-sdk';
import type {Ink} from '../../lib/ink.js';

export const FRONT_FOOT = 154;
export const BACK_FOOT = 102;
export const LIGHT_Y = 164;

const WIN_X = 14;
const WIN_Y = 16;
const WIN_W = 44;
const WIN_H = 46;
const FLAKES = 30;

const FIRE_X = 66;
const FIRE_W = 48;
const MANTEL_Y = 50;
const HEARTH_X = 76;
const HEARTH_W = 28;
const HEARTH_Y = 60;
/** Flame columns across the hearth, tallest in the middle. */
const FLAME: readonly number[] = [2, 4, 6, 8, 9, 10, 9, 8, 6, 4, 2];

const TREE_X = 270;
/** Each tier: apex y, base y, half width at the base. Drawn bottom up. */
const TIERS: readonly (readonly [number, number, number])[] = [[12, 38, 14], [26, 60, 22], [44, 82, 30], [62, 100, 36]];
const BULBS = 26;

interface Bulb {
    x: number;
    y: number;
    /** 0 red, 1 gold, 2 ice, 3 snow. */
    c: number;
}

/** Bulb spots, fixed by hash so the tree is dressed the same every time. */
const BULB_AT: readonly Bulb[] = Array.from({length: BULBS}, (_, i) => {
    const [apex, base, half] = TIERS[i % TIERS.length];
    const y = apex + 7 + Math.round(rand01(hash32(i, 11)) * (base - apex - 10));
    const w = (half * (y - apex)) / (base - apex);
    const x = TREE_X + Math.round((rand01(hash32(i, 12)) * 2 - 1) * w * 0.8);
    return {x, y, c: (i * 3 + (i >> 2)) % 4};
});

export function drawBackdrop(
    ctx: CanvasRenderingContext2D, ink: Ink, cycle: number, thump: number, twinkle: number, stockings: readonly string[],
): void {
    ctx.fillStyle = ink.wall;
    ctx.fillRect(0, 0, PW, BACK_FOOT);
    ctx.fillStyle = ink.wallDark;
    for (let x = 4; x < PW; x += 16) ctx.fillRect(x, 0, 2, BACK_FOOT);
    // Dado rail and the panel below it.
    ctx.fillRect(0, 82, PW, BACK_FOOT - 82);
    ctx.fillStyle = ink.stoneDark;
    ctx.fillRect(0, 80, PW, 2);
    ctx.fillStyle = ink.line;
    for (let x = 0; x < PW; x += 24) ctx.fillRect(x, 84, 1, BACK_FOOT - 84);

    drawWindow(ctx, ink, cycle);
    drawFireplace(ctx, ink, cycle, thump, stockings);
    drawWreath(ctx, ink, 160, 30);
    drawClock(ctx, ink, 216, 40, cycle);
    drawTree(ctx, ink, cycle, twinkle);
    drawGarland(ctx, ink);
}

function drawGarland(ctx: CanvasRenderingContext2D, ink: Ink): void {
    for (let x = 0; x < PW; x += 2) {
        const t = (x % 48) / 48;
        const y = 2 + Math.round(3 * (1 - Math.cos(TAU * t)));
        ctx.fillStyle = ink.line;
        ctx.fillRect(x, y, 2, 6);
        ctx.fillStyle = (x >> 1) & 1 ? ink.green : ink.greenDark;
        ctx.fillRect(x, y + 1, 2, 4);
        if (x % 12 === 6) {
            ctx.fillStyle = ink.red;
            ctx.fillRect(x, y + 2, 2, 2);
        }
    }
    for (let x = 0; x < PW; x += 48) {
        ctx.fillStyle = ink.line;
        ctx.fillRect(x - 4, 0, 8, 6);
        ctx.fillStyle = ink.gold;
        ctx.fillRect(x - 3, 1, 3, 3);
        ctx.fillRect(x + 1, 1, 3, 3);
        ctx.fillStyle = ink.goldDark;
        ctx.fillRect(x, 2, 1, 2);
    }
}

function drawWindow(ctx: CanvasRenderingContext2D, ink: Ink, cycle: number): void {
    const x = WIN_X;
    const y = WIN_Y;
    ctx.fillStyle = ink.night;
    ctx.fillRect(x, y, WIN_W, WIN_H);
    // A crescent moon, high on the left pane.
    for (let dy = -5; dy <= 5; dy++) {
        for (let dx = -5; dx <= 5; dx++) {
            if (dx * dx + dy * dy > 20) continue;
            if ((dx - 2) * (dx - 2) + (dy - 1) * (dy - 1) <= 16) continue;
            ctx.fillStyle = dx < -2 ? ink.snowDim : ink.snow;
            ctx.fillRect(x + 9 + dx, y + 10 + dy, 1, 1);
        }
    }
    // Distant evergreen pines and snowy hills outside the window.
    ctx.fillStyle = ink.greenDark;
    fillTri(ctx, x + 12, y + 26, x + 5, y + WIN_H - 4, x + 19, y + WIN_H - 4, ink.greenDark, ink.line);
    fillTri(ctx, x + 33, y + 23, x + 25, y + WIN_H - 4, x + 41, y + WIN_H - 4, ink.greenDark, ink.line);
    ctx.fillStyle = ink.snowDim;
    ctx.fillRect(x, y + WIN_H - 6, WIN_W, 4);
    // Snow outside: each flake falls at its own rate and drifts on a sine.
    for (let i = 0; i < FLAKES; i++) {
        const sx = rand01(hash32(i, 1));
        const sy = rand01(hash32(i, 2));
        const rate = 0.25 + 0.45 * rand01(hash32(i, 3));
        const fx = (sx * WIN_W + 5 * Math.sin(TAU * (cycle * 0.4 + sx)) + WIN_W * 4) % WIN_W;
        const fy = ((sy + cycle * rate) % 1) * WIN_H;
        const big = (i & 3) === 0;
        ctx.fillStyle = big ? ink.snow : ink.snowDim;
        ctx.fillRect(x + Math.floor(fx), y + Math.floor(fy), big ? 2 : 1, big ? 2 : 1);
    }
    // Drifts on the sill, mullions and the frame.
    ctx.fillStyle = ink.snow;
    ctx.fillRect(x, y + WIN_H - 3, 10, 3);
    ctx.fillRect(x + 10, y + WIN_H - 2, 12, 2);
    ctx.fillRect(x + 24, y + WIN_H - 2, 20, 2);
    ctx.fillRect(x + 20, y + 22, 7, 2);
    ctx.fillStyle = ink.stone;
    ctx.fillRect(x + 21, y, 2, WIN_H);
    ctx.fillRect(x, y + 22, WIN_W, 2);
    ctx.fillRect(x - 2, y - 2, WIN_W + 4, 2);
    ctx.fillRect(x - 2, y, 2, WIN_H);
    ctx.fillRect(x + WIN_W, y, 2, WIN_H);
    ctx.fillRect(x - 4, y + WIN_H, WIN_W + 8, 3);
    ctx.fillStyle = ink.stoneDark;
    ctx.fillRect(x - 4, y + WIN_H + 3, WIN_W + 8, 1);
    // Curtains, tied back with gold tassels.
    ctx.fillStyle = ink.redDark;
    ctx.fillRect(x - 6, y - 4, 5, WIN_H + 6);
    ctx.fillRect(x + WIN_W + 1, y - 4, 5, WIN_H + 6);
    ctx.fillStyle = ink.red;
    ctx.fillRect(x - 5, y - 4, 2, WIN_H + 6);
    ctx.fillRect(x + WIN_W + 3, y - 4, 2, WIN_H + 6);
    ctx.fillStyle = ink.gold;
    ctx.fillRect(x - 7, y + 26, 7, 2);
    ctx.fillRect(x + WIN_W, y + 26, 7, 2);
    ctx.fillStyle = ink.line;
    ctx.fillRect(x - 8, y - 6, WIN_W + 16, 2);
}

function drawFireplace(ctx: CanvasRenderingContext2D, ink: Ink, cycle: number, thump: number, stockings: readonly string[]): void {
    const x = FIRE_X;
    // Brick surround with mortar, courses offset by row.
    ctx.fillStyle = ink.brickDark;
    ctx.fillRect(x, MANTEL_Y + 4, FIRE_W, BACK_FOOT - MANTEL_Y - 4);
    ctx.fillStyle = ink.brick;
    for (let row = 0; row < 12; row++) {
        const y = MANTEL_Y + 5 + row * 4;
        for (let bx = (row & 1) * 4 - 4; bx < FIRE_W; bx += 8) {
            const left = Math.max(x, x + bx);
            const right = Math.min(x + FIRE_W, x + bx + 7);
            if (right > left) ctx.fillRect(left, y, right - left, 3);
        }
    }
    // The hearth.
    ctx.fillStyle = ink.line;
    ctx.fillRect(HEARTH_X - 1, HEARTH_Y - 1, HEARTH_W + 2, BACK_FOOT - HEARTH_Y + 1);
    ctx.fillStyle = ink.sil;
    ctx.fillRect(HEARTH_X, HEARTH_Y, HEARTH_W, BACK_FOOT - HEARTH_Y);
    // Brass andirons & logs.
    ctx.fillStyle = ink.goldDark;
    ctx.fillRect(HEARTH_X + 3, BACK_FOOT - 9, 2, 6);
    ctx.fillRect(HEARTH_X + HEARTH_W - 5, BACK_FOOT - 9, 2, 6);
    ctx.fillStyle = ink.brownDark;
    ctx.fillRect(HEARTH_X + 4, BACK_FOOT - 7, 20, 3);
    ctx.fillStyle = ink.brown;
    ctx.fillRect(HEARTH_X + 7, BACK_FOOT - 10, 14, 3);
    // Flames: the kick lifts them, the cycle flickers them.
    const tick = Math.floor(cycle * 10);
    const lift = 0.45 + 0.75 * thump;
    for (let i = 0; i < FLAME.length; i++) {
        const fx = HEARTH_X + 3 + i * 2;
        const flicker = hash32(i, tick) % 3;
        const h = Math.round(FLAME[i] * lift) + flicker;
        if (h <= 0) continue;
        const base = BACK_FOOT - 9;
        ctx.fillStyle = ink.flame;
        ctx.fillRect(fx, base - h, 2, h);
        const core = Math.max(0, Math.round(h * 0.55) - (Math.abs(i - 5) > 2 ? 2 : 0));
        if (core > 0) {
            ctx.fillStyle = ink.flameHot;
            ctx.fillRect(fx, base - core, 2, core);
        }
    }
    // Embers rising; each one loops on its own clock.
    for (let i = 0; i < 4; i++) {
        const t = (cycle * (0.8 + 0.3 * i) + rand01(hash32(i, 21))) % 1;
        const ex = HEARTH_X + 6 + ((i * 7 + hash32(i, Math.floor(cycle * 2)) % 3) % (HEARTH_W - 10));
        const ey = BACK_FOOT - 12 - Math.round(t * 22);
        if (ey < HEARTH_Y + 2) continue;
        ctx.fillStyle = t < 0.5 ? ink.flameHot : ink.ember;
        ctx.fillRect(ex, ey, 1, 1);
    }
    // Mantel, with a candle and holly sprig at each end.
    ctx.fillStyle = ink.line;
    ctx.fillRect(x - 3, MANTEL_Y - 1, FIRE_W + 6, 6);
    ctx.fillStyle = ink.stone;
    ctx.fillRect(x - 2, MANTEL_Y, FIRE_W + 4, 4);
    ctx.fillStyle = ink.stoneDark;
    ctx.fillRect(x - 2, MANTEL_Y + 3, FIRE_W + 4, 1);
    for (const cx of [x + 1, x + FIRE_W - 3]) {
        ctx.fillStyle = ink.snow;
        ctx.fillRect(cx, MANTEL_Y - 7, 2, 7);
        ctx.fillStyle = hash32(cx, tick) & 1 ? ink.flameHot : ink.flame;
        ctx.fillRect(cx, MANTEL_Y - 9, 2, 2);
    }
    // Stockings hang from the mantel, one per member in its colour (up to 7).
    const n = Math.min(stockings.length, 7);
    const step = n > 6 ? 7 : 8;
    for (let i = 0; i < n; i++) {
        const sx = x + 1 + i * step;
        const sy = MANTEL_Y + 5;
        ctx.fillStyle = ink.line;
        ctx.fillRect(sx - 1, sy - 1, 6, 11);
        ctx.fillRect(sx + 2, sy + 6, 5, 5);
        ctx.fillStyle = stockings[i];
        ctx.fillRect(sx, sy + 2, 4, 7);
        ctx.fillRect(sx + 3, sy + 7, 3, 3);
        ctx.fillStyle = ink.snow;
        ctx.fillRect(sx, sy, 4, 2);
        ctx.fillRect(sx + 5, sy + 7, 1, 3);
    }
}

/** A wall clock. The minute hand goes round once in 16 bars, the hour hand once in 192. */
function drawClock(ctx: CanvasRenderingContext2D, ink: Ink, cx: number, cy: number, cycle: number): void {
    const r = 7;
    for (let dy = -r - 1; dy <= r + 1; dy++) {
        for (let dx = -r - 1; dx <= r + 1; dx++) {
            const d = dx * dx + dy * dy;
            if (d > (r + 1) * (r + 1)) continue;
            ctx.fillStyle = d > r * r ? ink.brownDark : ink.snow;
            ctx.fillRect(cx + dx, cy + dy, 1, 1);
        }
    }
    ctx.fillStyle = ink.line;
    ctx.fillRect(cx - 9, cy - 11, 18, 2);
    ctx.fillRect(cx - 1, cy - 7, 2, 1);
    ctx.fillRect(cx - 1, cy + 6, 2, 1);
    ctx.fillRect(cx - 7, cy, 1, 1);
    ctx.fillRect(cx + 6, cy, 1, 1);
    const minute = (TAU * (cycle % 16)) / 16 - TAU / 4;
    const hour = (TAU * (cycle % 192)) / 192 - TAU / 4;
    hand(ctx, cx, cy, Math.cos(minute) * 5, Math.sin(minute) * 5, ink.line);
    hand(ctx, cx, cy, Math.cos(hour) * 3, Math.sin(hour) * 3, ink.line);
    ctx.fillStyle = ink.red;
    ctx.fillRect(cx, cy, 1, 1);
}

function hand(ctx: CanvasRenderingContext2D, cx: number, cy: number, dx: number, dy: number, colour: string): void {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    ctx.fillStyle = colour;
    for (let i = 0; i <= n; i++) ctx.fillRect(cx + Math.round((dx * i) / n), cy + Math.round((dy * i) / n), 1, 1);
}

function drawWreath(ctx: CanvasRenderingContext2D, ink: Ink, cx: number, cy: number): void {
    const outer = 13;
    const inner = 7;
    for (let dy = -outer - 1; dy <= outer + 1; dy++) {
        for (let dx = -outer - 1; dx <= outer + 1; dx++) {
            const d = dx * dx + dy * dy;
            if (d > (outer + 1) * (outer + 1) || d < (inner - 1) * (inner - 1)) continue;
            const edge = d > outer * outer || d < inner * inner;
            ctx.fillStyle = edge ? ink.line : (dx + dy) & 1 ? ink.green : ink.greenDark;
            ctx.fillRect(cx + dx, cy + dy, 1, 1);
        }
    }
    for (let i = 0; i < 6; i++) {
        const a = (TAU * i) / 6 + 0.4;
        const bx = cx + Math.round(Math.cos(a) * 10);
        const by = cy + Math.round(Math.sin(a) * 10);
        ctx.fillStyle = ink.red;
        ctx.fillRect(bx - 1, by - 1, 2, 2);
    }
    ctx.fillStyle = ink.line;
    ctx.fillRect(cx - 7, cy + 10, 14, 6);
    ctx.fillStyle = ink.red;
    ctx.fillRect(cx - 6, cy + 11, 5, 4);
    ctx.fillRect(cx + 1, cy + 11, 5, 4);
    ctx.fillRect(cx - 4, cy + 15, 3, 4);
    ctx.fillRect(cx + 1, cy + 15, 3, 4);
    ctx.fillStyle = ink.redDark;
    ctx.fillRect(cx - 1, cy + 12, 2, 2);
}

function drawTree(ctx: CanvasRenderingContext2D, ink: Ink, cycle: number, twinkle: number): void {
    // Trunk and the pot.
    ctx.fillStyle = ink.line;
    ctx.fillRect(TREE_X - 5, 88, 10, 14);
    ctx.fillStyle = ink.brown;
    ctx.fillRect(TREE_X - 4, 89, 8, 13);
    ctx.fillStyle = ink.line;
    ctx.fillRect(TREE_X - 11, 94, 22, 8);
    ctx.fillStyle = ink.red;
    ctx.fillRect(TREE_X - 10, 95, 20, 7);
    ctx.fillStyle = ink.gold;
    ctx.fillRect(TREE_X - 10, 96, 20, 1);
    // Tiers, bottom up, each with an outline.
    for (let t = TIERS.length - 1; t >= 0; t--) {
        const [apex, base, half] = TIERS[t];
        fillTri(ctx, TREE_X, apex - 2, TREE_X - half - 2, base + 1, TREE_X + half + 2, base + 1, ink.line, ink.line);
        fillTri(ctx, TREE_X, apex, TREE_X - half, base, TREE_X + half, base, ink.green, ink.greenDark);
    }
    // Tinsel.
    ctx.fillStyle = ink.goldDark;
    for (let i = 0; i < 16; i++) ctx.fillRect(TREE_X - 20 + i * 2, 70 - (i >> 1), 2, 1);
    for (let i = 0; i < 12; i++) ctx.fillRect(TREE_X - 14 + i * 2, 50 - (i >> 1), 2, 1);
    for (let i = 0; i < 8; i++) ctx.fillRect(TREE_X - 8 + i * 2, 31 - (i >> 1), 2, 1);
    // Bulbs: all hang dim; on a hat, a hashed pick of them flashes.
    const tick = Math.floor(cycle * 4);
    const on = twinkle > 0.3;
    const colours = [ink.red, ink.gold, ink.ice, ink.snow];
    for (let i = 0; i < BULB_AT.length; i++) {
        const bulb = BULB_AT[i];
        const lit = on && rand01(hash32(i, tick)) < 0.55;
        ctx.fillStyle = colours[bulb.c];
        if (lit) {
            ctx.fillRect(bulb.x - 1, bulb.y - 2, 3, 5);
            ctx.fillRect(bulb.x - 2, bulb.y - 1, 5, 3);
            ctx.fillStyle = ink.snow;
            ctx.fillRect(bulb.x, bulb.y, 1, 1);
        } else {
            ctx.fillRect(bulb.x - 1, bulb.y - 1, 2, 2);
        }
    }
    // Star topper with sparkle rays when twinkling.
    ctx.fillStyle = ink.line;
    ctx.fillRect(TREE_X - 4, 6, 9, 9);
    ctx.fillStyle = on ? ink.snow : ink.gold;
    ctx.fillRect(TREE_X - 3, 9, 7, 3);
    ctx.fillRect(TREE_X - 1, 7, 3, 7);
    ctx.fillRect(TREE_X - 2, 8, 5, 5);
    if (on) {
        ctx.fillStyle = ink.gold;
        ctx.fillRect(TREE_X - 6, 10, 2, 1);
        ctx.fillRect(TREE_X + 5, 10, 2, 1);
        ctx.fillRect(TREE_X, 4, 1, 2);
    }
    // Presents under the tree.
    present(ctx, ink, TREE_X - 34, 90, 14, 12, ink.red, ink.gold);
    present(ctx, ink, TREE_X + 14, 92, 12, 10, ink.ice, ink.red);
    present(ctx, ink, TREE_X + 28, 94, 10, 8, ink.gold, ink.green);
}

function present(ctx: CanvasRenderingContext2D, ink: Ink, x: number, y: number, w: number, h: number, box: string, ribbon: string): void {
    ctx.fillStyle = ink.line;
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = box;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = ribbon;
    ctx.fillRect(x + (w >> 1) - 1, y, 2, h);
    ctx.fillRect(x, y + (h >> 1) - 1, w, 2);
    ctx.fillRect(x + (w >> 1) - 3, y - 2, 2, 2);
    ctx.fillRect(x + (w >> 1) + 1, y - 2, 2, 2);
}

export function drawFloor(ctx: CanvasRenderingContext2D, ink: Ink, thump = 0): void {
    ctx.fillStyle = ink.floor;
    ctx.fillRect(0, BACK_FOOT, PW, PH - BACK_FOOT);
    ctx.fillStyle = ink.floorLine;
    for (let y = BACK_FOOT + 6; y < PH; y += 6) {
        ctx.fillRect(0, y, PW, 1);
        const row = (y - BACK_FOOT) / 6;
        for (let x = (row & 1) * 20; x < PW; x += 40) ctx.fillRect(x, y - 5, 1, 5);
    }
    // Warm hearth glow on the floorboards in front of the fireplace.
    const glowW = 28 + Math.round(thump * 8);
    ctx.fillStyle = ink.rugAlt;
    ctx.fillRect(HEARTH_X + (HEARTH_W >> 1) - (glowW >> 1), BACK_FOOT + 1, glowW, 8);
    if (thump > 0.25) {
        ctx.fillStyle = ink.flame;
        ctx.fillRect(HEARTH_X + 4, BACK_FOOT + 1, HEARTH_W - 8, 4);
    }
    // The rug under the front row, with gold fringe on both ends.
    ctx.fillStyle = ink.line;
    ctx.fillRect(15, 117, PW - 30, 48);
    ctx.fillStyle = ink.rugAlt;
    ctx.fillRect(16, 118, PW - 32, 46);
    ctx.fillStyle = ink.rug;
    ctx.fillRect(20, 122, PW - 40, 38);
    ctx.fillStyle = ink.goldDark;
    for (let y = 120; y < 162; y += 3) {
        ctx.fillRect(13, y, 2, 2);
        ctx.fillRect(PW - 15, y, 2, 2);
    }
    ctx.fillStyle = ink.rugAlt;
    for (let x = 24; x < PW - 24; x += 12) {
        ctx.fillRect(x, 126, 4, 1);
        ctx.fillRect(x + 1, 125, 2, 3);
        ctx.fillRect(x, 155, 4, 1);
        ctx.fillRect(x + 1, 154, 2, 3);
    }
    // Santa's riser with brass trim.
    ctx.fillStyle = ink.line;
    ctx.fillRect(103, BACK_FOOT - 3, 114, 9);
    ctx.fillStyle = ink.brownDark;
    ctx.fillRect(104, BACK_FOOT - 2, 112, 7);
    ctx.fillStyle = ink.brown;
    ctx.fillRect(104, BACK_FOOT - 2, 112, 2);
    ctx.fillStyle = ink.goldDark;
    ctx.fillRect(104, BACK_FOOT + 4, 112, 1);
    // Stage amp stacks on the outer corners of the drum riser (clear of the fireplace).
    drawAmpStack(ctx, ink, 105, BACK_FOOT + 2, thump > 0.35);
    drawAmpStack(ctx, ink, 199, BACK_FOOT + 2, thump > 0.35);
}

function drawAmpStack(ctx: CanvasRenderingContext2D, ink: Ink, x: number, footY: number, hot: boolean): void {
    // Speaker cabinet
    ctx.fillStyle = ink.line;
    ctx.fillRect(x - 1, footY - 22, 18, 22);
    ctx.fillStyle = ink.sil;
    ctx.fillRect(x, footY - 21, 16, 20);
    ctx.fillStyle = ink.stoneDark;
    ctx.fillRect(x + 2, footY - 19, 12, 16);
    // Dual speaker cones
    ctx.fillStyle = ink.line;
    ctx.fillRect(x + 4, footY - 17, 3, 3);
    ctx.fillRect(x + 9, footY - 17, 3, 3);
    ctx.fillRect(x + 4, footY - 10, 3, 3);
    ctx.fillRect(x + 9, footY - 10, 3, 3);
    // Amp head on top with gold faceplate & pilot light
    ctx.fillStyle = ink.line;
    ctx.fillRect(x, footY - 29, 16, 7);
    ctx.fillStyle = ink.redDark;
    ctx.fillRect(x + 1, footY - 28, 14, 5);
    ctx.fillStyle = ink.gold;
    ctx.fillRect(x + 2, footY - 26, 9, 2);
    ctx.fillStyle = hot ? ink.flameHot : ink.red;
    ctx.fillRect(x + 12, footY - 26, 2, 2);
}
