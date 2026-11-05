import {drumRole, type Role} from '@naderlabs/kit/roles';

/** A hap's role: pitched notes by register, drums by voice. */
export function harvestRole(name: string, note: number): Role {
    if (Number.isFinite(note)) return note < 48 ? 'bass' : note < 72 ? 'mid' : 'lead';
    const lower = name.toLowerCase();
    // A machine voice spelled out, `RolandTR909_sd`, is classed by its voice.
    const voice = lower.indexOf('_');
    return voice > 0 ? drumRole(lower.slice(voice + 1)) : drumRole(lower);
}
