/**
 * A pool of soft additive points: sparks, bokeh, bubbles, window glints.
 * One Points object over preallocated buffers; a frame refills it from
 * state with `begin`/`add`/`commit`, so nothing allocates while it plays.
 * `mirror` adds a second, dimmer copy flipped about a water line that shares
 * the same buffers.
 */

import {AdditiveBlending, BufferAttribute, BufferGeometry, type Color, Group, Points, ShaderMaterial} from 'three';

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
uniform float uScale;
uniform float uMirror;
uniform float uWater;
varying vec3 vColor;
void main() {
    vec3 p = position;
    if (uMirror > 0.5) p.y = 2.0 * uWater - p.y;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(1.0, aSize * uScale / -mv.z);
    vColor = aColor;
}`;

const FRAG = /* glsl */ `
uniform float uGain;
varying vec3 vColor;
void main() {
    vec2 q = gl_PointCoord * 2.0 - 1.0;
    float d = dot(q, q);
    if (d > 1.0) discard;
    float a = exp(-d * 3.5) * (1.0 - d) + 0.6 * exp(-d * 28.0);
    gl_FragColor = vec4(vColor * a * uGain, 1.0);
    #include <colorspace_fragment>
}`;

function material(mirror: boolean, gain: number): ShaderMaterial {
    return new ShaderMaterial({
        uniforms: {uScale: {value: 1}, uMirror: {value: mirror ? 1 : 0}, uWater: {value: 0}, uGain: {value: gain}},
        vertexShader: VERT,
        fragmentShader: FRAG,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
    });
}

export class Glow {
    readonly group = new Group();
    private readonly geo = new BufferGeometry();
    private readonly pos: Float32Array;
    private readonly col: Float32Array;
    private readonly size: Float32Array;
    private readonly attrs: BufferAttribute[];
    private readonly mats: ShaderMaterial[] = [];
    private count = 0;

    constructor(private readonly max: number, mirrorGain = 0) {
        this.pos = new Float32Array(max * 3);
        this.col = new Float32Array(max * 3);
        this.size = new Float32Array(max);
        this.attrs = [new BufferAttribute(this.pos, 3), new BufferAttribute(this.col, 3), new BufferAttribute(this.size, 1)];
        this.geo.setAttribute('position', this.attrs[0]);
        this.geo.setAttribute('aColor', this.attrs[1]);
        this.geo.setAttribute('aSize', this.attrs[2]);
        this.geo.setDrawRange(0, 0);
        this.addPoints(material(false, 1));
        if (mirrorGain > 0) this.addPoints(material(true, mirrorGain));
    }

    private addPoints(mat: ShaderMaterial): void {
        const points = new Points(this.geo, mat);
        points.frustumCulled = false;
        this.mats.push(mat);
        this.group.add(points);
    }

    /** Pixel scale for the viewport: a point of size 1 at distance 1 spans this many pixels. */
    view(heightPx: number, fovDeg: number, water = 0): void {
        const scale = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
        for (const m of this.mats) {
            m.uniforms.uScale.value = scale;
            m.uniforms.uWater.value = water;
        }
    }

    begin(): void {
        this.count = 0;
    }

    /** One point: world position, colour times `k`, and world size. */
    add(x: number, y: number, z: number, c: Color, k: number, size: number): void {
        if (this.count >= this.max || k <= 0.002) return;
        const i = this.count++;
        this.pos[i * 3] = x;
        this.pos[i * 3 + 1] = y;
        this.pos[i * 3 + 2] = z;
        this.col[i * 3] = c.r * k;
        this.col[i * 3 + 1] = c.g * k;
        this.col[i * 3 + 2] = c.b * k;
        this.size[i] = size;
    }

    commit(): void {
        this.geo.setDrawRange(0, this.count);
        for (const attr of this.attrs) {
            attr.clearUpdateRanges();
            attr.addUpdateRange(0, this.count * attr.itemSize);
            attr.needsUpdate = true;
        }
    }
}
