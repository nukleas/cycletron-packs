/**
 * SLEIGHCON: the alert level every station shows. 5 is calm, 1 is all hands.
 * The level is a function of the bar: the onsets in this bar and the next,
 * one per track per onset time (a 16th-note hat line counts 16, a chord
 * counts 1), from one hap field with fixed caps, so every mode reads the
 * same number and a cut lands on it too.
 * It steps at bar lines, rising a bar early (the next bar is in view) and
 * standing down a bar after the noise stops. Log lines come from level
 * changes and a bar-hashed filler.
 */

import {type FieldHap, type FieldTeam, HapField, hash32, type VizServices} from '@cycletron/viz-sdk';

/** Onsets a bar at which the level steps: fewer than the first is 5. The carols run about 9 (intro) to 40 (last chorus); Last Christmas, a full-band MIDI cover, sits near 40 throughout. */
const STEPS = [14, 24, 32, 38];
const MAX_LOG = 12;
/** Bars between filler lines. */
const FILLER_EVERY = 8;
const FILLER = ['COMMS CHECK OK', 'NET SYNC NOMINAL', 'WX UPDATE · SNOW', 'ALL STATIONS REPORT', 'LINK 2 STEADY', 'ARCHIVE WRITE OK'];
const FILLER_HOT = ['PRODUCTION SURGE', 'ALL HANDS TO STATIONS', 'TRAFFIC HEAVY', 'PRIORITY TRAFFIC', 'HOLD THE LINE'];

interface Team extends FieldTeam {}
interface Hap extends FieldHap<Team> {}

export class Alert {
    private readonly field = new HapField<Team, Hap>({
        lookahead: 2,
        maxHaps: 2000,
        maxPerTrack: 256,
        idleRate: 0.25,
        team: (base) => base,
        hap: (base) => base,
        keep: (h, cycle) => h.begin >= Math.floor(cycle),
    });
    private readonly keys = new Set<number>();
    /** 5 calm to 1 all hands. */
    level = 5;
    /** Cycle the level last changed. */
    changedAt = -Infinity;
    /** Onsets in the current bar, and tracks present. */
    onsets = 0;
    tracks = 0;
    readonly log: string[] = [];
    private bar = -1;

    /** The field's clock: the song's cycle, coasting while stopped. */
    get cycle(): number {
        return this.field.cycle;
    }

    get locked(): boolean {
        return this.field.locked;
    }

    update(dt: number, s: VizServices): void {
        const field = this.field;
        field.update(dt, s);
        const fresh = field.restarted;
        if (fresh) {
            this.bar = -1;
            this.changedAt = -Infinity;
            this.log.length = 0;
        }
        const bar = Math.floor(field.cycle);
        if (bar === this.bar) return;
        this.bar = bar;

        this.onsets = this.count(bar);
        const ahead = this.count(bar + 1);
        let tracks = 0;
        for (const t of field.teams) if (t.present) tracks++;
        this.tracks = tracks;

        const level = levelFor(Math.max(this.onsets, ahead));
        if (fresh) {
            // A start, a seek or a live cut into this station: come online at the level, no alarm.
            this.level = level;
            this.push(`NET ONLINE · SLEIGHCON ${level}`);
        } else if (level !== this.level) {
            const up = level < this.level;
            this.level = level;
            this.changedAt = bar;
            this.push(up ? `SLEIGHCON ${level} DECLARED` : level === 5 ? 'ALL STATIONS HOLD' : `SLEIGHCON ${level} · STAND DOWN`);
        } else if (bar % FILLER_EVERY === FILLER_EVERY - 1) {
            const pool = level <= 2 ? FILLER_HOT : FILLER;
            this.push(pool[hash32(bar, 11) % pool.length]);
        }
    }

    /** Onsets in bar `bar`: one per track per onset time, at 96ths. */
    private count(bar: number): number {
        const keys = this.keys;
        keys.clear();
        for (const h of this.field.haps) {
            if (h.begin < bar || h.begin >= bar + 1) continue;
            keys.add(h.team.slot * 4096 + Math.round((h.begin - bar) * 96));
        }
        return keys.size;
    }

    private push(text: string): void {
        this.log.push(text);
        if (this.log.length > MAX_LOG) this.log.shift();
    }
}

function levelFor(onsets: number): number {
    let level = 5;
    for (const step of STEPS) if (onsets >= step) level--;
    return level;
}
