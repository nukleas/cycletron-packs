/**
 * The jump's profile and the meshes built on it. Downhill is +x. The in-run
 * runs from the tower top at x = 0 to the lip at `LIP_X`, raised on legs
 * above the slope; the landing hill falls away below the lip, steepest past
 * the knoll, and flattens into the outrun.
 */

import {BufferAttribute, BufferGeometry, Color, PlaneGeometry} from 'three';
import {hash32, rand01} from '@cycletron/viz-sdk';

export const LIP_X = 36;
export const LIP_Y = 7;
export const KNOLL_Y = 4.5;
const LAND_RUN = 70;
const LAND_DROP = 34;
export const TRACK = 1.4;
export const HILL_W = 9;

/** Height of the in-run's track at `x` (0..LIP_X). */
export function inrunY(x: number): number {
    const t = 1 - Math.min(LIP_X, Math.max(0, x)) / LIP_X;
    return LIP_Y + 0.15 * LIP_X * t + 17.6 * Math.pow(t, 1.8);
}

/** Height of the landing hill and outrun at `x` (from the lip on). */
export function landY(x: number): number {
    const t = Math.min(1, Math.max(0, (x - LIP_X) / LAND_RUN));
    return KNOLL_Y - LAND_DROP * t * t * (3 - 2 * t);
}

/** The slope the jump is built on: below the in-run, then the landing hill. */
export function groundY(x: number): number {
    return x < LIP_X ? KNOLL_Y + (LIP_X - x) * 0.42 : landY(x);
}

/** The ground at (x, z): the slope, rising into banks on both sides of the hill. */
export function terrainY(x: number, z: number): number {
    const side = Math.max(0, Math.abs(z) - HILL_W / 2 - 1);
    return groundY(Math.min(170, x)) + Math.pow(side / 40, 1.6) * 22;
}

/** The ground around the hill, roughened away from the piste. */
export function terrainGeometry(): BufferGeometry {
    const g = new PlaneGeometry(320, 140, 80, 26);
    g.rotateX(-Math.PI / 2);
    g.translate(40, 0, 0);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const side = Math.max(0, Math.abs(z) - HILL_W / 2 - 1);
        const bump = (rand01(hash32(Math.round(x * 2), Math.round(z * 2))) - 0.5) * Math.min(1.2, side * 0.15);
        pos.setY(i, terrainY(x, z) - 0.05 + bump);
    }
    g.setAttribute('color', new BufferAttribute(new Float32Array(pos.count * 3), 3));
    return g;
}

/** A strip `width` wide along a profile from `x0` to `x1`, lifted `lift` above it. */
export function stripGeometry(profile: (x: number) => number, x0: number, x1: number, steps: number, width: number, lift: number): BufferGeometry {
    const pos = new Float32Array((steps + 1) * 2 * 3);
    const index: number[] = [];
    for (let i = 0; i <= steps; i++) {
        const x = x0 + (x1 - x0) * (i / steps);
        const y = profile(x) + lift;
        pos.set([x, y, -width / 2, x, y, width / 2], i * 6);
        if (i < steps) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
}

/** Snow on the terrain, a shade darker on the banks. */
export function paintTerrain(g: BufferGeometry, snow: Color, shade: Color): void {
    const pos = g.attributes.position;
    const col = g.attributes.color;
    const c = new Color();
    for (let i = 0; i < pos.count; i++) {
        const z = Math.abs(pos.getZ(i));
        const v = 0.8 + 0.2 * rand01(hash32(i, 3));
        c.copy(snow).lerp(shade, 0.12 + Math.min(0.55, Math.max(0, (z - HILL_W) / 60))).multiplyScalar(v);
        col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
}
