/**
 * Night sky, fireworks, smoke and falling snow. Bursts are spawned in
 * update() with the cycle they went up at; drawing one is a pure read of
 * its age in bars, so a chunk render lands on the same frame.
 */

import {hash32, PH, PW, rand01, TAU} from '@cycletron/viz-sdk';
import {drawSprite} from '@cycletron/viz-sdk';
import {type Look} from './look.js';
import {MOON} from './sprites.js';

export interface Burst {
    /** Cycle it went up at; its age is the cycle less this. */
    at: number;
    /** Length in bars. */
    life: number;
    x: number;
    /** Where it bursts. */
    y: number;
    seed: number;
    rgb: readonly [number, number, number];
    /** 1 for a snare, 2 rings for a crash. */
    rings: number;
}

/** The share of a burst's life spent rising. */
const RISE = 0.2;
const LAUNCH_Y = 80;

/** A firework at x over the house: snares a small one, crashes a big one. */
export function makeBurst(seed: number, x: number, at: number, rgb: readonly [number, number, number], rings: number): Burst {
    const y = 14 + Math.round(rand01(hash32(seed, 5)) * (rings > 1 ? 18 : 28));
    return {at, life: rings > 1 ? 0.5 : 0.25, x, y, seed, rgb, rings};
}

/** 0..1 through its life. */
export function burstAge(b: Burst, cycle: number): number {
    return (cycle - b.at) / b.life;
}

export function dropBursts(bursts: Burst[], cycle: number): void {
    for (let i = bursts.length - 1; i >= 0; i--) {
        const t = burstAge(bursts[i], cycle);
        if (t >= 1 || t < 0) bursts.splice(i, 1);
    }
}

/**
 * How hot the sky is: 2 while a crash's burst is fresh (the whole sky
 * flashes), 1 while a snare's is (a soft glow), else 0.
 */
export function skyFlash(bursts: readonly Burst[], cycle: number): number {
    let f = 0;
    for (const b of bursts) {
        const t = burstAge(b, cycle);
        if (t < RISE || t > RISE + 0.08) continue;
        f = Math.max(f, b.rings > 1 ? 2 : 1);
    }
    return f;
}

/** A rising streak, then 8–12 dots that spread and fall; a crash adds an inner gold ring. */
export function drawBurst(ctx: CanvasRenderingContext2D, b: Burst, cycle: number, color: string, gold: string, trail: string): void {
    const t = burstAge(b, cycle);
    if (t < 0 || t >= 1) return;
    if (t < RISE) {
        const k = t / RISE;
        const y = Math.round(LAUNCH_Y + (b.y - LAUNCH_Y) * k);
        ctx.fillStyle = trail;
        ctx.fillRect(b.x, y, 1, 3);
        return;
    }
    const k = (t - RISE) / (1 - RISE);
    const n = 8 + (hash32(b.seed, 1) % 5);
    const big = b.rings > 1;
    const reach = (big ? 30 : 18) * Math.sqrt(k);
    const fall = 10 * k * k;
    const size = k < 0.5 ? 2 : 1;
    for (let ring = 0; ring < b.rings; ring++) {
        const r = reach * (ring === 0 ? 1 : 0.55);
        ctx.fillStyle = ring === 0 ? color : gold;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + rand01(hash32(b.seed, 10 + i)) * 0.4 + ring * 0.3;
            const x = Math.round(b.x + Math.cos(a) * r);
            const y = Math.round(b.y + Math.sin(a) * r * 0.85 + fall);
            ctx.rect(x, y, size, size);
        }
        ctx.fill();
    }
}

/** Sky, scrolling dither clouds and the moon. `flash` 2 whites the sky, 1 glows it. */
export function drawNight(ctx: CanvasRenderingContext2D, look: Look, cycle: number, flash: number, moonX: number, moonY: number): void {
    const hot = flash > 1;
    ctx.fillStyle = hot ? look.moon : look.skyDeep;
    ctx.fillRect(0, 0, PW, 44);
    ctx.fillStyle = hot ? look.moonDim : look.sky;
    ctx.fillRect(0, 44, PW, PH - 44);
    if (!hot) {
        ctx.fillStyle = flash > 0 ? look.glowDither : look.skyDither;
        ctx.fillRect(0, 32, PW, 18);
        drawStars(ctx, 80, cycle, look.moon);
        drawClouds(ctx, cycle, look.skyDither);
    }
    // The Halloween moon's face (colour 2) is painted over in the moon's own colour.
    const moon = hot ? look.ink.snow : look.moon;
    drawSprite(ctx, MOON, moonX, moonY, [null, moon, moon]);
}

function drawStars(ctx: CanvasRenderingContext2D, horizon: number, cycle: number, color: string): void {
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

function drawClouds(ctx: CanvasRenderingContext2D, cycle: number, pattern: CanvasPattern): void {
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

/** A puff of chimney smoke, `r` 1..2: a 3–5 px disc. */
export function drawPuff(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
    const X = Math.round(x), Y = Math.round(y);
    ctx.fillStyle = color;
    if (r < 2) {
        ctx.fillRect(X, Y - 1, 1, 3);
        ctx.fillRect(X - 1, Y, 3, 1);
        return;
    }
    ctx.fillRect(X - 1, Y - 2, 3, 5);
    ctx.fillRect(X - 2, Y - 1, 5, 3);
}

const FLAKES: readonly {n: number; size: number; speed: number; salt: number}[] = [
    {n: 46, size: 1, speed: 14, salt: 301},
    {n: 26, size: 1, speed: 24, salt: 303},
    {n: 12, size: 2, speed: 38, salt: 307},
];

/** Three layers of falling snow in front of everything, one rect batch each. */
export function drawSnowfall(ctx: CanvasRenderingContext2D, cycle: number, near: string, far: string): void {
    for (let l = 0; l < FLAKES.length; l++) {
        const {n, size, speed, salt} = FLAKES[l];
        ctx.fillStyle = l === 0 ? far : near;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            const h = hash32(i, salt);
            const phase = rand01(hash32(h, 1)) * PH;
            const y = (phase + cycle * speed) % PH;
            const sway = Math.sin(cycle * 1.3 + i) * 2;
            const x = ((rand01(h) * PW + sway) % PW + PW) % PW;
            ctx.rect(Math.round(x), Math.round(y), size, size);
        }
        ctx.fill();
    }
}
