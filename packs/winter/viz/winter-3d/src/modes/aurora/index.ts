/**
 * AURORA — the northern lights over a snowy ridge, a cabin and its pines in
 * the foreground. The pitched tracks share five curtains of light. A note
 * lights its curtain at a point set by its pitch (low notes to the left,
 * high to the right) and the glow spreads along the curtain from there,
 * raising its rays; a held note keeps spreading until the whole curtain
 * burns, so pads and chords light the sky and short notes flick across it.
 * The highs make the rays shimmer, kicks surge light up the curtains, snares
 * send a shooting star over, hats twinkle the stars, and the bass warms the
 * cabin window. The snow takes the aurora's colour.
 */

import type {VizMode, VizModeDef, VizServices} from '@cycletron/viz-sdk';
import {type FieldHap, type FieldTeam, HapField} from '@cycletron/viz-sdk';
import {clamp01, hash32, rand01, TAU} from '@cycletron/viz-sdk';
import {drawScene, setRgb} from '@naderlabs/kit/gl';
import {type Role} from '@naderlabs/kit/roles';
import {
    AdditiveBlending, AmbientLight, BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, DoubleSide,
    DynamicDrawUsage, Fog, HemisphereLight, Mesh, MeshBasicMaterial, MeshLambertMaterial, PerspectiveCamera,
    PlaneGeometry, Points, PointsMaterial, Scene, Vector3,
} from 'three';
import {dotTexture} from './dot.js';
import {Ink} from '../../lib/ink.js';
import {Pines} from './pines.js';
import {winterRole} from '../../lib/roles.js';
import {NightSky} from './sky.js';
import {Snowfall} from './snow.js';

const LOOKAHEAD = 1;
const MAX_HAPS = 200;
const MAX_PER_TRACK = 32;
const DRUM_CAP = 16;
const IDLE_RATE = 0.2;
const CURTAINS = 5;
const COLS = 120;
const ROWS = 6;
/** Bars a note's light lingers after it ends. */
const TAIL = 1.2;
const MAX_METEORS = 4;
const METEOR_LIFE = 0.7;
const METEOR_DOTS = 14;
const SKY_RADIUS = 160;

interface Team extends FieldTeam {
    color: Color;
}

interface Note extends FieldHap<Team> {
    role: Role;
    /** Where along its curtain the note lights, 0 (left) to 1. */
    u: number;
    curtain: number;
}

interface Curtain {
    geo: BufferGeometry;
    pos: Float32Array;
    col: Float32Array;
    /** Light along the curtain, per column, this frame. */
    light: Float32Array;
    /** Colour along the curtain, per column. */
    hue: Color[];
    z: number;
    y: number;
    height: number;
    width: number;
    phase: number;
}

interface Meteor {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    age: number;
}

class AuroraMode implements VizMode {
    private readonly ink = new Ink();
    private readonly scene = new Scene();
    private readonly camera = new PerspectiveCamera(60, 16 / 9, 0.1, 400);
    private readonly air = new Color();
    private readonly fog = new Fog(0x000000, 30, 140);
    private readonly field = new HapField<Team, Note>({
        lookahead: LOOKAHEAD,
        maxHaps: MAX_HAPS,
        maxPerTrack: MAX_PER_TRACK,
        idleRate: IDLE_RATE,
        team: (base) => ({...base, color: new Color()}),
        hap: (base) => makeNote(base),
        cap: (_team, note) => (Number.isFinite(note) ? Infinity : DRUM_CAP),
        keep: (h, cycle) => h.end + TAIL >= cycle,
    });

    private readonly curtains: Curtain[] = [];
    private readonly curtainMat = new MeshBasicMaterial({vertexColors: true, blending: AdditiveBlending, transparent: true,
        depthWrite: false, side: DoubleSide, fog: false});
    private readonly ground: Mesh;
    private readonly groundMat = new MeshLambertMaterial({flatShading: true, vertexColors: true});
    private readonly pines = new Pines(90);
    private readonly cabinMat = new MeshLambertMaterial({flatShading: true});
    private readonly roofMat = new MeshLambertMaterial({flatShading: true});
    private readonly windowMat = new MeshBasicMaterial();
    private readonly sky = new NightSky(700, SKY_RADIUS, 0.02, 9001);
    private readonly snow = new Snowfall(260, 30, 16, 30, 0.12, 51);
    private readonly meteors: Meteor[] = [];
    private readonly meteorPts: Points;
    private readonly meteorPos = new Float32Array(MAX_METEORS * METEOR_DOTS * 3);
    private readonly meteorCol = new Float32Array(MAX_METEORS * METEOR_DOTS * 3);
    private readonly ambient = new AmbientLight(0xffffff, 0.4);
    private readonly hemi = new HemisphereLight(0xffffff, 0x000000, 1);
    private readonly mood = new Color();
    private readonly tint = new Color();
    private readonly center = new Vector3();
    private readonly moonDir = new Vector3(0.75, 0.22, -0.5).normalize();
    private kick = 0;
    private hat = 0;
    private bass = 0;

    constructor() {
        const {scene} = this;
        scene.background = this.air;
        scene.fog = this.fog;
        for (let k = 0; k < CURTAINS; k++) {
            const c = makeCurtain(k);
            this.curtains.push(c);
            const m = new Mesh(c.geo, this.curtainMat);
            m.frustumCulled = false;
            m.renderOrder = 1;
            scene.add(m);
        }

        this.ground = new Mesh(groundGeometry(), this.groundMat);
        scene.add(this.ground, this.pines.mesh, this.sky.group, this.snow.points);
        this.sky.placeMoon(this.moonDir, SKY_RADIUS);
        this.plantPines();
        this.buildCabin();

        const g = new BufferGeometry();
        g.setAttribute('position', new BufferAttribute(this.meteorPos, 3));
        g.setAttribute('color', new BufferAttribute(this.meteorCol, 3));
        this.meteorPts = new Points(g, new PointsMaterial({size: 3, sizeAttenuation: false, map: dotTexture(0.4), vertexColors: true,
            blending: AdditiveBlending, transparent: true, depthWrite: false, fog: false}));
        this.meteorPts.frustumCulled = false;
        scene.add(this.meteorPts, this.ambient, this.hemi);
    }

    layout(s: VizServices): void {
        const {ink} = this;
        ink.bake(s.theme);
        this.air.copy(ink.bg);
        this.fog.color.copy(ink.bg).lerp(ink.deep, 0.25);
        paintGround(this.ground.geometry, ink);
        this.pines.paint(this.tint.copy(ink.deep).lerp(ink.bg, 0.75), ink.snow, ink.bg);
        this.cabinMat.color.copy(ink.warm).lerp(ink.bg, 0.75);
        this.roofMat.color.copy(ink.snow).multiplyScalar(0.9);
        this.sky.paint(ink);
        this.snow.paint(ink.snow, 0.7);
        this.ambient.color.copy(ink.deep).lerp(ink.frost, 0.4);
        this.hemi.groundColor.copy(ink.deep).multiplyScalar(0.4);
        this.camera.aspect = s.width / Math.max(1, s.height);
        this.camera.updateProjectionMatrix();
        this.field.invalidate();
    }

    update(dt: number, s: VizServices): void {
        const field = this.field;
        field.update(dt, s);
        if (field.restarted) {
            this.meteors.length = 0;
            this.kick = 0;
            this.hat = 0;
            this.bass = 0;
        }
        for (const t of field.teams) setRgb(t.color, t.rgb);
        const now = field.cycle;
        for (const h of field.haps) {
            if (!field.crossed(h)) continue;
            h.done = true;
            h.team.activity = 1;
            switch (h.role) {
                case 'kick':
                    this.kick = 1;
                    break;
                case 'snare':
                case 'crash':
                    this.spawnMeteor(h.seed);
                    break;
                case 'hat':
                case 'perc':
                    this.hat = 1;
                    break;
                case 'bass':
                    this.bass = 1;
                    break;
                default:
                    break;
            }
        }
        this.kick *= Math.exp(-dt * 4);
        this.hat *= Math.exp(-dt * 6);
        this.bass *= Math.exp(-dt * 3);
        for (let i = this.meteors.length - 1; i >= 0; i--) {
            const m = this.meteors[i];
            m.age += dt;
            if (m.age >= METEOR_LIFE) this.meteors.splice(i, 1);
        }

        const pan = Math.sin(now * TAU / 32) * 0.12;
        this.camera.position.set(Math.sin(now * TAU / 48) * 1.5, 2.6, 9);
        this.camera.lookAt(this.camera.position.x + Math.sin(pan) * 40, 13, -40);
        this.center.copy(this.camera.position);
        this.sky.update(now, 0.15 + 0.55 * this.hat, this.center);
        this.snow.update(now, 1.6, 0.5, this.center.x, this.center.y + 2, this.center.z - 10);
        this.windowMat.color.copy(this.ink.warm).multiplyScalar(0.55 + 0.6 * this.bass);

        this.lightCurtains(now, s.high, field.locked);
        this.placeMeteors();
    }

    render(ctx: CanvasRenderingContext2D, s: VizServices): void {
        drawScene(ctx, this.scene, this.camera, s.width, s.height, s.dpr);
    }

    private lightCurtains(now: number, high: number, playing: boolean): void {
        const {ink, mood} = this;
        mood.setRGB(0, 0, 0);
        let total = 0;
        for (let k = 0; k < CURTAINS; k++) {
            const c = this.curtains[k];
            const light = c.light;
            // A glow that never quite goes out, drifting on its own when nothing plays.
            for (let i = 0; i < COLS; i++) {
                const u = i / (COLS - 1);
                const drift = 0.5 + 0.5 * Math.sin(u * 7 + now * 0.9 + c.phase);
                light[i] = (playing ? 0.07 : 0.2) * drift;
                c.hue[i].copy(ink.aurora);
            }
            for (const h of this.field.haps) {
                if (h.curtain !== k || h.role === 'kick' || !Number.isFinite(h.note)) continue;
                const t = now - h.begin;
                if (t < 0) continue;
                const dur = h.end - h.begin;
                const held = t < dur;
                const amp = (held ? 1 : Math.exp(-(t - dur) * 3)) * clamp01(h.fade) * clamp01(t * 30);
                if (amp < 0.01) continue;
                const spread = 0.03 + 0.5 * Math.min(t, dur + 0.3);
                const lo = Math.max(0, Math.floor((h.u - spread * 2.2) * (COLS - 1)));
                const hi = Math.min(COLS - 1, Math.ceil((h.u + spread * 2.2) * (COLS - 1)));
                for (let i = lo; i <= hi; i++) {
                    const d = (i / (COLS - 1) - h.u) / spread;
                    const w = amp * Math.exp(-d * d);
                    light[i] += w;
                    c.hue[i].lerp(h.team.color, Math.min(1, w * 0.8));
                }
            }
            for (let i = 0; i < COLS; i++) {
                const v = light[i];
                total += v;
                mood.r += c.hue[i].r * v;
                mood.g += c.hue[i].g * v;
                mood.b += c.hue[i].b * v;
            }
            this.shapeCurtain(c, now, high, k);
        }
        const n = Math.max(1e-3, total);
        this.hemi.color.setRGB(mood.r / n, mood.g / n, mood.b / n).multiplyScalar(Math.min(0.6, 0.15 + total / (COLS * 3)));
    }

    private shapeCurtain(c: Curtain, now: number, high: number, k: number): void {
        const {pos, col, light} = c;
        const top = this.tint.copy(this.ink.glow);
        const surge = this.kick;
        for (let i = 0; i < COLS; i++) {
            const u = i / (COLS - 1);
            const x = (u - 0.5) * c.width;
            const fold = Math.sin(u * 9 - now * 1.3 + c.phase) * 3 + Math.sin(u * 2.3 + now * 0.15 + k * 2.1) * 26;
            const z = c.z + fold;
            const flick = high * 0.9 * (rand01(hash32(i * 13 + k, Math.floor(now * 12))) - 0.5);
            const wave = Math.sin(i * 1.9 + now * 3 + c.phase) * Math.sin(i * 0.37 - now * 1.1);
            const ray = 0.55 + 0.45 * wave * wave + flick;
            const l = (1 - Math.exp(-light[i] * 1.3)) * Math.max(0.15, ray);
            const h = c.height * (0.55 + 0.45 * l);
            const hem = c.y + Math.sin(u * 4.3 + now * 0.35 + k * 1.3) * 5 + Math.sin(u * 11 - now * 0.8) * 1.2;
            const hue = c.hue[i];
            for (let j = 0; j < ROWS; j++) {
                const v = j / (ROWS - 1);
                const vi = (j * COLS + i) * 3;
                pos[vi] = x;
                pos[vi + 1] = hem + v * h;
                pos[vi + 2] = z - v * 4;
                // Brightest just above the hem, fading to the violet top.
                const edge = v < 0.12 ? 0.35 + 0.65 * (v / 0.12) : Math.exp(-(v - 0.12) * 2.4);
                const lift = 1 + surge * 0.8 * Math.max(0, 1 - Math.abs(v - surge * 0.9) * 2);
                const b = l * edge * lift * 0.5;
                const m = v * v;
                col[vi] = (hue.r * (1 - m) + top.r * m) * b;
                col[vi + 1] = (hue.g * (1 - m) + top.g * m) * b;
                col[vi + 2] = (hue.b * (1 - m) + top.b * m) * b;
            }
        }
        c.geo.attributes.position.needsUpdate = true;
        c.geo.attributes.color.needsUpdate = true;
    }

    private spawnMeteor(seed: number): void {
        if (this.meteors.length >= MAX_METEORS) return;
        const r = (n: number) => rand01(hash32(seed, n));
        const dir = r(1) < 0.5 ? -1 : 1;
        this.meteors.push({x: (r(2) - 0.5) * 80, y: 45 + r(3) * 25, z: -90, vx: dir * (60 + r(4) * 40), vy: -(20 + r(5) * 20), age: 0});
    }

    private placeMeteors(): void {
        const {meteorPos: pos, meteorCol: col, ink} = this;
        let n = 0;
        for (const m of this.meteors) {
            const fade = 1 - m.age / METEOR_LIFE;
            for (let d = 0; d < METEOR_DOTS; d++) {
                const back = Math.max(0, m.age - d * 0.012);
                pos[n * 3] = m.x + m.vx * back;
                pos[n * 3 + 1] = m.y + m.vy * back;
                pos[n * 3 + 2] = m.z;
                const a = fade * (1 - d / METEOR_DOTS);
                col[n * 3] = ink.snow.r * a;
                col[n * 3 + 1] = ink.snow.g * a;
                col[n * 3 + 2] = ink.snow.b * a;
                n++;
            }
        }
        const geo = this.meteorPts.geometry;
        geo.setDrawRange(0, n);
        geo.attributes.position.needsUpdate = true;
        geo.attributes.color.needsUpdate = true;
    }

    private plantPines(): void {
        const {pines} = this;
        pines.begin();
        for (let i = 0; i < 90; i++) {
            const r = (k: number) => rand01(hash32(i, 600 + k));
            const x = (r(1) - 0.5) * 90;
            const z = -6 - r(2) * 50;
            if (Math.abs(x - 4) < 3 && z > -12) continue;
            pines.add(x, groundHeight(x, z) - 0.1, z, 0.9 + r(3) * 1.6, r(4) * TAU, 0.3 + 0.7 * r(5));
        }
        pines.end();
    }

    private buildCabin(): void {
        const x = 4.5;
        const z = -7;
        const y = groundHeight(x, z);
        const body = new Mesh(new BoxGeometry(3, 1.8, 2.4), this.cabinMat);
        body.position.set(x, y + 0.7, z);
        body.rotation.y = -0.5;
        const roof = new Mesh(new ConeGeometry(2.5, 1.4, 4, 1), this.roofMat);
        roof.position.set(0, 1.55, 0);
        roof.rotation.y = Math.PI / 4;
        roof.scale.set(1, 1, 0.8);
        const win = new Mesh(new PlaneGeometry(0.6, 0.5), this.windowMat);
        win.position.set(0.5, 0.05, 1.21);
        const win2 = new Mesh(new PlaneGeometry(0.6, 0.5), this.windowMat);
        win2.position.set(-0.7, 0.05, 1.21);
        body.add(roof, win, win2);
        this.scene.add(body);
    }
}

function makeCurtain(k: number): Curtain {
    const pos = new Float32Array(COLS * ROWS * 3);
    const col = new Float32Array(COLS * ROWS * 3);
    const geo = new BufferGeometry();
    const index: number[] = [];
    for (let j = 0; j < ROWS - 1; j++) {
        for (let i = 0; i < COLS - 1; i++) {
            const a = j * COLS + i;
            const b = a + 1;
            const c = a + COLS;
            const d = c + 1;
            index.push(a, b, c, c, b, d);
        }
    }
    geo.setIndex(index);
    geo.setAttribute('position', new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage));
    geo.setAttribute('color', new BufferAttribute(col, 3).setUsage(DynamicDrawUsage));
    const hue: Color[] = [];
    for (let i = 0; i < COLS; i++) hue.push(new Color());
    return {geo, pos, col, light: new Float32Array(COLS), hue,
        z: -60 - k * 16, y: 12 + k * 4, height: 22 + k * 6, width: 140 + k * 30, phase: k * 1.7};
}

function makeNote(base: FieldHap<Team>): Note {
    const pitched = Number.isFinite(base.note);
    const r = rand01(hash32(base.seed, 3));
    return {
        ...base,
        role: winterRole(base.team.name, base.note),
        u: pitched ? clamp01(0.08 + 0.84 * (base.note - 30) / 66 + (r - 0.5) * 0.08) : 0.5,
        curtain: base.team.slot % CURTAINS,
    };
}

/** The ridge: a slope rising toward the camera, a dip, far hills. */
function groundHeight(x: number, z: number): number {
    const near = clamp01((z + 30) / 40);
    return -1.5 + near * 2.2 + Math.sin(x * 0.11 + 1) * 1.6 * (1 - near) + Math.sin(x * 0.31 + z * 0.2) * 0.5;
}

function groundGeometry(): BufferGeometry {
    const g = new PlaneGeometry(200, 120, 48, 30);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, -45);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const bump = (rand01(hash32(Math.round(x * 4), Math.round(z * 4))) - 0.5) * 0.5;
        pos.setY(i, groundHeight(x, z) + bump);
    }
    g.setAttribute('color', new BufferAttribute(new Float32Array(pos.count * 3), 3));
    return g;
}

function paintGround(g: BufferGeometry, ink: Ink): void {
    const pos = g.attributes.position;
    const col = g.attributes.color;
    const c = new Color();
    for (let i = 0; i < pos.count; i++) {
        const v = 0.75 + 0.25 * rand01(hash32(i, 41));
        c.copy(ink.snow).lerp(ink.frost, 0.3).multiplyScalar(v);
        col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
}

export const auroraDef: VizModeDef = {
    id: 'aurora',
    name: 'AURORA',
    create: () => new AuroraMode(),
};
