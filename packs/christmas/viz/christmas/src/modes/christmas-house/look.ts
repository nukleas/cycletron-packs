/**
 * The house's colours: the pack's Christmas ink, plus the night sky, the moon
 * and two dither patterns, all baked from the theme in layout().
 */

import type {Theme} from '@cycletron/viz-sdk';
import {mixRgb, rgbOf} from '@cycletron/viz-sdk';
import {bakeInk, type Ink} from '../../lib/ink.js';
import {checker} from '@naderlabs/pixel-kit/night';
import {css} from '@naderlabs/pixel-kit/color';

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
