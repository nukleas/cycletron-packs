/**
 * The factory ink: every face baked from the theme in three shades, so norad,
 * evergreen, amber and blood all read as the same lit floor.
 */

import type {Theme} from '@cycletron/viz-sdk';
import {alphaRamp, mixRgb, rgbOf} from '@cycletron/viz-sdk';
import type {Shade} from './iso.js';

type Rgb = [number, number, number];

export interface Ink {
    bg: string;
    line: string;
    floor: string;
    grid: string;
    apron: string;
    wall: Shade;
    plank: string;
    wood: Shade;
    metal: Shade;
    metalDark: Shade;
    belt: Shade;
    slat: string;
    lamp: string;
    lampDim: string;
    /** Lamp light as an alpha ramp, for pools and the press flash. */
    glow: string[];
    night: string;
    snow: string;
    snowShade: Shade;
    sign: string;
    signText: string;
    skin: Shade;
    tunic: Shade;
    red: Shade;
    gold: Shade;
    fork: Shade;
    hazard: string;
    spark: string;
    /** Pool entries bright enough to paint a toy with, and their shades. */
    pool: readonly Rgb[];
    poolShade: readonly Shade[];
    /** The pool dulled halfway to the belt grey: blanks before the press. */
    blankShade: readonly Shade[];
}

export function bakeInk(t: Theme): Ink {
    const bg = t.bgRgb;
    const text = t.textRgb;
    const black: Rgb = [0, 0, 0];
    const white: Rgb = [255, 255, 255];
    const neon = t.accentPool[0] ?? rgbOf(t.neon, [230, 57, 70]);
    const active = rgbOf(t.active, [255, 209, 102]);
    const red = rgbOf(t.red, neon);
    const secondary = rgbOf(t.neonSecondary, [61, 220, 132]);
    const lit = t.accentPool.filter((c) => lum(c) > 70);
    const pool = lit.length ? lit : t.accentPool;
    const grey = greyOf(text);
    const timber = mixRgb(red, active, 0.55);
    const beltGrey = mixRgb(bg, grey, 0.28);
    return {
        bg: t.bg,
        line: css(mixRgb(bg, black, 0.7)),
        floor: css(mixRgb(bg, text, 0.15)),
        grid: css(mixRgb(bg, text, 0.26)),
        apron: css(mixRgb(bg, text, 0.09)),
        wall: shade(mixRgb(bg, text, 0.2)),
        plank: css(mixRgb(bg, text, 0.12)),
        wood: shade(mixRgb(bg, timber, 0.6)),
        metal: shade(mixRgb(bg, grey, 0.6)),
        metalDark: shade(mixRgb(bg, grey, 0.35)),
        belt: shade(beltGrey),
        slat: css(mixRgb(bg, grey, 0.45)),
        lamp: css(active),
        lampDim: css(mixRgb(active, bg, 0.65)),
        glow: alphaRamp(active),
        night: css(mixRgb(bg, secondary, 0.16)),
        snow: css(mixRgb(text, white, 0.8)),
        snowShade: shade(mixRgb(text, white, 0.8)),
        sign: css(mixRgb(bg, red, 0.5)),
        signText: css(active),
        skin: shade(mixRgb(active, white, 0.45)),
        tunic: shade(greenest(t.accentPool, secondary)),
        red: shade(red),
        gold: shade(active),
        fork: shade(secondary),
        hazard: css(secondary),
        spark: css(mixRgb(active, white, 0.6)),
        pool,
        poolShade: pool.map(shade),
        blankShade: pool.map((c) => shade(mixRgb(c, beltGrey, 0.5))),
    };
}

/** The pool index nearest `rgb`, cached by colour. */
export function nearestIndex(rgb: readonly [number, number, number], pool: readonly Rgb[], cache: Map<number, number>): number {
    const key = ((rgb[0] & 255) << 16) | ((rgb[1] & 255) << 8) | (rgb[2] & 255);
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    let best = 0, dist = Infinity;
    for (let n = 0; n < pool.length; n++) {
        const c = pool[n];
        const d = (c[0] - rgb[0]) ** 2 + (c[1] - rgb[1]) ** 2 + (c[2] - rgb[2]) ** 2;
        if (d < dist) {
            dist = d;
            best = n;
        }
    }
    cache.set(key, best);
    return best;
}

function shade(rgb: Rgb): Shade {
    return {
        top: css(mixRgb(rgb, [255, 255, 255], 0.12)),
        left: css(mixRgb(rgb, [0, 0, 0], 0.25)),
        right: css(mixRgb(rgb, [0, 0, 0], 0.5)),
    };
}

/** The text colour's grey, for metal that stays metal in every palette. */
function greyOf(c: Rgb): Rgb {
    const l = Math.round(lum(c));
    return [l, l, l];
}

function lum(c: Rgb): number {
    return (c[0] * 3 + c[1] * 6 + c[2]) / 10;
}

function greenest(pool: readonly Rgb[], fallback: Rgb): Rgb {
    let best = fallback;
    let score = -1e9;
    for (const c of pool) {
        const s = c[1] - Math.max(c[0], c[2]);
        if (s > score) {
            score = s;
            best = c;
        }
    }
    return best;
}

function css(rgb: readonly [number, number, number]): string {
    return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}
