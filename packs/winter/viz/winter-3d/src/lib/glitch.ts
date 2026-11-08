/**
 * The song's own glitches, found in its notes: a stutter (a track firing
 * 32nds or faster, the sound of `ply`) and a choke (nothing sounding for half
 * a beat or more, the hole before a drop). Every answer is a function of the
 * cycle and the notes, so a render's chunks agree at their seams.
 *
 * A mode draws a stutter by looping a slice of its own time (`loopTime`), so
 * the picture repeats the way the sound does, and a choke as ice cracking
 * over the lens (`Cracks`).
 */

/** Notes at least this close together are a stutter. */
export const STUTTER_GAP = 1 / 32 + 1e-6;
/** Notes in a run before it counts. */
export const STUTTER_RUN = 3;
/** The slice a stutter loops: a sixteenth of a bar. */
export const LOOP = 1 / 16;
/** Silence at least this long is a choke. */
export const CHOKE = 1 / 8 - 1e-6;
/** And at most this long: longer is a break, not a hole. */
export const MAX_CHOKE = 1 + 1e-6;
/**
 * How long a mode must keep a note after it ends for these to see the
 * silence behind it: a choke's start is the last note's end.
 */
export const GLITCH_KEEP = 1.1;
/** How long the cracks take to shatter after the choke. */
export const SHATTER = 1 / 8;

export interface Sounded {
    begin: number;
    end: number;
    team: object;
}

/**
 * The run of close notes `cycle` is in, as its first onset, or null. The
 * run is a track's notes, each within `STUTTER_GAP` of the next, at least
 * `STUTTER_RUN` long, from its first onset to its last note's end.
 */
export function stutterStart(notes: Iterable<Sounded>, cycle: number): number | null {
    const byTeam = new Map<object, number[]>();
    for (const n of notes) {
        let onsets = byTeam.get(n.team);
        if (!onsets) byTeam.set(n.team, (onsets = []));
        onsets.push(n.begin);
    }
    let best: number | null = null;
    for (const onsets of byTeam.values()) {
        onsets.sort((a, b) => a - b);
        let first = 0;
        for (let i = 1; i <= onsets.length; i++) {
            if (i < onsets.length && onsets[i] - onsets[i - 1] <= STUTTER_GAP) continue;
            // onsets[first..i-1] is a run.
            const count = i - first;
            const end = onsets[i - 1] + (count > 1 ? onsets[i - 1] - onsets[i - 2] : 0);
            if (count >= STUTTER_RUN && onsets[first] <= cycle && cycle < end) {
                if (best === null || onsets[first] < best) best = onsets[first];
            }
            first = i;
        }
    }
    return best;
}

/** The cycle to draw at: inside a stutter, the run's first slice on a loop; elsewhere `cycle`. */
export function loopTime(notes: Iterable<Sounded>, cycle: number): number {
    const start = stutterStart(notes, cycle);
    if (start === null) return cycle;
    return start + ((cycle - start) % LOOP);
}

/** Which loop of a stutter `cycle` is in, for a cut that changes once a loop; -1 outside one. */
export function loopIndex(notes: Iterable<Sounded>, cycle: number): number {
    const start = stutterStart(notes, cycle);
    return start === null ? -1 : Math.floor((cycle - start) / LOOP);
}

export interface Choke {
    /** When the last sound ended. */
    from: number;
    /** The next onset. */
    to: number;
}

/** The silence `cycle` falls in, if nothing sounds there for `CHOKE` to `MAX_CHOKE`. */
export function chokeAt(notes: Iterable<Sounded>, cycle: number): Choke | null {
    let from = -Infinity;
    let to = Infinity;
    for (const n of notes) {
        if (n.begin <= cycle && cycle < n.end) return null;
        if (n.end <= cycle && n.end > from) from = n.end;
        if (n.begin > cycle && n.begin < to) to = n.begin;
    }
    // A mode's field forgets the last bar's notes soon after the bar line, so
    // a silence with nothing known before it started on that line.
    if (from === -Infinity) from = Math.floor(cycle);
    const span = to - from;
    if (!Number.isFinite(span) || span < CHOKE || span > MAX_CHOKE) return null;
    return {from, to};
}

/** The choke that ended at the latest onset at or before `cycle`, if that onset broke one. */
export function chokeBroken(notes: Iterable<Sounded>, cycle: number): Choke | null {
    let onset = -Infinity;
    for (const n of notes) if (n.begin <= cycle && n.begin > onset) onset = n.begin;
    if (!Number.isFinite(onset) || cycle - onset > SHATTER) return null;
    const before = chokeAt(notes, onset - 1e-9);
    return before && before.to === onset ? before : null;
}
