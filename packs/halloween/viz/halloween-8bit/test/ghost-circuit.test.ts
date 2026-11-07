import assert from 'node:assert/strict';
import {test} from 'node:test';
import {makeTraces, tracePoint} from '../src/modes/ghost-fog/circuit.ts';

test('every pitch trace reaches the live face exactly at onset', () => {
    const traces = makeTraces();
    assert.equal(traces.length, 36);
    for (const trace of traces) {
        assert.ok(trace.length > 0);
        assert.deepEqual(tracePoint(trace, [308, 171], 0), trace.points[0]);
        assert.deepEqual(tracePoint(trace, [308, 171], 1), [308, 171]);
        assert.deepEqual(tracePoint(trace, [337, 245], 1), [337, 245]);
        for (let step = 0; step <= 100; step++) {
            assert.ok(tracePoint(trace, [308, 171], step / 100).every(Number.isFinite));
        }
    }
});

test('the two sides route corresponding pitch lanes symmetrically', () => {
    const traces = makeTraces();
    for (let register = 0; register < 3; register++) {
        for (let lane = 0; lane < 6; lane++) {
            const left = traces[register * 12 + lane];
            const right = traces[register * 12 + lane + 6];
            assert.deepEqual(right.points, left.points.map(([x, y]) => [640 - x, y]));
            assert.ok(Math.abs(left.length - right.length) < 1e-9);
        }
    }
});
