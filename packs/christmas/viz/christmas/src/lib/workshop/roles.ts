/**
 * What a hap is to the workshop. Drum names are classed first (a `perc:B5`
 * carries a note but is still a drum), then pitched notes by register.
 */

export type Role = 'kick' | 'snare' | 'tom' | 'crash' | 'hat' | 'perc' | 'bass' | 'mid' | 'lead';

/** A note this long or longer gets a ribbon. */
export const LONG_NOTE = 0.75;

export function workshopRole(name: string, note: number): Role {
    const drum = drumRole(name);
    if (drum) return drum;
    if (Number.isFinite(note)) return note < 48 ? 'bass' : note < 72 ? 'mid' : 'lead';
    return 'perc';
}

/** The drum a sound name is, or null for a pitched instrument. */
export function drumRole(name: string): Role | null {
    const lower = name.toLowerCase();
    // A machine voice spelled out, `RolandTR606_bd`, is classed by its voice.
    const voice = lower.indexOf('_');
    return voiceRole(voice > 0 ? lower.slice(voice + 1) : lower);
}

function voiceRole(n: string): Role | null {
    if (/^(bd|kick|808)/.test(n)) return 'kick';
    if (/^(sd|sn|cp|clap|rim)/.test(n)) return 'snare';
    if (/^(cr|crash|ride|rd)/.test(n)) return 'crash';
    if (/^(lt|mt|ht|tom)/.test(n)) return 'tom';
    if (/^(hh|oh|hat|shaker|tb|tamb|cb|cow|sleigh|triangles)/.test(n)) return 'hat';
    if (/^(perc)/.test(n)) return 'perc';
    return null;
}

export function isLong(begin: number, end: number): boolean {
    return end - begin >= LONG_NOTE;
}
