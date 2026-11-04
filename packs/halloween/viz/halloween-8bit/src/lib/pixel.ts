/**
 * The Halloween ink: solids and dither patterns baked from the theme for the
 * sdk's 320×180 pixel screen.
 */

import type {Theme} from '@cycletron/viz-sdk';
import {mixRgb, rgbOf} from '@cycletron/viz-sdk';
import {checker} from '@naderlabs/pixel-kit/night';
import {css, greenest} from '@naderlabs/pixel-kit/color';

type Rgb = [number, number, number];

export interface Ink {
    bg: string;
    skyDeep: string;
    sky: string;
    hill: string;
    hillDark: string;
    dirt: string;
    stone: string;
    stoneDark: string;
    /** Cooler than bone, so graves don't match the skeletons. */
    tomb: string;
    tombShade: string;
    bone: string;
    moon: string;
    moonDim: string;
    accent: string;
    accentDark: string;
    purple: string;
    red: string;
    roof: string;
    roofAlt: string;
    ghost: string;
    green: string;
    stem: string;
    line: string;
    sil: string;
    wall: string;
    wallDark: string;
    pool: readonly Rgb[];
}

export interface Pix {
    ink: Ink;
    skyDither: CanvasPattern;
    hillDither: CanvasPattern;
    waterDither: CanvasPattern;
}

export function bakePix(t: Theme): Pix {
    const bg = t.bgRgb;
    const pool = t.accentPool;
    const neon = pool[0] ?? rgbOf(t.neon, [255, 122, 26]);
    const secondary = pool[1] ?? rgbOf(t.neonSecondary, [138, 60, 255]);
    const violet = rgbOf(t.violet, secondary);
    const active = rgbOf(t.active, [255, 243, 176]);
    const red = rgbOf(t.red, [255, 46, 77]);
    const text = t.textRgb;
    const green = greenest(pool, neon);
    const white: Rgb = [255, 255, 255];
    const black: Rgb = [0, 0, 0];
    const ink: Ink = {
        bg: t.bg,
        skyDeep: css(bg),
        sky: css(mixRgb(bg, violet, 0.62)),
        hill: css(mixRgb(bg, green, 0.62)),
        hillDark: css(mixRgb(bg, green, 0.36)),
        dirt: css(mixRgb(bg, mixRgb(red, green, 0.45), 0.4)),
        stone: css(mixRgb(bg, active, 0.78)),
        stoneDark: css(mixRgb(bg, active, 0.42)),
        tomb: css(mixRgb(bg, khaki(text, green), 0.52)),
        tombShade: css(mixRgb(bg, khaki(text, green), 0.3)),
        bone: css(mixRgb(text, white, 0.82)),
        moon: css(active),
        moonDim: css(mixRgb(active, violet, 0.4)),
        accent: css(neon),
        accentDark: css(mixRgb(neon, bg, 0.45)),
        purple: css(secondary),
        red: css(red),
        roof: css(mixRgb(red, bg, 0.66)),
        roofAlt: css(mixRgb(red, bg, 0.3)),
        ghost: css(mixRgb(text, white, 0.82)),
        green: css(green),
        stem: css(mixRgb(green, bg, 0.38)),
        line: css(mixRgb(bg, black, 0.7)),
        sil: css(mixRgb(bg, black, 0.45)),
        wall: css(mixRgb(bg, mixRgb(text, bg, 0.7), 0.5)),
        wallDark: css(mixRgb(bg, secondary, 0.48)),
        pool,
    };
    return {
        ink,
        skyDither: checker(ink.skyDeep, ink.sky),
        hillDither: checker(ink.hillDark, ink.hill),
        waterDither: checker(css(mixRgb(bg, secondary, 0.22)), css(mixRgb(bg, secondary, 0.48))),
    };
}

/** Grey, pulled a little toward green so it stays cooler than near-white bone. */
function khaki(text: Rgb, green: Rgb): Rgb {
    const lum = Math.round((text[0] + text[1] + text[2]) / 3);
    return mixRgb([lum, lum, lum], green, 0.28);
}
