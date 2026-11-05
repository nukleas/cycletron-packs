/**
 * A city of instanced boxes with procedural windows: a lit fraction that the
 * mode sets, a few windows that change on every beat, and a wash of light from
 * the sky (`flash`) that reaches the upper floors first. `reflection` is a
 * dimmer copy flipped about the water line.
 */

import {BoxGeometry, Color, DoubleSide, Group, InstancedMesh, Matrix4, ShaderMaterial, type IUniform} from 'three';
import {hash32, rand01} from '@cycletron/viz-sdk';
import type {Ink} from './ink.js';

const VERT = /* glsl */ `
varying vec3 vLocal;
varying vec3 vNormal;
varying float vId;
varying float vTop;
void main() {
    vec4 local = instanceMatrix * vec4(position, 1.0);
    vLocal = local.xyz;
    vNormal = normalize(mat3(instanceMatrix) * normal);
    vId = float(gl_InstanceID);
    vTop = instanceMatrix[1][1];
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * local;
}`;

const FRAG = /* glsl */ `
uniform vec3 uBody;
uniform vec3 uLit;
uniform vec3 uFlash;
uniform float uLitFrac;
uniform float uTick;
uniform float uGain;
varying vec3 vLocal;
varying vec3 vNormal;
varying float vId;
varying float vTop;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
    vec3 n = normalize(vNormal);
    bool side = abs(n.x) > 0.5;
    vec2 uv = side ? vLocal.zy : vLocal.xy;
    vec2 g = uv / vec2(1.1, 1.5);
    vec2 cell = floor(g);
    vec2 f = fract(g);
    float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.28, f.y) * step(f.y, 0.78);
    win *= step(abs(n.y), 0.5) * step(1.2, vLocal.y) * step(vLocal.y, vTop - 0.8);
    float r = h(cell + vec2(vId * 7.31, vId * 3.17));
    float swap = step(h(cell + vec2(uTick * 0.61, vId)), 0.08);
    float lit = win * abs(step(r, uLitFrac) - swap);
    float shade = side ? 0.62 : 1.0;
    float up = clamp(vLocal.y / 50.0, 0.0, 1.0);
    vec3 c = uBody * shade * (0.5 + 0.5 * up) + uFlash * (0.15 + 0.85 * up) * shade;
    c = mix(c, uLit * (0.55 + 0.45 * h(cell + 3.1)), lit);
    gl_FragColor = vec4(c * uGain, 1.0);
    #include <colorspace_fragment>
}`;

interface Uniforms {
    [name: string]: IUniform;
    uBody: IUniform<Color>;
    uLit: IUniform<Color>;
    uFlash: IUniform<Color>;
    uLitFrac: IUniform<number>;
    uTick: IUniform<number>;
}

export class Skyline {
    readonly group = new Group();
    readonly reflection = new Group();
    readonly uniforms: Uniforms = {
        uBody: {value: new Color()},
        uLit: {value: new Color()},
        uFlash: {value: new Color()},
        uLitFrac: {value: 0.3},
        uTick: {value: 0},
    };

    /** Buildings along x in [-width, width], z in [zNear - depth, zNear]; `tall` lifts the towers. */
    constructor(count: number, width: number, zNear: number, depth: number, tall: number, seed: number) {
        const geo = new BoxGeometry(1, 1, 1);
        geo.translate(0, 0.5, 0);
        const m = new Matrix4();
        const real = new InstancedMesh(geo, this.material(1), count);
        const mirror = new InstancedMesh(geo, this.material(0.22), count);
        for (let i = 0; i < count; i++) {
            const r = (n: number) => rand01(hash32(seed + i, n));
            const row = i % 3;
            const x = -width + (2 * width * (i + r(1) * 0.8)) / count;
            const z = zNear - row * (depth / 3) - r(2) * (depth / 4);
            const tower = r(3) < 0.18 ? 1 : 0;
            const h = (6 + r(4) * 16 + tower * (14 + r(5) * 22)) * tall * (1 - row * 0.08) + row * 6;
            const w = 3 + r(6) * 5;
            const d = 3 + r(7) * 4;
            m.makeScale(w, h, d).setPosition(x, 0, z);
            real.setMatrixAt(i, m);
            mirror.setMatrixAt(i, m);
        }
        this.group.add(real);
        this.reflection.add(mirror);
        this.reflection.scale.y = -1;
    }

    private material(gain: number): ShaderMaterial {
        return new ShaderMaterial({
            uniforms: {...this.uniforms, uGain: {value: gain}},
            vertexShader: VERT,
            fragmentShader: FRAG,
            side: DoubleSide,
        });
    }

    bake(ink: Ink): void {
        this.uniforms.uBody.value.copy(ink.bg).lerp(ink.violet, 0.22);
        this.uniforms.uLit.value.copy(ink.active).lerp(ink.neon, 0.45);
    }
}
