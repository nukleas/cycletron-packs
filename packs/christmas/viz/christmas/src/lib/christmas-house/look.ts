/**
 * The house's colours: the pack's Christmas ink, plus the night sky, the moon
 * and two dither patterns, all baked from the theme in layout().
 */

import type {Theme} from '@cycletron/viz-sdk';
import {mixRgb, rgbOf} from '@cycletron/viz-sdk';
import {bakeInk, type Ink} from '../christmas-band/ink.js';

export interface Look {
    ink: Ink;
    skyDeep: string;
    sky: string;
    moon: string;
    moonDim: string;
    skyDither: CanvasPattern;
    snowDither: CanvasPattern;
    /** A soft glow over the sky for a snare's firework. */
    glowDither: CanvasPattern;
}

export function bakeLook(t: Theme): Look {
    const ink = bakeInk(t);
    const bg = t.bgRgb;
    const violet = rgbOf(t.violet, rgbOf(t.neonSecondary, [61, 220, 132]));
    const active = rgbOf(t.active, [255, 209, 102]);
    const white: [number, number, number] = [255, 255, 255];
    const moonRgb = mixRgb(mixRgb(t.textRgb, white, 0.8), active, 0.3);
    const skyDeep = css(bg);
    const sky = css(mixRgb(bg, violet, 0.62));
    const moonDim = css(mixRgb(moonRgb, violet, 0.4));
    return {
        ink,
        skyDeep,
        sky,
        moon: css(moonRgb),
        moonDim,
        skyDither: checker(skyDeep, sky),
        snowDither: checker(ink.snowDim, ink.snow),
        glowDither: checker(sky, moonDim),
    };
}

/** A 2×2 checkerboard of two colours. */
function checker(a: string, b: string): CanvasPattern {
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

function css(rgb: readonly [number, number, number]): string {
    return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}
