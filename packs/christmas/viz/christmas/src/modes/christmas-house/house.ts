/**
 * The house: the Halloween mansion's layout, dressed for Christmas. Brick
 * walls, snow on every roof line, icicles under the eaves, snowy fences and
 * drifts. The static part is baked once per palette into a layer; the
 * decorated firs and the roof lights are drawn each frame, since hats light them.
 */

import {drawSprite, frameRect, fillTri, hash32, PH, PW} from '@cycletron/viz-sdk';
import {type Look} from './look.js';
import {BAG_DARK, FIR, XMAS_FIR} from './sprites.js';
import {drawRidge} from '@naderlabs/pixel-kit/night';

export interface Win {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface House {
    windows: Win[];
    groups: {bass: number[]; mid: number[]; lead: number[]; tower: number[]};
    door: Win;
    chimney: {x: number; y: number; w: number; h: number};
    vane: {x: number; y: number};
    lanterns: {x: number; y: number}[];
    snowman: {x: number; y: number};
    yard: number;
    horizon: number;
    main: Win;
    tower: Win;
    porch: Win;
    posts: readonly number[];
    gable: readonly [number, number, number, number, number, number];
    spire: readonly [number, number, number, number, number, number];
}

const YARD = 156;
const HORIZON = 118;

export const HOUSE: House = build();

/** Bulb spacing along the gable, px. */
const BULB_STEP = 5;

/** The static house and yard, painted once into a transparent 320×180 layer. */
export function bakeShell(look: Look): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = PW;
    c.height = PH;
    const g = c.getContext('2d');
    if (!g) throw new Error('2d');
    g.imageSmoothingEnabled = false;
    drawShell(g, look);
    return c;
}

/** The two decorated firs; `hatGlow` (0..1) lights their bulbs. */
export function drawFirs(ctx: CanvasRenderingContext2D, look: Look, hatGlow: number): void {
    const ink = look.ink;
    const {horizon} = HOUSE;
    const bulb = hatGlow > 0.25;
    drawSprite(ctx, XMAS_FIR, 4, horizon + 6 - XMAS_FIR.h * 2, [
        null, ink.green, ink.snow, bulb ? ink.red : ink.greenDark, ink.gold, ink.brownDark,
    ], {scale: 2});
    drawSprite(ctx, XMAS_FIR, PW - 30, horizon + 6 - XMAS_FIR.h * 2, [
        null, ink.green, ink.snow, bulb ? ink.gold : ink.greenDark, ink.gold, ink.brownDark,
    ], {scale: 2});
}

function drawShell(ctx: CanvasRenderingContext2D, look: Look): void {
    const ink = look.ink;
    const {main, tower, porch, door, chimney, posts, gable, spire, yard, horizon} = HOUSE;

    // Snow on the ground: the far field dim, a dither at the horizon, the yard bright.
    ctx.fillStyle = ink.snowDim;
    ctx.fillRect(0, horizon, PW, PH - horizon);
    ctx.fillStyle = look.snowDither;
    ctx.fillRect(0, horizon - 6, PW, 8);
    ctx.fillStyle = ink.snow;
    ctx.fillRect(0, yard, PW, PH - yard);

    drawRidge(ctx, horizon, ink.sil);
    drawSprite(ctx, FIR, 36, horizon - 4 - FIR.h, [null, ink.sil]);
    drawSprite(ctx, FIR, PW - 52, horizon - 4 - FIR.h, [null, ink.sil]);
    drawSideFence(ctx, horizon, ink.line, ink.snow);

    ctx.fillStyle = ink.brickDark;
    ctx.fillRect(tower.x, tower.y, tower.w, tower.h);
    bricks(ctx, tower, ink.brick, 2);
    frameRect(ctx, tower.x, tower.y, tower.w, tower.h, ink.line);

    ctx.fillStyle = ink.brick;
    ctx.fillRect(main.x, main.y, main.w, main.h);
    bricks(ctx, main, ink.brickDark, 0);
    frameRect(ctx, main.x, main.y, main.w, main.h, ink.line);

    fillTri(ctx, gable[0], gable[1], gable[2], gable[3], gable[4], gable[5], ink.greenDark, ink.sil);
    fillTri(ctx, spire[0], spire[1], spire[2], spire[3], spire[4], spire[5], ink.greenDark, ink.sil);
    roofSnow(ctx, gable, ink.snow, ink.snowDim);
    roofSnow(ctx, spire, ink.snow, ink.snowDim);
    icicles(ctx, gable[0] + 2, gable[4] - 2, gable[1] + 1, ink.ice, 11);

    ctx.fillStyle = ink.stoneDark;
    ctx.fillRect(chimney.x, chimney.y, chimney.w, chimney.h);
    bricks(ctx, chimney, ink.stone, 1);
    frameRect(ctx, chimney.x, chimney.y, chimney.w, chimney.h, ink.line);
    ctx.fillStyle = ink.line;
    ctx.fillRect(chimney.x + 2, chimney.y, chimney.w - 4, 4);
    cap(ctx, chimney.x - 1, chimney.y - 2, chimney.w + 2, ink.snow, ink.snowDim);

    ctx.fillStyle = ink.redDark;
    ctx.fillRect(porch.x, porch.y, porch.w, porch.h);
    cap(ctx, porch.x, porch.y - 2, porch.w, ink.snow, ink.snowDim);
    icicles(ctx, porch.x + 2, porch.x + porch.w - 2, porch.y + porch.h, ink.ice, 23);
    ctx.fillStyle = ink.brickDark;
    for (const x of posts) ctx.fillRect(x, porch.y + porch.h, 3, yard - (porch.y + porch.h));

    // A dark slot, so the swinging door has a hole to open onto.
    ctx.fillStyle = ink.line;
    ctx.fillRect(door.x, door.y, door.w, door.h);

    let stepW = door.w + 16;
    for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i % 2 === 0 ? ink.stone : ink.stoneDark;
        ctx.fillRect(Math.round(door.x + door.w / 2 - stepW / 2), yard + i * 3, stepW, 3);
        ctx.fillStyle = ink.snow;
        ctx.fillRect(Math.round(door.x + door.w / 2 - stepW / 2), yard + i * 3, 3, 1);
        ctx.fillRect(Math.round(door.x + door.w / 2 + stepW / 2) - 3, yard + i * 3, 3, 1);
        stepW += 16;
    }
    drifts(ctx, yard, ink.snow, ink.snowDim);
}

/** The string of lights on both gable edges, red, green, gold, stepping one place per `chase`. */
export function drawLights(ctx: CanvasRenderingContext2D, look: Look, chase: number): void {
    const ink = look.ink;
    const colors = [ink.red, ink.green, ink.gold];
    const [x0, y0, x1, y1, x2, y2] = HOUSE.gable;
    let n = 0;
    for (const [ax, ay, bx, by] of [[x0, y0, x1, y1], [x1, y1, x2, y2]] as const) {
        const len = Math.abs(bx - ax);
        for (let d = 3; d < len - 2; d += BULB_STEP) {
            const t = d / len;
            const x = Math.round(ax + (bx - ax) * t);
            const y = Math.round(ay + (by - ay) * t) + 3;
            ctx.fillStyle = colors[(n + chase) % 3];
            ctx.fillRect(x, y, 1, 1);
            n++;
        }
    }
}

/** A snow cap: a bright top row or two and a dim underside. */
function cap(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, snow: string, dim: string): void {
    ctx.fillStyle = snow;
    ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = dim;
    ctx.fillRect(x + 1, y + 2, w - 2, 1);
}

/** Snow along both sloped edges of a roof triangle (left, apex, right). */
function roofSnow(ctx: CanvasRenderingContext2D, tri: readonly number[], snow: string, dim: string): void {
    const [x0, y0, x1, y1, x2, y2] = tri;
    for (const [ax, ay, bx, by] of [[x0, y0, x1, y1], [x1, y1, x2, y2]]) {
        const steps = Math.abs(bx - ax);
        for (let i = 0; i <= steps; i++) {
            const x = Math.round(ax + (bx - ax) * (i / steps));
            const y = Math.round(ay + (by - ay) * (i / steps));
            ctx.fillStyle = snow;
            ctx.fillRect(x, y - 1, 1, 2);
            ctx.fillStyle = dim;
            ctx.fillRect(x, y + 1, 1, 1);
        }
    }
}

/** Icicles: 1-px drops of hashed length under an eave. */
function icicles(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, color: string, salt: number): void {
    ctx.fillStyle = color;
    for (let x = x0; x < x1; x += 3 + (hash32(x, salt) & 1)) {
        ctx.fillRect(x, y, 1, 1 + (hash32(x, salt + 1) % 3));
    }
}

/** Humps of snow along the yard, either side of the steps. */
function drifts(ctx: CanvasRenderingContext2D, yard: number, snow: string, dim: string): void {
    for (let i = 0; i < 9; i++) {
        const x = (hash32(i, 91) % (PW - 20));
        if (x > 70 && x < 250) continue;
        const w = 10 + (hash32(i, 93) % 14);
        const y = yard + 4 + (hash32(i, 95) % 10);
        ctx.fillStyle = dim;
        ctx.fillRect(x + 1, y + 2, w - 2, 1);
        ctx.fillStyle = snow;
        ctx.fillRect(x + 2, y - 1, w - 4, 1);
        ctx.fillRect(x, y, w, 2);
    }
}

function drawSideFence(ctx: CanvasRenderingContext2D, y: number, color: string, snow: string): void {
    const runs: readonly [number, number][] = [[0, 76], [244, PW]];
    for (const [x0, x1] of runs) {
        ctx.fillStyle = color;
        ctx.fillRect(x0, y, x1 - x0, 2);
        ctx.fillRect(x0, y + 4, x1 - x0, 1);
        for (let x = x0 + 2; x < x1; x += 10) ctx.fillRect(x, y - 3, 2, 10);
        ctx.fillStyle = snow;
        ctx.fillRect(x0, y - 1, x1 - x0, 1);
        for (let x = x0 + 2; x < x1; x += 10) ctx.fillRect(x, y - 4, 2, 1);
    }
}

function bricks(ctx: CanvasRenderingContext2D, box: Win, color: string, shift: number): void {
    ctx.fillStyle = color;
    for (let y = box.y + 6 + shift; y < box.y + box.h - 2; y += 8) ctx.fillRect(box.x + 1, y, box.w - 2, 1);
}

function build(): House {
    const windows: Win[] = [];
    const groups: House['groups'] = {bass: [], mid: [], lead: [], tower: []};
    const push = (group: number[], win: Win) => {
        group.push(windows.length);
        windows.push(win);
    };

    const main: Win = {x: 104, y: 78, w: 128, h: 78};
    const tower: Win = {x: 76, y: 50, w: 30, h: 106};
    const door: Win = {x: 156, y: 122, w: 20, h: 34};
    const porch: Win = {x: 96, y: 118, w: 148, h: 4};

    push(groups.bass, {x: 114, y: 130, w: 14, h: 16});
    push(groups.bass, {x: 134, y: 130, w: 14, h: 16});
    push(groups.bass, {x: 188, y: 130, w: 14, h: 16});
    push(groups.bass, {x: 208, y: 130, w: 14, h: 16});

    for (const x of [112, 136, 160, 184, 208]) push(groups.mid, {x, y: 96, w: 14, h: 16});
    for (const x of [118, 146, 186, 208]) push(groups.lead, {x, y: 80, w: 14, h: 14});
    push(groups.lead, {x: 150, y: 58, w: 12, h: 12});
    push(groups.lead, {x: 176, y: 58, w: 12, h: 12});

    for (const y of [134, 110, 86, 62]) push(groups.tower, {x: 85, y, w: 12, h: 14});

    // Lanterns line the steps where the pumpkins were.
    const cx = door.x + door.w / 2;
    const lanterns: {x: number; y: number}[] = [];
    for (let i = 0; i < 5; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const stepW = door.w + 16 + i * 16;
        lanterns.push({
            x: Math.round(cx + side * (stepW / 2 - 4) - BAG_DARK.w / 2),
            y: YARD + i * 3 - BAG_DARK.h,
        });
    }

    return {
        windows,
        groups,
        door,
        chimney: {x: 198, y: 40, w: 12, h: 28},
        vane: {x: 91, y: 30},
        lanterns,
        snowman: {x: 232, y: YARD + 12},
        yard: YARD,
        horizon: HORIZON,
        main,
        tower,
        porch,
        posts: [100, 150, 182, 236],
        gable: [96, 78, 168, 46, 240, 78],
        spire: [70, 50, 91, 28, 112, 50],
    };
}
