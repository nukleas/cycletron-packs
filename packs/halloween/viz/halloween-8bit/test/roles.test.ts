import assert from 'node:assert/strict';
import {test} from 'node:test';
import {halloweenRole} from '../src/lib/roles.ts';

test('halloweenRole classes drums by voice and notes by register', () => {
    assert.equal(halloweenRole('bd', NaN), 'kick');
    assert.equal(halloweenRole('RolandTR909_sd', NaN), 'snare');
    assert.equal(halloweenRole('cr', NaN), 'crash');
    assert.equal(halloweenRole('ht', NaN), 'tom');
    assert.equal(halloweenRole('cb', NaN), 'hat');
    assert.equal(halloweenRole('tb', NaN), 'hat');
    assert.equal(halloweenRole('hh', NaN), 'hat');
    assert.equal(halloweenRole('gm_piano', NaN), 'perc');
    assert.equal(halloweenRole('supersaw', 40), 'bass');
    assert.equal(halloweenRole('gm_piano', 60), 'mid');
    assert.equal(halloweenRole('square', 80), 'lead');
});
