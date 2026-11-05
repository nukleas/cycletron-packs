/**
 * The night: a gradient dome from the horizon up, a band of haze on the
 * horizon that takes the colour of whatever lights the city, and fixed stars.
 */

import {BackSide, Color, Mesh, ShaderMaterial, SphereGeometry} from 'three';
import {hash32, rand01} from '@cycletron/viz-sdk';
import {Glow} from './glow.js';
import type {Ink} from './ink.js';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uGlow;
varying vec3 vDir;
void main() {
    float y = vDir.y;
    vec3 c = mix(uHorizon, uTop, smoothstep(-0.02, 0.45, y));
    c += uGlow * exp(-abs(y) * 9.0);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
}`;

const STARS = 260;

export class Sky {
    readonly mesh: Mesh;
    readonly stars = new Glow(STARS);
    private readonly mat: ShaderMaterial;
    private readonly starColor = new Color();
    /** The haze colour this frame; the mode sets it. */
    readonly glow = new Color();

    constructor(private readonly radius: number) {
        this.mat = new ShaderMaterial({
            uniforms: {uTop: {value: new Color()}, uHorizon: {value: new Color()}, uGlow: {value: this.glow}},
            vertexShader: VERT,
            fragmentShader: FRAG,
            side: BackSide,
            depthWrite: false,
        });
        this.mesh = new Mesh(new SphereGeometry(radius, 32, 16), this.mat);
        this.mesh.renderOrder = -10;
        this.stars.group.renderOrder = -9;
    }

    bake(ink: Ink): void {
        const top: Color = this.mat.uniforms.uTop.value;
        const horizon: Color = this.mat.uniforms.uHorizon.value;
        top.copy(ink.bg).multiplyScalar(0.7);
        horizon.copy(ink.bg).lerp(ink.violet, 0.4);
        this.starColor.copy(ink.active).lerp(ink.neon, 0.2);
        this.stars.begin();
        const r = this.radius * 0.9;
        for (let i = 0; i < STARS; i++) {
            const az = rand01(hash32(i, 71)) * Math.PI * 2;
            const el = 0.06 + Math.pow(rand01(hash32(i, 72)), 0.8) * 1.3;
            const k = 0.25 + 0.75 * Math.pow(rand01(hash32(i, 73)), 3);
            this.stars.add(Math.cos(az) * Math.cos(el) * r, Math.sin(el) * r, Math.sin(az) * Math.cos(el) * r,
                this.starColor, k, 2.4 + 2 * k);
        }
        this.stars.commit();
    }
}
