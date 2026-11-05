/**
 * CONFETTI — a ballroom at midnight under a storm of foil confetti. Hats
 * shake a puff loose from the nets in the ceiling, snares and claps fire a
 * cannon from one side of the floor (the sides take turns), crashes fire
 * both. Kicks are gusts that push everything in the air one way and pulse
 * the floor. Pitched notes light the bokeh along the back wall like a
 * keyboard: low notes to the left, high to the right, in the track's colour.
 * A slow drizzle keeps falling between hits; what lands stays on the floor
 * until it fades.
 *
 * Pieces are simulated in update(), each from a seeded launch; render() only
 * turns their state into instance matrices.
 */

import type {VizMode, VizModeDef, VizServices} from '@cycletron/viz-sdk';
import {type FieldHap, type FieldTeam, HapField, hash32, rand01, TAU} from '@cycletron/viz-sdk';
import {drawScene, setRgb} from '@naderlabs/kit/gl';
import {
    Color, DoubleSide, Euler, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, PerspectiveCamera, PlaneGeometry,
    Quaternion, Scene, ShaderMaterial, Vector3,
} from 'three';
import {Glow} from '../../lib/glow.js';
import {Ink} from '../../lib/ink.js';
import {pitchPos, roleOf} from '../../lib/roles.js';

const LOOKAHEAD = 1;
const MAX_HAPS = 160;
const MAX_PER_TRACK = 48;
const IDLE_RATE = 0.35;
const FOV = 55;
const MAX_PIECES = 3200;
const LIFE = 14;
const HAT_PUFF = 9;
const CANNON = 70;
const DRIZZLE = 3;
const BOKEH = 24;
const ROOM_W = 34;
const CEILING = 34;
const BULBS = 90;

interface Team extends FieldTeam {}

class ConfettiMode implements VizMode {
    private readonly scene = new Scene();
    private readonly camera = new PerspectiveCamera(FOV, 16 / 9, 0.3, 400);
    private readonly ink = new Ink();
    private readonly field = new HapField<Team, FieldHap<Team>>({
        lookahead: LOOKAHEAD,
        maxHaps: MAX_HAPS,
        maxPerTrack: MAX_PER_TRACK,
        idleRate: IDLE_RATE,
        team: (base) => base,
        hap: (base) => base,
        keep: (h, cycle) => h.begin + 0.5 >= cycle,
    });
    private readonly mesh: InstancedMesh;
    private readonly colors: InstancedBufferAttribute;
    private readonly rgb = new Float32Array(MAX_PIECES * 3);
    private readonly mat: ShaderMaterial;
    private readonly floorMat: ShaderMaterial;
    private readonly lights = new Glow(BOKEH * 2 + BULBS + 8);
    // Piece state, one slot per piece in a ring.
    private readonly px = new Float32Array(MAX_PIECES);
    private readonly py = new Float32Array(MAX_PIECES);
    private readonly pz = new Float32Array(MAX_PIECES);
    private readonly vx = new Float32Array(MAX_PIECES);
    private readonly vy = new Float32Array(MAX_PIECES);
    private readonly vz = new Float32Array(MAX_PIECES);
    private readonly age = new Float32Array(MAX_PIECES).fill(LIFE);
    private readonly seed = new Uint32Array(MAX_PIECES);
    private readonly landed = new Uint8Array(MAX_PIECES);
    private next = 0;
    private readonly bokehLevel = new Float32Array(BOKEH);
    private readonly bokehColor: Color[] = [];
    private wind = 0;
    private pulse = 0;
    private sparkle = 0;
    private side = 0;
    private lastDrizzle = -1;
    private readonly m = new Matrix4();
    private readonly q = new Quaternion();
    private readonly e = new Euler();
    private readonly p = new Vector3();
    private readonly axis = new Vector3();
    private readonly scale = new Vector3(1, 1, 1);
    private readonly tmp = new Color();

    constructor() {
        const geo = new PlaneGeometry(0.62, 0.4);
        this.mat = new ShaderMaterial({
            uniforms: {uGlint: {value: 1}, uAmbient: {value: new Color()}},
            vertexShader: PIECE_VERT,
            fragmentShader: PIECE_FRAG,
            side: DoubleSide,
        });
        this.mesh = new InstancedMesh(geo, this.mat, MAX_PIECES);
        this.colors = new InstancedBufferAttribute(this.rgb, 3);
        geo.setAttribute('aColor', this.colors);
        this.mesh.frustumCulled = false;
        for (let i = 0; i < BOKEH; i++) this.bokehColor.push(new Color());

        this.floorMat = new ShaderMaterial({
            uniforms: {uColor: {value: new Color()}, uGlow: {value: new Color()}, uPulse: {value: 0}},
            vertexShader: FLOOR_VERT,
            fragmentShader: FLOOR_FRAG,
        });
        const floor = new Mesh(new PlaneGeometry(200, 120), this.floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.z = -10;
        this.lights.group.renderOrder = 2;
        this.scene.add(floor, this.mesh, this.lights.group);
    }

    layout(s: VizServices): void {
        const ink = this.ink;
        ink.bake(s.theme);
        this.scene.background = ink.bg;
        const amb: Color = this.mat.uniforms.uAmbient.value;
        amb.copy(ink.violet).lerp(ink.active, 0.15);
        const floor: Color = this.floorMat.uniforms.uColor.value;
        floor.copy(ink.bg).lerp(ink.violet, 0.25);
        const glow: Color = this.floorMat.uniforms.uGlow.value;
        glow.copy(ink.second);
        this.recolor();
        this.camera.aspect = s.width / Math.max(1, s.height);
        this.camera.updateProjectionMatrix();
        this.lights.view(s.height * s.dpr, FOV);
        this.field.invalidate();
    }

    /** Piece colours follow the palette: foil from the accents, a share of gold and silver. */
    private recolor(): void {
        for (let i = 0; i < MAX_PIECES; i++) this.pieceColor(i);
        this.colors.needsUpdate = true;
    }

    private pieceColor(i: number): void {
        const r = rand01(hash32(this.seed[i], 11));
        const c = r < 0.18 ? this.ink.neon : r < 0.3 ? this.ink.active : this.ink.accent(this.seed[i] % 8);
        this.rgb[i * 3] = c.r;
        this.rgb[i * 3 + 1] = c.g;
        this.rgb[i * 3 + 2] = c.b;
    }

    update(dt: number, s: VizServices): void {
        const field = this.field;
        field.update(dt, s);
        if (field.restarted) {
            this.age.fill(LIFE);
            this.bokehLevel.fill(0);
            this.wind = 0;
            this.pulse = 0;
            this.sparkle = 0;
        }
        for (const h of field.haps) {
            if (!field.crossed(h)) continue;
            h.done = true;
            h.team.activity = 1;
            this.hit(h);
        }
        const beat = Math.floor(field.cycle * 4);
        if (beat !== this.lastDrizzle) {
            this.lastDrizzle = beat;
            for (let n = 0; n < DRIZZLE; n++) this.dropFromCeiling(hash32(beat, n + 501), 0.5);
        }
        this.step(dt);
        const k = Math.exp(-dt * 2.6);
        for (let i = 0; i < BOKEH; i++) this.bokehLevel[i] *= k;
        this.wind *= Math.exp(-dt * 1.4);
        this.pulse *= Math.exp(-dt * 6);
        this.sparkle *= Math.exp(-dt * 6);
        this.sparkle = Math.max(this.sparkle, s.high * 0.6);
    }

    private hit(h: FieldHap<Team>): void {
        if (Number.isFinite(h.note)) {
            const slot = Math.min(BOKEH - 1, Math.floor(pitchPos(h.note) * BOKEH));
            this.bokehLevel[slot] = 1;
            setRgb(this.bokehColor[slot], h.team.rgb);
            return;
        }
        switch (roleOf(h.team.name, h.note)) {
            case 'hat':
            case 'perc':
                for (let n = 0; n < HAT_PUFF; n++) this.dropFromCeiling(hash32(h.seed, n + 1), 1);
                this.sparkle = 1;
                break;
            case 'snare':
                this.side = 1 - this.side;
                this.cannon(h.seed, this.side === 0 ? -1 : 1);
                break;
            case 'crash':
                this.cannon(h.seed, -1);
                this.cannon(hash32(h.seed, 7), 1);
                break;
            case 'kick':
                this.wind += ((h.seed & 1) === 0 ? 1 : -1) * 7;
                this.pulse = 1;
                break;
            default:
                break;
        }
    }

    private spawn(seed: number, x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
        const i = this.next;
        this.next = (this.next + 1) % MAX_PIECES;
        this.px[i] = x;
        this.py[i] = y;
        this.pz[i] = z;
        this.vx[i] = vx;
        this.vy[i] = vy;
        this.vz[i] = vz;
        this.age[i] = 0;
        this.seed[i] = seed;
        this.landed[i] = 0;
        this.pieceColor(i);
        this.colors.needsUpdate = true;
    }

    private dropFromCeiling(seed: number, spread: number): void {
        const r = (n: number) => rand01(hash32(seed, n));
        const cx = (r(1) * 2 - 1) * ROOM_W * spread;
        this.spawn(seed, cx + (r(2) - 0.5) * 3, CEILING + r(3) * 3, -16 + r(4) * 26, (r(5) - 0.5) * 2, -r(6) * 2, (r(7) - 0.5) * 2);
    }

    private cannon(seed: number, dir: number): void {
        for (let n = 0; n < CANNON; n++) {
            const ps = hash32(seed, n + 100);
            const r = (k: number) => rand01(hash32(ps, k));
            const speed = 44 + r(1) * 30;
            const a = 0.9 + r(2) * 0.45;
            const yaw = (r(3) - 0.5) * 0.7;
            this.spawn(ps, dir * ROOM_W * 0.95, 0.5, 4 + (r(4) - 0.5) * 6,
                -dir * Math.cos(a) * speed, Math.sin(a) * speed, Math.sin(yaw) * speed * 0.6);
        }
    }

    /** Ballistic until the air has slowed a piece, then a flutter down; it lies where it lands. */
    private step(dt: number): void {
        const drag = Math.exp(-dt * 2.2);
        for (let i = 0; i < MAX_PIECES; i++) {
            if (this.age[i] >= LIFE) continue;
            this.age[i] += dt;
            if (this.landed[i] === 1) continue;
            const r = rand01(hash32(this.seed[i], 3));
            const fall = 2.2 + r * 1.6;
            this.vx[i] = this.wind + (this.vx[i] - this.wind) * drag;
            this.vz[i] *= drag;
            this.vy[i] = -fall + (this.vy[i] + fall) * drag;
            const sway = Math.sin(this.age[i] * (2 + r * 2) + r * TAU) * (0.8 + r);
            this.px[i] += (this.vx[i] + sway) * dt;
            this.py[i] += this.vy[i] * dt;
            this.pz[i] += (this.vz[i] + Math.cos(this.age[i] * 1.7 + r * 9) * 0.5) * dt;
            if (this.py[i] <= 0.03) {
                this.py[i] = 0.03 + r * 0.02;
                this.landed[i] = 1;
            }
        }
    }

    render(ctx: CanvasRenderingContext2D, s: VizServices): void {
        const cycle = this.field.cycle;
        const cam = this.camera;
        const sway = Math.sin(cycle * 0.07);
        cam.position.set(sway * 8, 5 + Math.sin(cycle * 0.05) * 1.5, 38);
        cam.lookAt(sway * 2, 14, -4);

        for (let i = 0; i < MAX_PIECES; i++) {
            const age = this.age[i];
            if (age >= LIFE) {
                this.mesh.setMatrixAt(i, ZERO);
                continue;
            }
            const seed = this.seed[i];
            const r = rand01(hash32(seed, 5));
            if (this.landed[i] === 1) {
                this.e.set(-Math.PI / 2 + (r - 0.5) * 0.3, 0, r * TAU);
                this.q.setFromEuler(this.e);
            } else {
                this.axis.set(r - 0.5, rand01(hash32(seed, 6)) - 0.5, rand01(hash32(seed, 7)) - 0.5).normalize();
                this.q.setFromAxisAngle(this.axis, age * (4 + r * 7) + r * TAU);
            }
            const shrink = age > LIFE - 1 ? LIFE - age : 1;
            this.scale.setScalar(shrink);
            this.p.set(this.px[i], this.py[i], this.pz[i]);
            this.m.compose(this.p, this.q, this.scale);
            this.mesh.setMatrixAt(i, this.m);
        }
        this.mesh.instanceMatrix.needsUpdate = true;
        this.mat.uniforms.uGlint.value = 0.6 + this.sparkle * 1.2;
        this.floorMat.uniforms.uPulse.value = this.pulse;

        this.drawLights(cycle);
        drawScene(ctx, this.scene, cam, s.width, s.height, s.dpr);
    }

    private drawLights(cycle: number): void {
        const g = this.lights;
        const ink = this.ink;
        g.begin();
        for (let i = 0; i < BOKEH; i++) {
            const x = -ROOM_W * 1.6 + (i + 0.5) * ((ROOM_W * 3.2) / BOKEH);
            const y = 10 + rand01(hash32(i, 31)) * 18;
            const lvl = this.bokehLevel[i];
            const c = lvl > 0.02 ? this.tmp.copy(ink.violet).lerp(this.bokehColor[i], Math.min(1, lvl * 1.5)) : ink.violet;
            g.add(x, y, -46, c, 0.22 + lvl * 0.9, 12 + lvl * 6);
        }
        // String lights in swags under the ceiling, twinkling with the highs.
        for (let i = 0; i < BULBS; i++) {
            const swag = Math.floor(i / 15);
            const u = (i % 15) / 14;
            const x = -ROOM_W * 1.3 + swag * ((ROOM_W * 2.6) / 5) + u * ((ROOM_W * 2.6) / 5);
            const y = CEILING - 1 - Math.sin(u * Math.PI) * 4;
            const flick = rand01(hash32(i, Math.floor(cycle * 8))) < this.sparkle * 0.5 ? 1.6 : 1;
            g.add(x, y, -22, ink.neon, 0.35 * flick, 1.3);
        }
        g.commit();
    }
}

/** A dead piece: scaled to nothing. */
const ZERO = new Matrix4().makeScale(0, 0, 0);

const PIECE_VERT = /* glsl */ `
attribute vec3 aColor;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vView;
void main() {
    vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vColor = aColor;
    vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * vec3(0.0, 0.0, 1.0));
    vView = cameraPosition - w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
}`;

const PIECE_FRAG = /* glsl */ `
uniform float uGlint;
uniform vec3 uAmbient;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vView;
void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vView);
    if (dot(n, v) < 0.0) n = -n;
    float key = max(dot(n, normalize(vec3(0.3, 0.8, 0.5))), 0.0);
    float rim = max(dot(n, normalize(vec3(-0.6, 0.2, -0.4))), 0.0);
    vec3 r = reflect(-v, n);
    float glint = pow(max(dot(r, normalize(vec3(0.1, 0.9, 0.4))), 0.0), 40.0) * uGlint;
    vec3 c = vColor * (0.25 + 0.85 * key) + uAmbient * rim * 0.6 + vec3(glint);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
}`;

const FLOOR_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FLOOR_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uGlow;
uniform float uPulse;
varying vec3 vWorld;
void main() {
    vec2 tile = abs(fract(vWorld.xz / 6.0) - 0.5);
    float seam = smoothstep(0.47, 0.5, max(tile.x, tile.y));
    float spot = exp(-dot(vWorld.xz - vec2(0.0, -4.0), vWorld.xz - vec2(0.0, -4.0)) / 500.0);
    vec3 c = uColor * (0.7 + 0.5 * spot) + uGlow * spot * (0.04 + uPulse * 0.22) - seam * 0.02;
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
}`;

export const confettiDef: VizModeDef = {
    id: 'confetti',
    name: 'CONFETTI',
    create: () => new ConfettiMode(),
};
