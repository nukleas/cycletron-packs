/**
 * Timing for performers: everything a pose needs, as functions of the cycle
 * and a note's onset, so a figure hits on the frame its note sounds.
 *
 * What makes the band read is not smooth motion but a few poses switched on
 * the grid: the stick is on the head on the onset frame, lifted just after,
 * at rest otherwise. `stance` is that switch. `windup` adds what the band
 * lacks, a figure readying for a note before it sounds, which a mode can
 * see because its `HapField` looks ahead.
 *
 * All times are in cycles (one cycle is one bar of four beats).
 */

/** An eighth of a bar: long enough to read as a wind-up, short enough to snap. */
export const LEAD = 0.125;

/** The run-up to `onset`: 0 until `lead` cycles before it, rising to 1 on it, 0 from then on. */
export function windup(cycle: number, onset: number, lead = LEAD): number {
    const t = onset - cycle;
    return t <= 0 || t > lead ? 0 : 1 - t / lead;
}

/** A hit's afterglow: 0 before `onset`, 1 on it, halving every `half` cycles after. */
export function strike(cycle: number, onset: number, half = 1 / 32): number {
    const t = cycle - onset;
    return t < 0 ? 0 : 2 ** (-t / half);
}

/** A held note: 0 before `begin`, 1 until `end`, then down to 0 over `tail` cycles. */
export function held(cycle: number, begin: number, end: number, tail = 1 / 16): number {
    if (cycle < begin) return 0;
    if (cycle <= end) return 1;
    return tail > 0 ? Math.max(0, 1 - (cycle - end) / tail) : 0;
}

export type Stance = 'rest' | 'ready' | 'hit';

/** A strike half-life for a big move (a sabre, a leap): its hit pose holds for about a sixteenth of a bar. */
export const BIG_HIT = 1 / 12;

/** Above this a strike is the hit pose. */
export const HIT = 0.55;

/**
 * The pose for a voice whose last hit left `struck` (a `strike` value) and
 * whose next note is `wound` (a `windup` value) away. A hit wins over a
 * wind-up, so fast notes read as hits, not a figure frozen in the air.
 * 'ready' only comes before a hit: a fading hit goes to rest, since a
 * figure that winds up again after its hit reads as the motion rewinding.
 * A bigger move holds its hit longer through `strike`'s half-life.
 */
export function stance(struck: number, wound: number): Stance {
    if (struck > HIT) return 'hit';
    return wound > 0 ? 'ready' : 'rest';
}

/** The latest onset at or before `cycle` among the notes `pick` accepts, or -Infinity. */
export function lastOnset<T extends {begin: number}>(notes: Iterable<T>, cycle: number, pick: (n: T) => boolean): number {
    let best = -Infinity;
    for (const n of notes) if (n.begin <= cycle && n.begin > best && pick(n)) best = n.begin;
    return best;
}

/** The earliest onset after `cycle` among the notes `pick` accepts, or Infinity. */
export function nextOnset<T extends {begin: number}>(notes: Iterable<T>, cycle: number, pick: (n: T) => boolean): number {
    let best = Infinity;
    for (const n of notes) if (n.begin > cycle && n.begin < best && pick(n)) best = n.begin;
    return best;
}

/** The beat of the bar `cycle` is in, 0..beats-1. */
export function beatIndex(cycle: number, beats = 4): number {
    return Math.floor((cycle - Math.floor(cycle)) * beats);
}

/** How far into its beat `cycle` is, 0..1. */
export function beatPhase(cycle: number, beats = 4): number {
    const b = cycle * beats;
    return b - Math.floor(b);
}

/** Beats left until the next phrase of `bars` bars starts: `bars * beats` on the downbeat, down to 1. */
export function beatsLeft(cycle: number, bars: number, beats = 4): number {
    const total = bars * beats;
    const into = Math.floor((cycle / bars - Math.floor(cycle / bars)) * total);
    return total - into;
}
