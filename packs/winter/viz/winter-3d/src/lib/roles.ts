import {drumRole, type Role} from '@naderlabs/kit/roles';

export function winterRole(name: string, note: number): Role {
    if (Number.isFinite(note)) return note < 48 ? 'bass' : note < 72 ? 'mid' : 'lead';
    return drumRole(voiceOf(name));
}

/** The voice of a bank-prefixed drum: `RolandTR808_bd` is `bd`; a `:n` suffix is dropped. */
function voiceOf(name: string): string {
    const lower = name.toLowerCase();
    const colon = lower.indexOf(':');
    const base = colon >= 0 ? lower.slice(0, colon) : lower;
    const cut = base.lastIndexOf('_');
    return cut >= 0 ? base.slice(cut + 1) : base;
}

interface Played {
    role: Role;
}

/** The yeti's stomp. */
export const isKick = (h: Played): boolean => h.role === 'kick';
/** The penguin's drum hand: snares and toms. */
export const isSnare = (h: Played): boolean => h.role === 'snare' || h.role === 'tom';
/** The penguin's other hand: the metal and the rest of the kit. */
export const isChime = (h: Played): boolean => h.role === 'hat' || h.role === 'crash' || h.role === 'perc';
