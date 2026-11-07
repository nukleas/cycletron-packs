import assert from 'node:assert/strict';
import {test} from 'node:test';
import {FLIGHT, RELEASE, flightAt, poseAt, type NoteMotion} from '../src/modes/ghost-fog/motion.ts';

const note = (role: NoteMotion['role'], pitch = 60): NoteMotion => ({begin: 1, end: 2, note: pitch, role, seen: true});

test('a note approaches before onset, docks throughout its hold, then leaves', () => {
    assert.equal(flightAt(1 - FLIGHT, 1, 2), -1);
    assert.equal(flightAt(1 - FLIGHT / 2, 1, 2), -0.5);
    assert.equal(flightAt(1, 1, 2), 0);
    assert.equal(flightAt(1.5, 1, 2), 0);
    assert.equal(flightAt(2, 1, 2), 0);
    assert.equal(flightAt(2 + FLIGHT / 2, 1, 2), 0.5);
    assert.equal(flightAt(2 + FLIGHT, 1, 2), 1);
});

test('kick anticipation releases exactly on the hit; bass keeps the jaw open while held', () => {
    const notes = [note('kick'), note('bass', 36)];
    const ready = poseAt(notes, 0.95);
    assert.ok(ready.ready > 0);
    assert.equal(ready.kick, 0);
    assert.equal(ready.jaw, 0);
    const onset = poseAt(notes, 1);
    assert.equal(onset.ready, 0);
    assert.equal(onset.kick, 1);
    assert.equal(onset.jaw, 1);
    assert.ok(poseAt(notes, 1.9).jaw >= 0.65);
    assert.ok(poseAt(notes, 2 + RELEASE).jaw < 0.001);
});

test('pitch steers the gaze, chords find their centroid, future and removed notes cannot move it', () => {
    const low = note('mid', 48);
    const high = note('mid', 72);
    assert.ok(poseAt([low], 1.5).yaw < 0);
    assert.ok(poseAt([high], 1.5).yaw > 0);
    assert.equal(poseAt([low, high], 1.5).yaw, 0);
    assert.ok(poseAt([low, high], 1.5).chord > poseAt([low], 1.5).chord);
    assert.equal(poseAt([high], 0.5).yaw, 0);
    assert.equal(poseAt([{...high, seen: false}], 1.5).yaw, 0);
});

test('direct seeks and out-of-order sampling produce the same pose', () => {
    const notes = [note('bass', 36), note('snare'), note('lead', 88)];
    const direct = poseAt(notes, 1.15);
    for (let frame = 0; frame < 60; frame++) poseAt(notes, frame / 30);
    assert.deepEqual(poseAt(notes, 1.15), direct);
    assert.deepEqual(poseAt([], 4), poseAt([], 0));
});
