/**
 * A night sky that travels with the camera: stars on a dome, and a moon with
 * a halo. Stars twinkle from a hash of their index and the cycle, so the sky
 * is the same at any point of a song however it got there.
 */

import {
    AdditiveBlending, BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial, Points, PointsMaterial,
    IcosahedronGeometry, Sprite, SpriteMaterial, type Vector3,
} from 'three';
import {hash32, rand01, TAU} from '@cycletron/viz-sdk';
import {dotTexture} from './dot.js';
import type {Ink} from '../../lib/ink.js';

export class NightSky {
    readonly group = new Group();
    readonly moon: Mesh;
    private readonly halo: Sprite;
    private readonly stars: Points;
    private readonly base: Float32Array;
    private readonly col: Float32Array;
    private readonly moonMat = new MeshBasicMaterial({fog: false});
    private readonly haloMat = new SpriteMaterial({blending: AdditiveBlending, transparent: true, depthWrite: false, fog: false});
    private readonly starMat = new PointsMaterial({size: 2, sizeAttenuation: false, vertexColors: true, transparent: true,
        depthWrite: false, fog: false});

    /** `count` stars on a dome of `radius`, above `horizon` (radians). */
    constructor(count: number, radius: number, horizon: number, seed: number) {
        const pos = new Float32Array(count * 3);
        this.base = new Float32Array(count);
        this.col = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const r = (n: number) => rand01(hash32(seed + i * 7, n));
            const az = r(1) * TAU;
            const el = horizon + Math.asin(r(2)) * (Math.PI / 2 - horizon) / (Math.PI / 2);
            pos[i * 3] = Math.cos(el) * Math.cos(az) * radius;
            pos[i * 3 + 1] = Math.sin(el) * radius;
            pos[i * 3 + 2] = Math.cos(el) * Math.sin(az) * radius;
            this.base[i] = 0.25 + 0.75 * r(3) * r(3);
        }
        const g = new BufferGeometry();
        g.setAttribute('position', new BufferAttribute(pos, 3));
        g.setAttribute('color', new BufferAttribute(this.col, 3));
        this.stars = new Points(g, this.starMat);
        this.stars.frustumCulled = false;
        this.stars.renderOrder = -2;
        this.moon = new Mesh(new IcosahedronGeometry(radius * 0.035, 2), this.moonMat);
        this.moon.renderOrder = -1;
        this.haloMat.map = dotTexture(0);
        this.halo = new Sprite(this.haloMat);
        this.halo.scale.setScalar(radius * 0.4);
        this.halo.renderOrder = -1;
        this.moon.add(this.halo);
        this.group.add(this.stars, this.moon);
    }

    paint(ink: Ink): void {
        this.moonMat.color.copy(ink.snow);
        this.haloMat.color.copy(ink.frost).multiplyScalar(0.35);
        this.starMat.color.copy(ink.snow);
    }

    /** Put the moon at `dir` (a unit vector) on the dome. */
    placeMoon(dir: Vector3, radius: number): void {
        this.moon.position.copy(dir).multiplyScalar(radius * 0.9);
    }

    /** Follow `center`; `twinkle` 0..1 is how hard the stars flicker. */
    update(cycle: number, twinkle: number, center: Vector3): void {
        this.group.position.copy(center);
        const tick = Math.floor(cycle * 8);
        const n = this.base.length;
        for (let i = 0; i < n; i++) {
            const f = 1 - twinkle * rand01(hash32(i, tick));
            const v = this.base[i] * f;
            this.col[i * 3] = v;
            this.col[i * 3 + 1] = v;
            this.col[i * 3 + 2] = v;
        }
        this.stars.geometry.attributes.color.needsUpdate = true;
    }
}
