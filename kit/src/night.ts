/**
 * A 320×180 night sky's furniture: twinkling stars, drifting dithered
 * clouds, a stepped ridge on the horizon and the moon. The pack picks the
 * colours and draws the moon where it likes.
 */

import {hash32, PW, spr, type Sprite} from '@cycletron/viz-sdk';

export const MOON: Sprite = spr(`
    ......1111......
    .....111111.....
    ....11111111....
    ...1111111111...
    ..111111111111..
    ..112211112211..
    .11122111122111.
    .11111111111111.
    .11111111111111.
    ..111222222111..
    ..111211112111..
    ..111111111111..
    ...1111111111...
    ....11111111....
    .....111111.....
    ......1111......
`);

export function drawStars(ctx: CanvasRenderingContext2D, horizon: number, cycle: number, color: string): void {
    const epoch = Math.floor(cycle / 8);
    const tick = Math.floor(cycle * 2);
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 42; i++) {
        if ((hash32(i * 7 + 3, tick) & 3) === 0) continue;
        const x = hash32(i * 7 + 1, epoch) % PW;
        const y = hash32(i * 7 + 2, epoch) % horizon;
        ctx.rect(x, y, 1, 1);
        if ((hash32(i * 7 + 4, epoch) & 7) === 0) {
            ctx.rect(x - 1, y, 1, 1);
            ctx.rect(x + 1, y, 1, 1);
            ctx.rect(x, y - 1, 1, 1);
            ctx.rect(x, y + 1, 1, 1);
        }
    }
    ctx.fill();
}

export function drawClouds(ctx: CanvasRenderingContext2D, cycle: number, pattern: CanvasPattern): void {
    const span = PW + 48;
    const scroll = Math.floor(cycle * 6) % span;
    ctx.fillStyle = pattern;
    const blobs = [
        [12, 16, 28, 5],
        [84, 26, 18, 4],
        [156, 14, 34, 6],
        [236, 24, 22, 4],
        [308, 18, 24, 5],
    ];
    for (const [x, y, w, h] of blobs) {
        let px = x - scroll;
        if (px < -w) px += span;
        ctx.fillRect(px, y, w, h);
        if (w > 10) ctx.fillRect(px + 3, y - 2, w - 8, 3);
    }
}

/** Stepped hills on a horizon. Sizes come from the index, not from a clock. */
export function drawRidge(ctx: CanvasRenderingContext2D, base: number, color: string): void {
    ctx.fillStyle = color;
    for (let i = 0; i < 8; i++) {
        const w = 28 + (hash32(i, 4) % 14);
        const h = 8 + (hash32(i, 9) % 10);
        const x = i * 42 - 12;
        ctx.fillRect(x, base - (h >> 1), w, h >> 1);
        ctx.fillRect(x + 4, base - h, w - 8, h);
        ctx.fillRect(x + 10, base - h - 5, Math.max(6, w - 20), 6);
    }
}

/** A 2×2 checkerboard of two colours, the dither for clouds and glows. */
export function checker(a: string, b: string): CanvasPattern {
    const c = document.createElement('canvas');
    c.width = 2;
    c.height = 2;
    const g = c.getContext('2d');
    if (!g) throw new Error('2d');
    g.fillStyle = a;
    g.fillRect(0, 0, 2, 2);
    g.fillStyle = b;
    g.fillRect(0, 0, 1, 1);
    g.fillRect(1, 1, 1, 1);
    const pattern = g.createPattern(c, 'repeat');
    if (!pattern) throw new Error('pattern');
    return pattern;
}
