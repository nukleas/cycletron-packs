/**
 * Who plays what. The cast comes from the sound name; bare oscillators wait
 * for a pitch. Drum voices are the token after the last `_`, so
 * `RolandTR606_bd` is Santa's kick.
 */

import {instrumentFamily} from '@cycletron/viz-sdk';
import {type KitPiece} from './kit.js';
import {roleOf, voiceOf} from './roles.js';

export type Cast =
    | 'santa'
    | 'reindeer'
    | 'snowman'
    | 'yeti'
    | 'mrsclaus'
    | 'guitarist'
    | 'elf'
    | 'gingerbread'
    | 'penguin'
    | 'nutcracker'
    | 'carollers';

const DRUM_VOICE = /^(bd|kick|sd|sn|cp|clap|rim|rs|cr|crash|ride|rd|lt|mt|ht|tom|toms|hh|oh|ch|hat|cb|cowbell|cow|drum|cy|cymbal)$/;

/** C3, the cut below which a lone oscillator line is a bass player. */
const C3 = 48;

/** Bare synth voices. They say nothing about the part, so register and chords pick the cast. */
const OSC = /^(sine|sin|triangle|tri|sawtooth|saw|supersaw|square|sqr|supersquare|pulse|superpwm|superzow|lead|theremin)$/;

/** True when `castFor` needs a pitch before its answer is final. */
export function isOscillator(name: string): boolean {
    return OSC.test(voiceOf(name));
}

function isDrumVoice(name: string): boolean {
    const voice = voiceOf(name);
    if (DRUM_VOICE.test(voice)) return true;
    const family = instrumentFamily(voice);
    return family === 'kick' || family === 'snare' || family === 'hat';
}

/**
 * Normalize sound names that only differ by sample bank index for unpitched
 * sleigh percussion (e.g. `sleighbells:0` and `sleighbells:1`) so they share
 * a single reindeer performer instead of duplicating.
 */
export function teamKey(name: string): string {
    const lower = name.toLowerCase();
    if (/^(sleighbells|sleigh|jingle|tambourine):/.test(lower)) {
        return name.slice(0, name.indexOf(':'));
    }
    return name;
}

/**
 * One member for a team. `note` is the lowest note in view, or NaN when the
 * team has not played a pitch yet; `chord` is true when it has played two
 * notes at once.
 *
 * - Sleigh percussion (`sleighbells`, `tamb`, `perc`) -> `reindeer` (Rudolph)
 * - Glockenspiel / xylophone / marimba -> `gingerbread` (Gingerbread on glock)
 * - Tubular bells / chimes / `wt_bell` / celesta -> `penguin` (Penguin on chimes)
 * - Choirs, strings and warm pads -> `carollers` (Dickensian vocal trio)
 * - Brass & winds (`trumpet`, `trombone`, `horn`, `flute`) -> `nutcracker`
 * - Electric / synth bass (`bass`, low `sawtooth`) -> `snowman` (Snowman on bass)
 * - Sub-bass / upright bass (`sub`, `contrabass`, low `sine`/`triangle`) -> `yeti` (Yeti on upright bass)
 * - Pianos, organs & chordal keys (`epiano`, `piano`, `organ`, `keys`) -> `mrsclaus` (Mrs. Claus at holiday organ)
 * - Plucks, guitars & pulse arps (`wt_pluck`, `guitar`, `pulse`) -> `guitarist` (Candy-cane Flying-V Elf)
 * - Synth leads (`square`, high `sawtooth`, `lead`) -> `elf` (Keytar Elf)
 */
export function castFor(name: string, note: number, chord: boolean): Cast {
    const lower = name.toLowerCase();
    const voice = voiceOf(lower);
    if (/^(white|pink|brown|crackle|noise)$/.test(voice)) return 'santa';
    if (/sleigh|jingle|tamb|shaker|cabasa|maraca|^perc$|^triangles$/.test(voice)) return 'reindeer';
    if (/tubular|chime|wt_bell|bell|celesta|music_box|kalimba/.test(lower)) return 'penguin';
    if (/glock|vibraphone|xylo|marimba|dulcimer/.test(lower)) return 'gingerbread';
    if (/choir|aahs|oohs|voice|vox|string|violin|viola|cello|ensemble|pad|warm/.test(lower)) return 'carollers';
    if (/trumpet|trombone|horn|brass|sax|tuba|flute|clarinet|oboe|bassoon|ocarina|recorder|piccolo|whistle|harmonica/.test(lower)) {
        return 'nutcracker';
    }
    if (/contrabass|upright|sub|808/.test(lower)) return 'yeti';
    if (/bass/.test(lower)) return 'snowman';
    if (/piano|epiano|rhodes|organ|clav|harpsichord|accordion|keys/.test(lower)) return 'mrsclaus';
    if (/guitar|gtr|banjo|harp|pluck|mandolin|ukulele/.test(lower)) return 'guitarist';
    if (/lead|theremin/.test(lower)) return 'elf';
    if (OSC.test(voice)) {
        if (!Number.isFinite(note)) {
            if (/^(pulse|superpwm)$/.test(voice)) return 'guitarist';
            if (/^(sine|sin|triangle|tri)$/.test(voice)) return 'yeti';
            return 'elf';
        }
        if (!chord && note < C3) {
            return /^(sine|sin|triangle|tri)$/.test(voice) ? 'yeti' : 'snowman';
        }
        if (chord) return 'mrsclaus';
        if (/^(pulse|superpwm)$/.test(voice)) return 'guitarist';
        return 'elf';
    }
    if (isDrumVoice(lower)) return 'santa';
    if (!Number.isFinite(note)) return 'santa';
    return note < C3 ? 'snowman' : 'elf';
}

/** Which kit piece a drum hap strikes. Ride shares the hat arm; crash swings the cymbal. */
export function kitPiece(name: string, note: number): KitPiece | 'other' {
    const voice = voiceOf(name);
    if (/^(rd|ride)$/.test(voice)) return 'hat';
    const role = roleOf(name, note);
    if (role === 'kick' || role === 'snare' || role === 'hat' || role === 'tom' || role === 'crash') return role;
    return 'other';
}
