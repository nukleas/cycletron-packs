/**
 * FIREWORKS — a harbour skyline at midnight. Every pitched note is a shell:
 * it launches early (the field looks a bar ahead) so it bursts exactly on its
 * onset. Pitch is burst height, the track colour is the stars' colour, and
 * the register picks the shell: bass notes are gold willows that hang and
 * fall, mids chrysanthemums with trails, leads tight peonies. Long notes burst
 * wider. Snares and claps are white salutes that strobe, crashes are rings,
 * kicks fire fountains from the barges and flash the water. Hats make every
 * live star crackle. Each burst lights the haze and the upper floors in its
 * colour.
 *
 * A star is never stored: its position is the closed-form path of a launch
 * with drag and gravity, from the shell's onset, seed and the clock.
 */

import type {VizMode, VizModeDef, VizServices} from '@cycletron/viz-sdk';
import {type FieldHap, type FieldTeam, HapField, hash32, rand01, TAU} from '@cycletron/viz-sdk';
import {drawScene, setRgb} from '@naderlabs/kit/gl';
import {type Role} from '@naderlabs/kit/roles';
import {Color, Mesh, PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial} from 'three';
import {Glow} from '../../lib/glow.js';
import {Ink} from '../../lib/ink.js';
import {pitchPos, roleOf, secondsPerCycle} from '../../lib/roles.js';
import {Skyline} from '../../lib/skyline.js';
import {Sky} from '../../lib/sky.js';

const LOOKAHEAD = 2;
const MAX_HAPS = 160;
const MAX_PER_TRACK = 48;
const IDLE_RATE = 0.35;
/** Seconds from launch to burst. */
const FLIGHT = 1.05;
const MAX_SHELLS = 72;
const MAX_POINTS = 22000;
const GRAVITY = 7;
const FOV = 50;
const BARGES = [-34, -4, 26];

type Kind = 'peony' | 'chrysanthemum' | 'willow' | 'salute' | 'ring' | 'fountain';

interface Shape {
    stars: number;
    speed: number;
    drag: number;
    gravity: number;
    life: number;
    trail: number;
    size: number;
}

const SHAPES: Record<Kind, Shape> = {
    peony: {stars: 50, speed: 24, drag: 1.9, gravity: 1, life: 1.6, trail: 2, size: 1.5},
    chrysanthemum: {stars: 64, speed: 30, drag: 1.7, gravity: 1, life: 2.1, trail: 4, size: 1.3},
    willow: {stars: 80, speed: 30, drag: 2.6, gravity: 1.5, life: 3.4, trail: 7, size: 1.1},
    salute: {stars: 34, speed: 34, drag: 4.5, gravity: 0.3, life: 0.7, trail: 1, size: 1.7},
    ring: {stars: 56, speed: 30, drag: 1.7, gravity: 0.8, life: 1.9, trail: 3, size: 1.4},
    fountain: {stars: 40, speed: 22, drag: 1.2, gravity: 2.4, life: 1.3, trail: 3, size: 0.9},
};

interface Team extends FieldTeam {}

interface Note extends FieldHap<Team> {
    role: Role;
    /** Launches a shell: every pitched note, but bass only on the beat, so the willows don't smother the sky. */
    shell: boolean;
    x: number;
    y: number;
    z: number;
    x0: number;
}

interface Shell {
    live: boolean;
    kind: Kind;
    /** Burst time, cycles. */
    t0: number;
    seed: number;
    x: number;
    y: number;
    z: number;
    /** Burst scale: long notes go wider. */
    scale: number;
    color: Color;
    /** The burst's ring plane, for rings. */
    tilt: number;
}

class FireworksMode implements VizMode {
    private readonly scene = new Scene();
    private readonly camera = new PerspectiveCamera(FOV, 16 / 9, 0.5, 1200);
    private readonly ink = new Ink();
    private readonly sky = new Sky(600);
    private readonly city = new Skyline(46, 95, -24, 34, 0.6, 911);
    private readonly sparks = new Glow(MAX_POINTS, 0.38);
    private readonly water: ShaderMaterial;
    private readonly field = new HapField<Team, Note>({
        lookahead: LOOKAHEAD,
        maxHaps: MAX_HAPS,
        maxPerTrack: MAX_PER_TRACK,
        idleRate: IDLE_RATE,
        team: (base) => base,
        hap: (base) => makeNote(base),
        // Slot 0 is the gold the willows use; pitched tracks take the rest of the pool.
        recolor: (team) => this.pool[(team.slot + 1) % this.pool.length] ?? null,
        keep: (h, cycle) => h.begin + 0.5 >= cycle,
    });
    private readonly shells: Shell[] = [];
    private pool: Array<[number, number, number]> = [];
    private next = 0;
    /** The colour the latest bursts throw on the city and the haze. */
    private readonly light = new Color();
    private readonly tmp = new Color();
    private readonly white = new Color(1, 1, 1);
    private crackle = 0;
    private thump = 0;
    private spc = 2;
    private beat = 0;
    private lastIdle = -1;

    constructor() {
        for (let i = 0; i < MAX_SHELLS; i++) {
            this.shells.push({live: false, kind: 'peony', t0: 0, seed: 0, x: 0, y: 0, z: 0, scale: 1, color: new Color(), tilt: 0});
        }
        this.water = new ShaderMaterial({
            uniforms: {uColor: {value: new Color()}, uLight: {value: this.light}, uThump: {value: 0}, uTime: {value: 0}},
            vertexShader: WATER_VERT,
            fragmentShader: WATER_FRAG,
            transparent: true,
            depthWrite: false,
        });
        const water = new Mesh(new PlaneGeometry(400, 260), this.water);
        water.rotation.x = -Math.PI / 2;
        water.position.set(0, 0, 100);
        water.renderOrder = 2;
        this.sparks.group.children[1].renderOrder = 1;
        this.sparks.group.children[0].renderOrder = 3;
        this.scene.add(this.sky.mesh, this.sky.stars.group, this.city.group, this.city.reflection, water, this.sparks.group);
    }

    layout(s: VizServices): void {
        this.ink.bake(s.theme);
        this.pool = s.theme.accentPool;
        this.sky.bake(this.ink);
        this.city.bake(this.ink);
        this.scene.background = this.ink.bg;
        const uColor: Color = this.water.uniforms.uColor.value;
        uColor.copy(this.ink.bg).multiplyScalar(0.6);
        this.camera.aspect = s.width / Math.max(1, s.height);
        this.camera.updateProjectionMatrix();
        this.sparks.view(s.height * s.dpr, FOV);
        this.field.invalidate();
    }

    update(dt: number, s: VizServices): void {
        const field = this.field;
        field.update(dt, s);
        this.spc = secondsPerCycle(s.bpm);
        if (field.restarted) {
            for (const sh of this.shells) sh.live = false;
            this.light.setRGB(0, 0, 0);
            this.crackle = 0;
            this.thump = 0;
        }
        for (const h of field.haps) {
            if (!field.crossed(h)) continue;
            h.done = true;
            h.team.activity = 1;
            this.fire(h);
        }
        if (!field.locked) this.idle(field.cycle);
        this.beat = Math.floor(field.cycle * 4);
        this.light.multiplyScalar(Math.exp(-dt * 2.2));
        this.crackle *= Math.exp(-dt * 7);
        this.thump *= Math.exp(-dt * 5);
        this.crackle = Math.max(this.crackle, s.high * 0.5);
    }

    private fire(h: Note): void {
        const dur = h.end - h.begin;
        switch (h.role) {
            case 'bass':
            case 'mid':
            case 'lead': {
                if (!h.shell) break;
                const kind: Kind = h.role === 'bass' ? 'willow' : h.role === 'mid' ? 'chrysanthemum' : 'peony';
                const scale = 0.75 + Math.min(1, Math.sqrt(dur * 2)) * 0.6;
                const c = vivid(setRgb(this.tmp, h.team.rgb));
                // Willows are gold whatever the track, tinted by it.
                if (h.role === 'bass') c.lerp(this.ink.neon, 0.55);
                this.burst(kind, h.begin, h.seed, h.x, h.y, h.z, scale, c);
                break;
            }
            case 'snare': {
                const r = (n: number) => rand01(hash32(h.seed, n));
                this.burst('salute', h.begin, h.seed, -40 + 80 * r(1), 26 + 14 * r(2), -18 + 10 * r(3), 1, this.white);
                break;
            }
            case 'crash':
                this.burst('ring', h.begin, h.seed, h.x, 46, h.z, 1.3, this.ink.second);
                break;
            case 'kick': {
                const barge = BARGES[h.seed % BARGES.length];
                this.burst('fountain', h.begin, h.seed, barge, 1.2, -8, 1, this.ink.neon);
                this.thump = 1;
                break;
            }
            case 'hat':
            case 'perc':
            case 'tom':
                this.crackle = 1;
                break;
            default:
                break;
        }
    }

    private idle(cycle: number): void {
        const tick = Math.floor(cycle * 2);
        if (tick === this.lastIdle) return;
        this.lastIdle = tick;
        const seed = hash32(tick, 97);
        const r = (n: number) => rand01(hash32(seed, n));
        const kinds: Kind[] = ['peony', 'chrysanthemum', 'willow'];
        this.burst(kinds[seed % 3], cycle, seed, -45 + 90 * r(1), 26 + 26 * r(2), -16 + 14 * r(3), 1, this.ink.accent(seed % 5));
    }

    private burst(kind: Kind, t0: number, seed: number, x: number, y: number, z: number, scale: number, color: Color): void {
        const sh = this.shells[this.next];
        this.next = (this.next + 1) % MAX_SHELLS;
        sh.live = true;
        sh.kind = kind;
        sh.t0 = t0;
        sh.seed = seed;
        sh.x = x;
        sh.y = y;
        sh.z = z;
        sh.scale = scale;
        sh.color.copy(color);
        sh.tilt = rand01(hash32(seed, 9)) * 1.2 - 0.6;
        const amount = kind === 'fountain' ? 0.25 : kind === 'salute' ? 0.5 : 0.35 * scale;
        this.light.r = Math.min(1.2, this.light.r + color.r * amount);
        this.light.g = Math.min(1.2, this.light.g + color.g * amount);
        this.light.b = Math.min(1.2, this.light.b + color.b * amount);
    }

    render(ctx: CanvasRenderingContext2D, s: VizServices): void {
        const cycle = this.field.cycle;
        const cam = this.camera;
        cam.position.set(Math.sin(cycle * 0.045) * 10, 7 + Math.sin(cycle * 0.031) * 1.5, 92);
        cam.lookAt(Math.sin(cycle * 0.045) * 4, 31, 0);

        this.sky.glow.copy(this.light).multiplyScalar(0.22);
        this.city.uniforms.uFlash.value.copy(this.light).multiplyScalar(0.3);
        this.city.uniforms.uLitFrac.value = 0.22 + this.thump * 0.12;
        this.city.uniforms.uTick.value = this.beat;
        this.water.uniforms.uThump.value = this.thump;
        this.water.uniforms.uTime.value = cycle * this.spc;

        const g = this.sparks;
        g.begin();
        // Newest first, so a full pool drops the oldest embers.
        for (let k = 1; k <= MAX_SHELLS; k++) {
            const sh = this.shells[(this.next - k + MAX_SHELLS) % MAX_SHELLS];
            if (sh.live) this.drawShell(sh, cycle);
        }
        this.drawRising(cycle);
        g.commit();
        drawScene(ctx, this.scene, cam, s.width, s.height, s.dpr);
    }

    private drawShell(sh: Shell, cycle: number): void {
        const shape = SHAPES[sh.kind];
        const t = (cycle - sh.t0) * this.spc;
        if (t < 0 || t > shape.life) return;
        const g = this.sparks;
        const c = this.tmp;
        const n = Math.round(shape.stars * (0.7 + 0.3 * sh.scale));
        const speed = shape.speed * sh.scale;
        const grav = GRAVITY * shape.gravity;
        // A flash at the centre for the first instants.
        if (t < 0.15) g.add(sh.x, sh.y, sh.z, c.copy(sh.color).lerp(this.white, 0.5), (1 - t / 0.15) * 0.7, (sh.kind === 'salute' ? 5 : 8) * sh.scale);
        for (let i = 0; i < n; i++) {
            const seed = hash32(sh.seed, i + 1);
            const jitter = 0.86 + 0.2 * rand01(seed);
            let dx: number;
            let dy: number;
            let dz: number;
            if (sh.kind === 'ring') {
                const a = (i / n) * TAU;
                dx = Math.cos(a);
                dy = Math.sin(a) * Math.cos(sh.tilt);
                dz = Math.sin(a) * Math.sin(sh.tilt);
            } else if (sh.kind === 'fountain') {
                const a = rand01(hash32(seed, 2)) * TAU;
                const spread = 0.12 + 0.22 * rand01(hash32(seed, 3));
                dx = Math.cos(a) * spread;
                dz = Math.sin(a) * spread;
                dy = 1;
            } else {
                // Fibonacci sphere, turned by the shell's seed: an even burst.
                const yy = 1 - (2 * (i + 0.5)) / n;
                const rr = Math.sqrt(1 - yy * yy);
                const a = i * 2.39996 + sh.seed * 1e-3;
                dx = Math.cos(a) * rr;
                dy = yy;
                dz = Math.sin(a) * rr;
            }
            const life = shape.life * (0.75 + 0.25 * rand01(hash32(seed, 4)));
            if (t > life) continue;
            const v = speed * jitter;
            const fade = Math.pow(1 - t / life, 1.4);
            // White-hot, then the shell's colour, then an ember.
            const hot = Math.max(0, 1 - t / 0.16);
            c.copy(sh.color).lerp(this.white, hot * 0.6);
            let k = fade * 0.8;
            const crackles = sh.kind === 'salute' || ((sh.kind === 'willow' || sh.kind === 'chrysanthemum') && t > life * 0.45);
            if (crackles || this.crackle > 0.3) {
                const on = rand01(hash32(seed, Math.floor(t * 22))) < 0.55 ? 1 : 0.25;
                k *= 1 - (1 - on) * Math.max(crackles ? 1 : 0, this.crackle);
            }
            for (let j = 0; j <= shape.trail; j++) {
                const tj = t - j * 0.045;
                if (tj < 0) break;
                const e = 1 - Math.exp(-shape.drag * tj);
                const reach = (v * e) / shape.drag;
                const fall = (grav / shape.drag) * (tj - e / shape.drag);
                const tail = j === 0 ? 1 : 0.55 * (1 - j / (shape.trail + 1));
                g.add(sh.x + dx * reach, sh.y + dy * reach - fall, sh.z + dz * reach, c, k * tail, shape.size * (j === 0 ? 1 : 0.7));
            }
        }
    }

    /** Shells on their way up: a hot head and a fading tail, bursting on the onset. */
    private drawRising(cycle: number): void {
        const g = this.sparks;
        const flight = FLIGHT / this.spc;
        for (const h of this.field.haps) {
            if (h.done || !h.seen || !h.shell) continue;
            const p = 1 - (h.begin - cycle) / flight;
            if (p < 0 || p > 1) continue;
            for (let j = 0; j < 7; j++) {
                const q = p - j * 0.035;
                if (q < 0) break;
                const ease = 1 - (1 - q) * (1 - q);
                const wob = Math.sin(q * 30 + h.seed) * 0.3;
                const x = h.x0 + (h.x - h.x0) * q + wob;
                const y = h.y * ease;
                const k = j === 0 ? 1.1 : 0.7 * (1 - j / 7);
                g.add(x, y, h.z, j === 0 ? this.white : this.ink.active, k, j === 0 ? 1.3 : 0.9);
            }
        }
    }
}

/** The colour pushed to a firework's saturation: a pale accent still reads as a colour in the sky. */
function vivid(c: Color): Color {
    c.getHSL(HSL);
    return c.setHSL(HSL.h, Math.max(HSL.s, 0.8), Math.min(Math.max(HSL.l, 0.5), 0.62));
}

const HSL = {h: 0, s: 0, l: 0};

function makeNote(base: FieldHap<Team>): Note {
    const r = (n: number) => rand01(hash32(base.seed, n));
    const role = roleOf(base.team.name, base.note);
    const height = Number.isFinite(base.note) ? pitchPos(base.note) : 0.5;
    const x = -56 + 112 * r(1);
    return {
        ...base,
        role,
        shell: role === 'bass' ? onBeat(base.begin) : role === 'mid' || role === 'lead',
        x,
        y: 36 + height * 32 + r(2) * 5,
        z: -20 + 16 * r(3),
        x0: x + (r(4) - 0.5) * 10,
    };
}

function onBeat(cycle: number): boolean {
    const q = cycle * 4;
    return Math.abs(q - Math.round(q)) < 0.01;
}

const WATER_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
}`;

const WATER_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uLight;
uniform float uThump;
uniform float uTime;
varying vec3 vWorld;
void main() {
    float z = vWorld.z;
    float x = vWorld.x;
    float ripple = sin(z * 1.7 + sin(x * 0.11 + uTime * 0.7) * 2.0 + uTime * 1.3) * 0.5 + 0.5;
    float streak = smoothstep(0.82, 1.0, ripple) * (0.25 + uThump * 0.9);
    vec3 c = uColor + uLight * 0.08 + uLight * streak * 0.25;
    float a = 0.7 - streak * 0.3;
    gl_FragColor = vec4(c, a);
    #include <colorspace_fragment>
}`;

export const fireworksDef: VizModeDef = {
    id: 'fireworks',
    name: 'FIREWORKS',
    create: () => new FireworksMode(),
};
