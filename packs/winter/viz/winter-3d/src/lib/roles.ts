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
