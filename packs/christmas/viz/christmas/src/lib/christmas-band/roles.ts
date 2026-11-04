/**
 * What a hap is to the band. Drum voices split finer than `instrumentFamily`
 * (toms and crashes get their own cue); pitched notes are classed by register.
 */

export type Role = 'kick' | 'snare' | 'tom' | 'crash' | 'hat' | 'perc' | 'bass' | 'mid' | 'lead';

/** A note this long or longer holds the pose. */
export const LONG_NOTE = 0.75;

export function roleOf(name: string, note: number): Role {
    if (Number.isFinite(note)) return note < 48 ? 'bass' : note < 72 ? 'mid' : 'lead';
    return drumRole(voiceOf(name));
}

/** The voice of a bank-prefixed drum: `RolandTR606_bd` is `bd`; a `:n` suffix is dropped. */
export function voiceOf(name: string): string {
    const lower = name.toLowerCase();
    const colon = lower.indexOf(':');
    const base = colon >= 0 ? lower.slice(0, colon) : lower;
    const cut = base.lastIndexOf('_');
    return cut >= 0 ? base.slice(cut + 1) : base;
}

function drumRole(n: string): Role {
    if (/^(bd|kick|808)/.test(n)) return 'kick';
    if (/^(sd|sn|cp|clap|rim)/.test(n)) return 'snare';
    if (/^(cr|crash|ride|rd)/.test(n)) return 'crash';
    if (/^(lt|mt|ht|tom)/.test(n)) return 'tom';
    if (/^(hh|oh|hat|shaker|tb|tamb|cb|cow)/.test(n)) return 'hat';
    return 'perc';
}

export function isLong(begin: number, end: number): boolean {
    return end - begin >= LONG_NOTE;
}

/** Where a pitch sits inside its register, 0..1. */
export function registerPos(note: number): number {
    const lo = note < 48 ? 24 : note < 72 ? 48 : 72;
    const hi = note < 48 ? 48 : note < 72 ? 72 : 96;
    const t = (note - lo) / (hi - lo);
    return t < 0 ? 0 : t > 1 ? 1 : t;
}
