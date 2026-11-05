/**
 * Theme colours as three.js colours. Theme triples are sRGB bytes; three
 * works in linear space, so they convert on the way in.
 */

import {Color} from 'three';
import {setRgb} from '@naderlabs/kit/gl';
import type {Theme} from '@cycletron/viz-sdk';

/** The theme's named colours plus its accent pool, baked once per layout. */
export class Ink {
    readonly bg = new Color();
    readonly neon = new Color();
    readonly second = new Color();
    readonly active = new Color();
    readonly violet = new Color();
    readonly red = new Color();
    readonly pool: Color[] = [];

    bake(theme: Theme): void {
        this.bg.set(theme.bg);
        this.neon.set(theme.neon);
        this.second.set(theme.neonSecondary);
        this.active.set(theme.active);
        this.violet.set(theme.violet);
        this.red.set(theme.red);
        this.pool.length = 0;
        for (const rgb of theme.accentPool) this.pool.push(setRgb(new Color(), rgb));
    }

    /** An accent by index, wrapping. */
    accent(n: number): Color {
        return this.pool.length > 0 ? this.pool[((n % this.pool.length) + this.pool.length) % this.pool.length] : this.neon;
    }
}
