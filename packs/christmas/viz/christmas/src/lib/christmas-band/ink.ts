/**
 * The Christmas ink: solids baked from the theme for the sdk's 320×180 pixel
 * screen. Santa is the theme's red, the tree its greenest accent, snow its
 * text pulled to white, so every palette dresses the same stage.
 */

import type {Theme} from '@cycletron/viz-sdk';
import {mixRgb, rgbOf} from '@cycletron/viz-sdk';

type Rgb = [number, number, number];

export interface Ink {
    bg: string;
    /** Outline, near black. */
    line: string;
    /** Dark fill: boots, coal, hat bands. */
    sil: string;
    wall: string;
    wallDark: string;
    floor: string;
    floorLine: string;
    rug: string;
    rugAlt: string;
    snow: string;
    snowDim: string;
    skin: string;
    red: string;
    redDark: string;
    green: string;
    greenDark: string;
    gold: string;
    goldDark: string;
    brown: string;
    brownDark: string;
    ice: string;
    stone: string;
    stoneDark: string;
    flame: string;
    flameHot: string;
    ember: string;
    brick: string;
    brickDark: string;
    night: string;
    pool: readonly Rgb[];
}

export function bakeInk(t: Theme): Ink {
    const bg = t.bgRgb;
    const pool = t.accentPool;
    const neon = pool[0] ?? rgbOf(t.neon, [230, 57, 70]);
    const secondary = pool[1] ?? rgbOf(t.neonSecondary, [61, 220, 132]);
    const violet = rgbOf(t.violet, secondary);
    const active = rgbOf(t.active, [255, 209, 102]);
    const red = rgbOf(t.red, neon);
    const text = t.textRgb;
    const green = greenest(pool, secondary);
    const ice = coolest(pool, text);
    const white: Rgb = [255, 255, 255];
    const black: Rgb = [0, 0, 0];
    const lum = Math.round((text[0] + text[1] + text[2]) / 3);
    const grey: Rgb = [lum, lum, lum];
    const brown = mixRgb(mixRgb(red, active, 0.45), bg, 0.5);
    const snow = mixRgb(text, white, 0.85);
    return {
        bg: t.bg,
        line: css(mixRgb(bg, black, 0.7)),
        sil: css(mixRgb(bg, black, 0.4)),
        wall: css(mixRgb(bg, brown, 0.3)),
        wallDark: css(mixRgb(bg, brown, 0.18)),
        floor: css(mixRgb(bg, brown, 0.55)),
        floorLine: css(mixRgb(bg, brown, 0.36)),
        rug: css(mixRgb(bg, red, 0.5)),
        rugAlt: css(mixRgb(bg, red, 0.34)),
        snow: css(snow),
        snowDim: css(mixRgb(snow, bg, 0.3)),
        skin: css(mixRgb(mixRgb(active, white, 0.55), red, 0.12)),
        red: css(red),
        redDark: css(mixRgb(red, bg, 0.4)),
        green: css(green),
        greenDark: css(mixRgb(green, bg, 0.45)),
        gold: css(active),
        goldDark: css(mixRgb(active, bg, 0.4)),
        brown: css(brown),
        brownDark: css(mixRgb(brown, bg, 0.4)),
        ice: css(ice),
        stone: css(mixRgb(bg, grey, 0.55)),
        stoneDark: css(mixRgb(bg, grey, 0.32)),
        flame: css(mixRgb(red, active, 0.55)),
        flameHot: css(active),
        ember: css(red),
        brick: css(mixRgb(mixRgb(red, brown, 0.5), bg, 0.3)),
        brickDark: css(mixRgb(mixRgb(red, brown, 0.5), bg, 0.55)),
        night: css(mixRgb(bg, violet, 0.5)),
        pool,
    };
}

function css(rgb: readonly [number, number, number]): string {
    return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
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

/** The pool's bluest light colour, for ice and the window sky. */
function coolest(pool: readonly Rgb[], fallback: Rgb): Rgb {
    let best = fallback;
    let score = -1e9;
    for (const c of pool) {
        const s = c[2] - c[0] + (c[0] + c[1] + c[2]) / 6;
        if (s > score) {
            score = s;
            best = c;
        }
    }
    return best;
}
