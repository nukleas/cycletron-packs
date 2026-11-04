/** Colour helpers for packs that bake their palette into solid CSS colours. */

import type {Rgb} from '@cycletron/viz-sdk';

export function css(rgb: Readonly<Rgb>): string {
    return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

/** The pool's greenest colour, or `fallback` when the pool is empty. */
export function greenest(pool: readonly Rgb[], fallback: Rgb): Rgb {
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
