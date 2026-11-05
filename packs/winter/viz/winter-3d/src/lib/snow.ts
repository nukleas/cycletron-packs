/**
 * Falling snow in a box around the camera. Each flake's place is a function
 * of the time and its seed, wrapped into the box in world space, so flakes
 * parallax as the camera moves and need no state to replay.
 */

import {AdditiveBlending, BufferAttribute, BufferGeometry, type Color, Points, PointsMaterial} from 'three';
import {hash32, rand01, TAU} from '@cycletron/viz-sdk';
import {dotTexture} from './dot.js';

export class Snowfall {
    readonly points: Points;
    private readonly pos: Float32Array;
    private readonly seeds: Float32Array;
    private readonly mat: PointsMaterial;

    constructor(count: number, private readonly w: number, private readonly h: number, private readonly d: number, size: number, seed: number) {
        this.pos = new Float32Array(count * 3);
        this.seeds = new Float32Array(count * 4);
        for (let i = 0; i < count * 4; i++) this.seeds[i] = rand01(hash32(seed + i, 17));
        const g = new BufferGeometry();
        g.setAttribute('position', new BufferAttribute(this.pos, 3));
        this.mat = new PointsMaterial({size, map: dotTexture(0.5), transparent: true, depthWrite: false, blending: AdditiveBlending});
        this.points = new Points(g, this.mat);
        this.points.frustumCulled = false;
    }

    paint(color: Color, opacity: number): void {
        this.mat.color.copy(color);
        this.mat.opacity = opacity;
    }

    /** Flakes at `time` (in bars), falling `fall` units a bar, drifting `wind` units a bar along x. */
    update(time: number, fall: number, wind: number, cx: number, cy: number, cz: number): void {
        const {w, h, d, pos, seeds} = this;
        const n = pos.length / 3;
        for (let i = 0; i < n; i++) {
            const s0 = seeds[i * 4];
            const s1 = seeds[i * 4 + 1];
            const s2 = seeds[i * 4 + 2];
            const s3 = seeds[i * 4 + 3];
            const speed = fall * (0.6 + 0.8 * s3);
            const x = s0 * w + wind * time * (0.7 + 0.6 * s3) + Math.sin(time * 2.1 + s2 * TAU) * 0.4;
            const y = s1 * h - speed * time;
            const z = s2 * d + Math.cos(time * 1.7 + s0 * TAU) * 0.4;
            pos[i * 3] = wrap(x, cx - w / 2, w);
            pos[i * 3 + 1] = wrap(y, cy - h / 2, h);
            pos[i * 3 + 2] = wrap(z, cz - d / 2, d);
        }
        this.points.geometry.attributes.position.needsUpdate = true;
    }
}

/** `v` wrapped into [lo, lo + span). */
function wrap(v: number, lo: number, span: number): number {
    const t = (v - lo) % span;
    return lo + (t < 0 ? t + span : t);
}
