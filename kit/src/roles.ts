/**
 * What a hap is to a scene. Drum voices split finer than `instrumentFamily`
 * (toms and crashes get their own cue); pitched notes are classed by
 * register. Each pack names its own classifier on top of these, since which
 * sound names count as which drum is part of a pack's look.
 */

export type Role = 'kick' | 'snare' | 'tom' | 'crash' | 'hat' | 'perc' | 'bass' | 'mid' | 'lead';

/** A note this long or longer is held: a pose, a ghost, a ribbon, chimney smoke. */
export const LONG_NOTE = 0.75;

export function isLong(begin: number, end: number): boolean {
    return end - begin >= LONG_NOTE;
}

/** A drum voice (`bd`, `sd`, `hh`…) as a role; anything unknown is `perc`. */
export function drumRole(n: string): Role {
    if (/^(bd|kick|808)/.test(n)) return 'kick';
    if (/^(sd|sn|cp|clap|rim)/.test(n)) return 'snare';
    if (/^(cr|crash|ride|rd)/.test(n)) return 'crash';
    if (/^(lt|mt|ht|tom)/.test(n)) return 'tom';
    if (/^(hh|oh|hat|shaker|tb|tamb|cb|cow)/.test(n)) return 'hat';
    return 'perc';
}

/** Where a pitch sits inside its register, 0..1. */
export function registerPos(note: number): number {
    const lo = note < 48 ? 24 : note < 72 ? 48 : 72;
    const hi = note < 48 ? 48 : note < 72 ? 72 : 96;
    const t = (note - lo) / (hi - lo);
    return t < 0 ? 0 : t > 1 ? 1 : t;
}
