/**
 * The harvest colours, baked from the theme in `layout()`: the sky and ground
 * from the background, the foliage from the accents.
 */

import {Color} from 'three';
import {setRgb} from '@naderlabs/kit/gl';
import type {Theme} from '@cycletron/viz-sdk';

export interface Harvest {
    /** Dusk sky: the background lifted toward violet. */
    sky: Color;
    /** Low sun and moonlight. */
    sun: Color;
    ground: Color;
    soil: Color;
    bark: Color;
    straw: Color;
    /** Autumn leaves, warmest first: orange, cranberry, gold, rust, olive. */
    leaves: Color[];
    pumpkin: Color;
    cream: Color;
    violet: Color;
}

export function bakeHarvest(t: Theme): Harvest {
    const pool = t.accentPool.map((rgb) => setRgb(new Color(), rgb));
    const at = (i: number) => pool[i % pool.length];
    const bg = new Color(t.bg);
    const violet = new Color(t.violet);
    const bark = at(7).clone();
    return {
        sky: bg.clone().lerp(violet, 0.55),
        sun: new Color(t.active).lerp(new Color(t.neon), 0.35),
        ground: bark.clone().lerp(bg, 0.45),
        soil: bark.clone().lerp(bg, 0.7),
        bark,
        straw: at(2).clone().lerp(at(3), 0.3),
        leaves: [new Color(t.neon), new Color(t.neonSecondary), at(2), new Color(t.red), at(5)],
        pumpkin: new Color(t.neon),
        cream: new Color(t.active),
        violet,
    };
}
