import assert from 'node:assert/strict';
import {test} from 'node:test';
import {COLS, graveFor} from '../src/lib/graves.ts';

test('graveFor takes the pitch column, then the nearest free one, stepping from the seeded side', () => {
    const taken = new Uint8Array(COLS);
    assert.equal(graveFor(5, 0, taken), 5);
    taken[5] = 1;
    assert.equal(graveFor(5, 0, taken), 6); // even seed steps right first
    assert.equal(graveFor(5, 1, taken), 4); // odd seed steps left first
    taken[6] = 1;
    taken[4] = 1;
    assert.equal(graveFor(5, 0, taken), 7);
    assert.equal(graveFor(0, 1, taken), 0);
    taken.fill(1);
    assert.equal(graveFor(5, 0, taken), -1);
});
