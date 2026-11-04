/**
 * The MORALE FEED strip's figures: cast names for LAST, the audience count,
 * and the morale word, which reads the alert level upside down.
 */

import {hash32, rand01} from '@cycletron/viz-sdk';
import type {Cast} from './cast.js';

const CAST_NAME: Record<Cast, string> = {
    santa: 'SANTA',
    elf: 'ELF',
    guitarist: 'GUITAR ELF',
    mrsclaus: 'MRS CLAUS',
    snowman: 'SNOWMAN',
    yeti: 'YETI',
    gingerbread: 'GINGERBREAD',
    penguin: 'PENGUIN',
    reindeer: 'REINDEER',
    nutcracker: 'NUTCRACKER',
    carollers: 'CAROLLERS',
};

export function castName(cast: Cast): string {
    return CAST_NAME[cast];
}

/** The seats filled by bar `bar`. Grows every bar by more than the hash can take back, so it never drops. */
export function audienceAt(bar: number): number {
    return 1200 + bar * 140 + Math.floor(rand01(hash32(bar, 3)) * 90);
}

export function moraleTag(level: number): string {
    return level >= 5 ? 'HIGH' : level === 4 ? 'STEADY' : level === 3 ? 'STRAINED' : 'CRITICAL';
}
