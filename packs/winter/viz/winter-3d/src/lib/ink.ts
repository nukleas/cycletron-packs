/**
 * The theme as three.js colours. Every mode keeps one `Ink` and bakes it in
 * `layout()`; materials hold references to these colours or copy them there.
 * Theme triples are sRGB, so they go through `SRGBColorSpace` like a CSS
 * string would.
 */

import {Color} from 'three';
import {setRgb} from '@naderlabs/kit/gl';
import type {Rgb, Theme} from '@cycletron/viz-sdk';

const WHITE: Rgb = [255, 255, 255];
const scratch = new Color();

export class Ink {
    readonly bg = new Color();
    /** The ice: `neon`. */
    readonly ice = new Color();
    /** Aurora violet, cold light: `secondary`. */
    readonly glow = new Color();
    /** Aurora green: the first `more`. */
    readonly aurora = new Color();
    /** Snow: `active`, washed toward white. */
    readonly snow = new Color();
    /** Deep ice, needles, shadows: `violet`. */
    readonly deep = new Color();
    readonly rose = new Color();
    /** Frost blue: the second `more`. */
    readonly frost = new Color();
    /** Lamplight: the third `more`. */
    readonly warm = new Color();
    /** The accent pool, for tracks and crowds. */
    readonly pool: Color[] = [];

    bake(theme: Theme): void {
        const p = theme.accentPool;
        const at = (i: number): Rgb => p[i % p.length];
        setRgb(this.bg, theme.bgRgb);
        setRgb(this.ice, at(0));
        setRgb(this.glow, at(1));
        setRgb(this.aurora, at(2));
        setRgb(this.snow, at(3)).lerp(setRgb(scratch, WHITE), 0.55);
        setRgb(this.deep, at(4));
        setRgb(this.frost, at(5));
        setRgb(this.rose, at(6));
        setRgb(this.warm, at(7));
        this.pool.length = 0;
        for (const rgb of p) this.pool.push(setRgb(new Color(), rgb));
    }
}
