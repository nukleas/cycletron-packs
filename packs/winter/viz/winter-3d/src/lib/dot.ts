/**
 * A soft round dot, for `Points` and glow sprites: white, with alpha falling
 * off from the centre. Built from numbers, so it is ready on frame 0.
 */

import {DataTexture, LinearFilter, RGBAFormat} from 'three';

const SIZE = 32;

export function dotTexture(hardness: number): DataTexture {
    const data = new Uint8Array(SIZE * SIZE * 4);
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const dx = (x + 0.5) / SIZE * 2 - 1;
            const dy = (y + 0.5) / SIZE * 2 - 1;
            const r = Math.min(1, Math.sqrt(dx * dx + dy * dy));
            const a = Math.pow(1 - r, 1 + (1 - hardness) * 2) * Math.min(1, (1 - r) * (1 + hardness * 12));
            const i = (y * SIZE + x) * 4;
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
            data[i + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
        }
    }
    const tex = new DataTexture(data, SIZE, SIZE, RGBAFormat);
    tex.magFilter = LinearFilter;
    tex.minFilter = LinearFilter;
    tex.needsUpdate = true;
    return tex;
}
