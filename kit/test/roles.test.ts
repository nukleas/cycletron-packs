import assert from 'node:assert/strict';
import {test} from 'node:test';
import {isLong, registerPos} from '../src/roles.ts';

test('a note is long from three quarters of a cycle, and registers map to 0..1', () => {
    assert.equal(isLong(0, 0.5), false);
    assert.equal(isLong(0, 0.75), true);
    assert.equal(registerPos(48), 0);
    assert.equal(registerPos(60), 0.5);
    assert.equal(registerPos(100), 1);
});
