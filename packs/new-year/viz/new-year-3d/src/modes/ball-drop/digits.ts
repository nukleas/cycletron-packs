/** Seven-segment digits from boxes: where each segment of a digit sits. */

import type {Matrix4} from 'three';

export const DIGIT_SEGMENTS = 7;

const W = 5;
const H = 9;
const T = 1;

/** Centre x, centre y and whether the segment lies horizontally, for a b c d e f g. */
const LAYOUT: Array<[number, number, boolean]> = [
    [0, H / 2, true],
    [W / 2, H / 4, false],
    [W / 2, -H / 4, false],
    [0, -H / 2, true],
    [-W / 2, -H / 4, false],
    [-W / 2, H / 4, false],
    [0, 0, true],
];

/** Segment `k` of a digit centred on (x, y, z), into `out`. */
export function segmentMatrix(out: Matrix4, k: number, x: number, y: number, z: number): Matrix4 {
    const [sx, sy, flat] = LAYOUT[k];
    return out.makeScale(flat ? W - T : T, flat ? T : H / 2 - T, 1).setPosition(x + sx, y + sy, z);
}
