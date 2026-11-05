import {type Role} from '@naderlabs/kit/roles';

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
