import {drumRole, type Role} from '@naderlabs/kit/roles';

export function roleOf(name: string, note: number): Role {
    if (Number.isFinite(note)) return note < 48 ? 'bass' : note < 72 ? 'mid' : 'lead';
    return drumRole(voiceOf(name));
}

/** The voice of a bank-prefixed drum: `RolandTR909_bd` is `bd`; a `:n` suffix is dropped. */
function voiceOf(name: string): string {
    const lower = name.toLowerCase();
    const colon = lower.indexOf(':');
    const base = colon >= 0 ? lower.slice(0, colon) : lower;
    const cut = base.lastIndexOf('_');
    return cut >= 0 ? base.slice(cut + 1) : base;
}

/** Where a pitch sits across the whole playable range, 0..1. */
export function pitchPos(note: number): number {
    const t = (note - 30) / 66;
    return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Seconds per cycle at `bpm` (a cycle is a bar of four beats). */
export function secondsPerCycle(bpm: number): number {
    return bpm > 0 ? 240 / bpm : 2;
}
