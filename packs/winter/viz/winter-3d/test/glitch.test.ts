import assert from 'node:assert/strict';
import {test} from 'node:test';
import {chokeAt, chokeBroken, loopIndex, loopTime, LOOP, stutterStart, type Sounded} from '../src/lib/glitch.ts';

const kick = {};
const hat = {};

/** `n` notes on `team` from `from`, `step` apart, each a step long. */
function run(team: Sounded['team'], from: number, n: number, step: number): Sounded[] {
    return Array.from({length: n}, (_, i) => ({team, begin: from + i * step, end: from + (i + 1) * step}));
}

test('four on the floor and 16th hats are not a stutter', () => {
    const notes = [...run(kick, 0, 4, 1 / 4), ...run(hat, 0, 16, 1 / 16)];
    for (let c = 0; c < 1; c += 1 / 64) assert.equal(stutterStart(notes, c), null);
});

test('a plied kick is a stutter from its first note to its last', () => {
    // bd*4 then ply 8 on the last beat: 8 notes in a quarter bar.
    const notes = [...run(kick, 0, 3, 1 / 4), ...run(kick, 0.75, 8, 1 / 32)];
    assert.equal(stutterStart(notes, 0.5), null);
    assert.equal(stutterStart(notes, 0.75), 0.75);
    assert.equal(stutterStart(notes, 0.99), 0.75);
    assert.equal(stutterStart(notes, 1), null);
});

test('two close notes are a flam, not a stutter', () => {
    const notes = run(kick, 0, 2, 1 / 32);
    assert.equal(stutterStart(notes, 0.01), null);
});

test('a stutter loops its first sixteenth', () => {
    const notes = run(kick, 0.5, 16, 1 / 64);
    assert.equal(loopTime(notes, 0.4), 0.4);
    assert.ok(Math.abs(loopTime(notes, 0.5 + LOOP + 0.01) - 0.51) < 1e-9);
    assert.equal(loopIndex(notes, 0.5 + 2.5 * LOOP), 2);
    assert.equal(loopIndex(notes, 0.4), -1);
});

test('a held note is not a choke', () => {
    const notes = [{team: kick, begin: 0, end: 0.25}, {team: hat, begin: 0, end: 2}, {team: kick, begin: 1, end: 1.25}];
    assert.equal(chokeAt(notes, 0.5), null);
});

test('half a bar of nothing is a choke from the last end to the next onset', () => {
    const notes = [...run(kick, 0, 2, 1 / 4), {team: kick, begin: 1, end: 1.25}];
    assert.deepEqual(chokeAt(notes, 0.7), {from: 0.5, to: 1});
    assert.equal(chokeAt(notes, 0.3), null);
});

test('a gap shorter than half a beat is not a choke', () => {
    const notes = [{team: kick, begin: 0, end: 0.2}, {team: kick, begin: 0.25, end: 0.5}];
    assert.equal(chokeAt(notes, 0.22), null);
});

test('the onset after a choke breaks it, briefly', () => {
    const notes = [...run(kick, 0, 2, 1 / 4), ...run(kick, 1, 4, 1 / 4)];
    assert.deepEqual(chokeBroken(notes, 1.05), {from: 0.5, to: 1});
    assert.equal(chokeBroken(notes, 1.2), null);
    assert.equal(chokeBroken(notes, 0.3), null);
});

test('a silent bar is a choke after the bar before it is forgotten', () => {
    const notes = [{team: kick, begin: 2, end: 2.25}];
    assert.deepEqual(chokeAt(notes, 1.5), {from: 1, to: 2});
    assert.deepEqual(chokeBroken(notes, 2.05), {from: 1, to: 2});
});

test('a silence longer than a bar is a break, not a choke', () => {
    const notes = [{team: kick, begin: 0, end: 0.25}, {team: kick, begin: 2, end: 2.25}];
    assert.equal(chokeAt(notes, 1), null);
});
