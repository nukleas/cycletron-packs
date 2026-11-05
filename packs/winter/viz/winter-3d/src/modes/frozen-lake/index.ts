/**
 * FROZEN LAKE — night on a frozen lake between pine shores, the camera low
 * over the ice. Every pitched track is a crack in its own colour, and every
 * note pushes it on: the crack turns with the melody (a step up bends it
 * left, a step down right, a leap bends it hard), a note's length is how far
 * it runs, and the new stretch splits open across the note and glows before
 * it cools to a pale scar. Notes struck together fork it. Held notes well up
 * as light under the ice at the crack's tip. Kicks send a shock ring across
 * the ice, snares splinter a star of hairline cracks, hats glint on the
 * surface. The camera drifts after the cracks.
 */

import type {VizMode, VizModeDef, VizServices} from '@cycletron/viz-sdk';
import {type FieldHap, type FieldTeam, HapField} from '@cycletron/viz-sdk';
import {clamp01, follow, hash32, rand01, TAU} from '@cycletron/viz-sdk';
import {drawScene, setRgb} from '@naderlabs/kit/gl';
import {isLong, type Role} from '@naderlabs/kit/roles';
import {
    AdditiveBlending, AmbientLight, BufferAttribute, BufferGeometry, CircleGeometry, Color, ConeGeometry,
    DirectionalLight, DynamicDrawUsage, Fog, InstancedMesh, Mesh, MeshBasicMaterial, MeshLambertMaterial,
    MeshStandardMaterial, Object3D, PerspectiveCamera, PlaneGeometry, Points, PointsMaterial, RingGeometry, Scene,
    Vector3,
} from 'three';
import {dotTexture} from '../../lib/dot.js';
import {Ink} from '../../lib/ink.js';
import {Pines} from '../../lib/pines.js';
import {winterRole} from '../../lib/roles.js';
import {NightSky} from '../../lib/sky.js';

const LOOKAHEAD = 1;
const MAX_HAPS = 220;
const MAX_PER_TRACK = 40;
const DRUM_CAP = 16;
const IDLE_RATE = 0.25;
const MAX_SEGS = 1400;
const MAX_POOLS = 10;
const MAX_RINGS = 6;
const RING_LIFE = 0.9;
const MAX_GLINTS = 40;
const GLINT_LIFE = 0.35;
const CAM_HEIGHT = 1.4;
const CAM_BACK = 7.5;
/** How far the cracks may wander from the camera's line, sideways. */
const LANE = 5.5;
const SHORE = 26;
const PINE_CELL = 2.2;
const PINE_RANGE = 70;
const PATCH_CELL = 5;
const PATCH_RANGE = 8;
const MAX_PATCHES = (PATCH_RANGE * 2 + 1) * (PATCH_RANGE + 2);
const SKY_RADIUS = 150;
const SHORES = [-1, 1];

interface Team extends FieldTeam {
    /** The crack's tip, its heading (0 is straight ahead) and the last note and onset it took. */
    x: number;
    z: number;
    heading: number;
    lastNote: number;
    lastBegin: number;
    /** Where the last stretch started, for forks off it. */
    px: number;
    pz: number;
    started: boolean;
    lastSeen: number;
    /** The track colour as a three.js colour, refreshed every frame. */
    color: Color;
}

interface Note extends FieldHap<Team> {
    role: Role;
}

interface Seg {
    x0: number;
    z0: number;
    x1: number;
    z1: number;
    begin: number;
    /** Bars the stretch takes to open. */
    open: number;
    width: number;
    color: Color;
    /** 1 for a track's crack, less for splinters. */
    heat: number;
}

interface Pool {
    x: number;
    z: number;
    begin: number;
    end: number;
    color: Color;
}

interface Ring {
    x: number;
    z: number;
    age: number;
}

interface Glint {
    x: number;
    z: number;
    age: number;
}

class FrozenLakeMode implements VizMode {
    private readonly ink = new Ink();
    private readonly scene = new Scene();
    private readonly camera = new PerspectiveCamera(55, 16 / 9, 0.1, 400);
    private readonly air = new Color();
    private readonly fog = new Fog(0x000000, 20, 110);
    private readonly field = new HapField<Team, Note>({
        lookahead: LOOKAHEAD,
        maxHaps: MAX_HAPS,
        maxPerTrack: MAX_PER_TRACK,
        idleRate: IDLE_RATE,
        team: (base) => ({...base, x: 0, z: 0, heading: 0, lastNote: NaN, lastBegin: -1, px: 0, pz: 0, started: false, lastSeen: -99, color: new Color()}),
        hap: (base) => ({...base, role: winterRole(base.team.name, base.note)}),
        cap: (_team, note) => (Number.isFinite(note) ? Infinity : DRUM_CAP),
        keep: (h, cycle) => h.end + 0.05 >= cycle,
    });

    private readonly ice: Mesh;
    private readonly iceMat = new MeshStandardMaterial({roughness: 0.5, metalness: 0.2});
    private readonly patches: InstancedMesh;
    private readonly patchMat = new MeshLambertMaterial({flatShading: true});
    private readonly pines = new Pines(260);
    private readonly hills: InstancedMesh;
    private readonly hillMat = new MeshLambertMaterial({flatShading: true, fog: false});
    private readonly sky = new NightSky(500, SKY_RADIUS, 0.03, 4242);
    private readonly sheen: Mesh;
    private readonly sheenMat = new MeshBasicMaterial({blending: AdditiveBlending, transparent: true, depthWrite: false, fog: false});

    private readonly crackGeo = new BufferGeometry();
    private readonly crackPos = new Float32Array(MAX_SEGS * 8 * 3);
    private readonly crackCol = new Float32Array(MAX_SEGS * 8 * 3);
    private readonly crackMat = new MeshBasicMaterial({vertexColors: true, blending: AdditiveBlending, transparent: true,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2});
    private readonly segs: Seg[] = [];
    private segHead = 0;

    private readonly poolMeshes: Mesh[] = [];
    private readonly poolMats: MeshBasicMaterial[] = [];
    private readonly pools: Pool[] = [];
    private readonly ringMeshes: Mesh[] = [];
    private readonly ringMats: MeshBasicMaterial[] = [];
    private readonly rings: Ring[] = [];
    private readonly glintList: Glint[] = [];
    private readonly glints: Points;
    private readonly glintPos = new Float32Array(MAX_GLINTS * 3);
    private readonly glintCol = new Float32Array(MAX_GLINTS * 3);

    private readonly ambient = new AmbientLight(0xffffff, 1);
    private readonly moonLight = new DirectionalLight(0xffffff, 1.5);
    private readonly moonDir = new Vector3(-0.35, 0.32, -1).normalize();
    private readonly dummy = new Object3D();
    private readonly tint = new Color();
    private readonly center = new Vector3();
    private camX = 0;
    private camZ = 0;
    private kick = 0;
    private lastIdle = -1;

    constructor() {
        const {scene} = this;
        scene.background = this.air;
        scene.fog = this.fog;

        const plane = new PlaneGeometry(600, 600, 1, 1);
        plane.rotateX(-Math.PI / 2);
        this.ice = new Mesh(plane, this.iceMat);
        scene.add(this.ice);

        const disc = new CircleGeometry(1, 7);
        disc.rotateX(-Math.PI / 2);
        this.patches = new InstancedMesh(disc, this.patchMat, MAX_PATCHES);
        this.patches.frustumCulled = false;
        for (let i = 0; i < MAX_PATCHES; i++) this.patches.setColorAt(i, this.tint.setRGB(1, 1, 1));
        scene.add(this.patches);

        this.hills = new InstancedMesh(new ConeGeometry(1, 1, 6, 1), this.hillMat, 14);
        this.hills.frustumCulled = false;
        scene.add(this.hills, this.pines.mesh, this.sky.group);
        this.sky.placeMoon(this.moonDir, SKY_RADIUS);

        const sheenGeo = new PlaneGeometry(1, 1);
        sheenGeo.rotateX(-Math.PI / 2);
        this.sheenMat.map = dotTexture(0);
        this.sheen = new Mesh(sheenGeo, this.sheenMat);
        this.sheen.renderOrder = 1;
        scene.add(this.sheen);

        const quads = MAX_SEGS * 2;
        const index = new Uint16Array(quads * 6);
        for (let q = 0; q < quads; q++) index.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4 + 2, q * 4 + 1, q * 4 + 3], q * 6);
        this.crackGeo.setIndex(new BufferAttribute(index, 1));
        this.crackGeo.setAttribute('position', new BufferAttribute(this.crackPos, 3).setUsage(DynamicDrawUsage));
        this.crackGeo.setAttribute('color', new BufferAttribute(this.crackCol, 3).setUsage(DynamicDrawUsage));
        const cracks = new Mesh(this.crackGeo, this.crackMat);
        cracks.frustumCulled = false;
        cracks.renderOrder = 3;
        scene.add(cracks);

        const dot = dotTexture(0);
        for (let i = 0; i < MAX_POOLS; i++) {
            const mat = new MeshBasicMaterial({map: dot, blending: AdditiveBlending, transparent: true, depthWrite: false});
            const m = new Mesh(sheenGeo, mat);
            m.renderOrder = 2;
            m.visible = false;
            this.poolMats.push(mat);
            this.poolMeshes.push(m);
            scene.add(m);
        }
        const ringGeo = new RingGeometry(0.92, 1, 40, 1);
        ringGeo.rotateX(-Math.PI / 2);
        for (let i = 0; i < MAX_RINGS; i++) {
            const mat = new MeshBasicMaterial({blending: AdditiveBlending, transparent: true, depthWrite: false});
            const m = new Mesh(ringGeo, mat);
            m.renderOrder = 2;
            m.visible = false;
            this.ringMats.push(mat);
            this.ringMeshes.push(m);
            scene.add(m);
        }

        const g = new BufferGeometry();
        g.setAttribute('position', new BufferAttribute(this.glintPos, 3));
        g.setAttribute('color', new BufferAttribute(this.glintCol, 3));
        this.glints = new Points(g, new PointsMaterial({size: 0.35, map: dot, vertexColors: true, blending: AdditiveBlending,
            transparent: true, depthWrite: false}));
        this.glints.frustumCulled = false;
        this.glints.renderOrder = 4;
        scene.add(this.glints);

        this.moonLight.position.copy(this.moonDir).multiplyScalar(50);
        scene.add(this.ambient, this.moonLight, this.moonLight.target);
    }

    layout(s: VizServices): void {
        const {ink} = this;
        ink.bake(s.theme);
        this.air.copy(ink.bg).lerp(ink.deep, 0.25);
        this.fog.color.copy(this.air);
        this.iceMat.color.copy(ink.deep).lerp(ink.bg, 0.45);
        this.iceMat.emissive.copy(ink.bg).multiplyScalar(0.4);
        this.patchMat.color.copy(ink.snow).multiplyScalar(0.7);
        this.hillMat.color.copy(ink.deep).lerp(ink.bg, 0.55);
        this.pines.paint(this.tint.copy(ink.deep).lerp(ink.bg, 0.7), ink.snow, ink.bg);
        this.sky.paint(ink);
        this.sheenMat.color.copy(ink.frost).multiplyScalar(0.07);
        this.ambient.color.copy(ink.deep).lerp(ink.frost, 0.3);
        this.ambient.intensity = 0.9;
        this.moonLight.color.copy(ink.frost).lerp(ink.snow, 0.5);
        for (const m of this.ringMats) m.color.copy(ink.ice);
        this.camera.aspect = s.width / Math.max(1, s.height);
        this.camera.updateProjectionMatrix();
        this.placeHills();
        this.field.invalidate();
    }

    update(dt: number, s: VizServices): void {
        const field = this.field;
        field.update(dt, s);
        if (field.restarted) {
            this.segs.length = 0;
            this.segHead = 0;
            this.pools.length = 0;
            this.rings.length = 0;
            this.glintList.length = 0;
            this.kick = 0;
            for (const t of field.teams) t.started = false;
        }
        for (const t of field.teams) setRgb(t.color, t.rgb);
        const now = field.cycle;
        let hats = 0;
        for (const h of field.haps) {
            if (!field.crossed(h)) continue;
            h.done = true;
            h.team.activity = 1;
            switch (h.role) {
                case 'bass':
                case 'mid':
                case 'lead':
                    this.extend(h);
                    break;
                case 'kick':
                    this.kick = 1;
                    this.spawnRing();
                    break;
                case 'snare':
                case 'crash':
                case 'tom':
                    this.splinter(h.seed);
                    break;
                case 'hat':
                case 'perc':
                    if (hats++ < 2) this.spawnGlint(h.seed);
                    break;
                default:
                    break;
            }
        }
        if (!field.locked) this.idle(now);
        this.kick *= Math.exp(-dt * 6);
        age(this.rings, dt, RING_LIFE);
        age(this.glintList, dt, GLINT_LIFE);

        this.follow(dt, now);
        this.writeCracks(now);
        this.placePools(now);
        this.placeRings();
        this.placeGlints();
        this.placeScenery(now);
    }

    render(ctx: CanvasRenderingContext2D, s: VizServices): void {
        drawScene(ctx, this.scene, this.camera, s.width, s.height, s.dpr);
    }

    /** Push a track's crack on by one note. */
    private extend(h: Note): void {
        const t = h.team;
        const r = (n: number) => rand01(hash32(h.seed, n));
        const dur = h.end - h.begin;
        const width = h.role === 'bass' ? 0.042 : h.role === 'mid' ? 0.032 : 0.024;
        if (!t.started) {
            t.started = true;
            t.x = ((t.slot % 5) - 2) * LANE * 0.3 + (r(1) - 0.5) * 2;
            t.z = this.camZ - CAM_BACK - 3 - r(2) * 5;
            t.heading = (r(3) - 0.5) * 1.2;
            t.lastNote = h.note;
            t.lastBegin = -1;
            this.splinter(h.seed);
        }
        const color = t.color;
        if (Math.abs(h.begin - t.lastBegin) < 1e-4) {
            // Struck with the last note: a fork off the last stretch.
            const turn = (h.note - t.lastNote) * 0.05 + (r(4) < 0.5 ? -0.7 : 0.7);
            const len = 0.5 + 1.1 * Math.sqrt(Math.min(dur, 2));
            const a = t.heading + turn;
            this.addSeg(t.px, t.pz, t.px + Math.sin(a) * len, t.pz - Math.cos(a) * len, h.begin, dur, width * 0.7, color, 0.8);
            return;
        }
        const step = Math.max(-12, Math.min(12, h.note - t.lastNote));
        t.heading -= step * 0.07 + (r(5) - 0.5) * 0.25;
        // Lean back toward the track's lane so the cracks stay in view.
        const lane = ((t.slot % 5) - 2) * LANE * 0.3;
        t.heading -= Math.max(-1, Math.min(1, (t.x - lane) / LANE)) * 0.4;
        t.heading = Math.max(-1.1, Math.min(1.1, t.heading));
        const len = 0.6 + 2.4 * Math.sqrt(Math.min(dur, 2));
        const x1 = t.x + Math.sin(t.heading) * len;
        const z1 = t.z - Math.cos(t.heading) * len;
        this.addSeg(t.x, t.z, x1, z1, h.begin, dur, width, color, 1);
        t.px = t.x;
        t.pz = t.z;
        t.x = x1;
        t.z = z1;
        t.lastNote = h.note;
        t.lastBegin = h.begin;
        t.lastSeen = h.begin;
        if (isLong(h.begin, h.end)) this.spawnPool(x1, z1, h.begin, h.end, color);
    }

    private addSeg(x0: number, z0: number, x1: number, z1: number, begin: number, dur: number, width: number, color: Color, heat: number): void {
        const seg = {x0, z0, x1, z1, begin, open: Math.max(0.04, Math.min(dur, 0.5)), width, color, heat};
        if (this.segs.length < MAX_SEGS) this.segs.push(seg);
        else this.segs[this.segHead] = seg;
        this.segHead = (this.segHead + 1) % MAX_SEGS;
    }

    /** A star of hairline cracks around the busiest crack's tip. */
    private splinter(seed: number): void {
        const tip = this.liveTip();
        const r = (n: number) => rand01(hash32(seed, n));
        const x = tip ? tip.x : this.camX + (r(1) - 0.5) * 6;
        const z = tip ? tip.z : this.camZ - CAM_BACK - 4;
        const arms = 5 + Math.floor(r(2) * 3);
        for (let k = 0; k < arms; k++) {
            const a = (k / arms) * TAU + r(3 + k) * 0.6;
            const len = 0.4 + r(10 + k) * 0.9;
            this.addSeg(x, z, x + Math.sin(a) * len, z - Math.cos(a) * len, this.field.cycle, 0.05, 0.018, this.ink.snow, 0.6);
        }
    }

    private liveTip(): Team | null {
        let best: Team | null = null;
        for (const t of this.field.teams) {
            if (t.started && (!best || t.lastSeen > best.lastSeen)) best = t;
        }
        return best;
    }

    private spawnPool(x: number, z: number, begin: number, end: number, color: Color): void {
        if (this.pools.length >= MAX_POOLS) this.pools.shift();
        this.pools.push({x, z, begin, end, color});
    }

    private spawnRing(): void {
        const tip = this.liveTip();
        if (this.rings.length >= MAX_RINGS) this.rings.shift();
        this.rings.push({x: tip ? tip.x : this.camX, z: tip ? tip.z : this.camZ - CAM_BACK, age: 0});
    }

    private spawnGlint(seed: number): void {
        if (this.glintList.length >= MAX_GLINTS) return;
        const r = (n: number) => rand01(hash32(seed, n));
        this.glintList.push({x: this.camX + (r(1) - 0.5) * 10, z: this.camZ - 2 - r(2) * 12, age: 0});
    }

    /** With no music, a lone crack creeps on every half bar. */
    private idle(now: number): void {
        const tick = Math.floor(now * 2);
        if (tick === this.lastIdle) return;
        this.lastIdle = tick;
        const seed = hash32(tick, 77);
        const r = (n: number) => rand01(hash32(seed, n));
        const tip = this.segs.length > 0 ? this.segs[(this.segHead + MAX_SEGS - 1) % MAX_SEGS] : null;
        const x0 = tip && tip.z1 < this.camZ - 3 ? tip.x1 : this.camX;
        const z0 = tip && tip.z1 < this.camZ - 3 ? tip.z1 : this.camZ - CAM_BACK;
        const a = (r(1) - 0.5) * 1.6 - Math.max(-1, Math.min(1, x0 / LANE));
        const len = 0.8 + r(2) * 1.6;
        this.addSeg(x0, z0, x0 + Math.sin(a) * len, z0 - Math.cos(a) * len, now, 0.4, 0.04, this.ink.ice, 0.7);
    }

    /** The camera follows the cracks that played in the last two bars, and never stops gliding. */
    private follow(dt: number, now: number): void {
        let sx = 0;
        let sz = 0;
        let n = 0;
        for (const t of this.field.teams) {
            if (!t.started || now - t.lastSeen > 2) continue;
            sx += t.x;
            sz += t.z;
            n++;
        }
        const glide = this.camZ - dt * 1.2;
        const targetZ = n > 0 ? Math.min(glide, sz / n + CAM_BACK) : glide;
        const targetX = n > 0 ? Math.max(-LANE, Math.min(LANE, sx / n)) : 0;
        this.camZ = follow(this.camZ, targetZ, dt, 1.2, 1.2);
        this.camX = follow(this.camX, targetX, dt, 0.6, 0.6);
        // Tracks that fell behind the camera start again ahead of it.
        for (const t of this.field.teams) {
            if (t.started && t.z > this.camZ - 2.5) t.started = false;
        }
        const bump = this.kick * 0.06;
        const sway = Math.sin(now * TAU / 9) * 0.25;
        this.camera.position.set(this.camX + sway, CAM_HEIGHT - bump, this.camZ);
        this.camera.lookAt(this.camX + sway * 0.5, 0.15, this.camZ - 30);
        this.camera.rotateZ(Math.sin(now * TAU / 13) * 0.02);
    }

    private writeCracks(now: number): void {
        const {crackPos: pos, crackCol: col, tint, ink} = this;
        let q = 0;
        for (const s of this.segs) {
            const t = now - s.begin;
            if (t < 0) continue;
            const p = clamp01(t / s.open);
            const x1 = s.x0 + (s.x1 - s.x0) * p;
            const z1 = s.z0 + (s.z1 - s.z0) * p;
            const dx = x1 - s.x0;
            const dz = z1 - s.z0;
            const len = Math.hypot(dx, dz) || 1;
            const nx = -dz / len;
            const nz = dx / len;
            // Hot while opening, cooling to a scar over two bars.
            const heat = s.heat * (t < s.open ? 1 : Math.exp(-(t - s.open) * 1.4));
            tint.copy(ink.frost).multiplyScalar(0.28).lerp(s.color, Math.min(1, heat * 1.2)).multiplyScalar(0.5 + 0.9 * heat);
            quad(pos, col, q++, s.x0, s.z0, x1, z1, nx * s.width, nz * s.width, 0.012, tint, tint);
            const halo = s.width * (2 + 3 * heat);
            tint.copy(s.color).multiplyScalar(0.06 + 0.4 * heat);
            quad(pos, col, q++, s.x0, s.z0, x1, z1, nx * halo, nz * halo, 0.008, tint, tint);
        }
        this.crackGeo.setDrawRange(0, q * 6);
        this.crackGeo.attributes.position.needsUpdate = true;
        this.crackGeo.attributes.color.needsUpdate = true;
    }

    private placePools(now: number): void {
        for (let i = 0; i < MAX_POOLS; i++) {
            const m = this.poolMeshes[i];
            const p = i < this.pools.length ? this.pools[i] : null;
            if (!p || now < p.begin) {
                m.visible = false;
                continue;
            }
            const held = now < p.end;
            const a = held ? clamp01((now - p.begin) * 6) : Math.exp(-(now - p.end) * 2);
            m.visible = a > 0.01;
            m.position.set(p.x, 0.005, p.z);
            m.scale.setScalar(2.5 + 3 * a + Math.min(2, p.end - p.begin));
            this.poolMats[i].color.copy(p.color).multiplyScalar(0.55 * a);
        }
    }

    private placeRings(): void {
        for (let i = 0; i < MAX_RINGS; i++) {
            const m = this.ringMeshes[i];
            const r = i < this.rings.length ? this.rings[i] : null;
            m.visible = r !== null;
            if (!r) continue;
            const t = r.age / RING_LIFE;
            m.position.set(r.x, 0.02, r.z);
            m.scale.set(0.5 + t * 9, 1, 0.5 + t * 9);
            this.ringMats[i].opacity = (1 - t) * 0.8;
        }
    }

    private placeGlints(): void {
        const {glintPos, glintCol, ink} = this;
        let n = 0;
        for (const g of this.glintList) {
            const t = g.age / GLINT_LIFE;
            const a = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
            glintPos[n * 3] = g.x;
            glintPos[n * 3 + 1] = 0.05;
            glintPos[n * 3 + 2] = g.z;
            glintCol[n * 3] = ink.snow.r * a;
            glintCol[n * 3 + 1] = ink.snow.g * a;
            glintCol[n * 3 + 2] = ink.snow.b * a;
            n++;
        }
        const geo = this.glints.geometry;
        geo.setDrawRange(0, n);
        geo.attributes.position.needsUpdate = true;
        geo.attributes.color.needsUpdate = true;
    }

    /** Ice, snow patches, the shores and the sky, all around the camera. */
    private placeScenery(now: number): void {
        const {camX, camZ, dummy, tint} = this;
        this.ice.position.set(camX, 0, camZ);
        this.center.set(camX, 0, camZ);
        this.sky.update(now, 0.35, this.center);
        this.hills.position.set(camX, 0, camZ);
        this.sheen.position.set(camX + this.moonDir.x * 40, 0.003, camZ + this.moonDir.z * 40);
        this.sheen.scale.set(2.6, 1, 46);
        this.sheen.rotation.y = Math.atan2(this.moonDir.x, this.moonDir.z);

        let n = 0;
        const cx = Math.floor(camX / PATCH_CELL);
        const cz = Math.floor(camZ / PATCH_CELL);
        for (let j = -PATCH_RANGE; j <= 1; j++) {
            for (let i = -PATCH_RANGE; i <= PATCH_RANGE; i++) {
                const seed = hash32((cx + i) * 7919, cz + j);
                const r = (k: number) => rand01(hash32(seed, k));
                if (r(1) > 0.45) continue;
                dummy.position.set((cx + i + r(2)) * PATCH_CELL, 0.004, (cz + j + r(3)) * PATCH_CELL);
                dummy.rotation.set(0, r(4) * TAU, 0);
                dummy.scale.set(0.6 + r(5) * 2.2, 1, 0.3 + r(6) * 1.2);
                dummy.updateMatrix();
                this.patches.setMatrixAt(n, dummy.matrix);
                const v = 0.5 + 0.5 * r(7);
                this.patches.setColorAt(n, tint.setRGB(v, v, v));
                n++;
            }
        }
        this.patches.count = n;
        this.patches.instanceMatrix.needsUpdate = true;
        if (this.patches.instanceColor) this.patches.instanceColor.needsUpdate = true;

        // Two shores of pines at fixed places in the world, so they slide past.
        this.pines.begin();
        const first = Math.floor((camZ - PINE_RANGE) / PINE_CELL);
        const last = Math.floor((camZ + 6) / PINE_CELL);
        for (let c = first; c <= last; c++) {
            for (const side of SHORES) {
                const seed = hash32(c, side + 5);
                const r = (k: number) => rand01(hash32(seed, k));
                const x = side * (SHORE + r(1) * 7) + Math.sin(c * 0.07) * 6;
                this.pines.add(x, -0.2, (c + r(2)) * PINE_CELL, 1.4 + r(3) * 1.8, r(4) * TAU, r(5));
                if (r(6) < 0.6) this.pines.add(x + side * (3 + r(7) * 4), -0.2, (c + r(8)) * PINE_CELL, 1.8 + r(9) * 2, r(10) * TAU, 0.4 + 0.6 * r(11));
            }
        }
        this.pines.end();
    }

    /** Far mountains, fixed to the camera: too far off to parallax. */
    private placeHills(): void {
        const {dummy} = this;
        for (let i = 0; i < 14; i++) {
            const r = (k: number) => rand01(hash32(i, 300 + k));
            const a = -Math.PI / 2 + (i / 13 - 0.5) * 2.6 + (r(1) - 0.5) * 0.15;
            const dist = 150 + r(2) * 40;
            dummy.position.set(Math.cos(a) * dist, -2, Math.sin(a) * dist);
            dummy.rotation.set(0, r(3) * TAU, 0);
            const h = 18 + r(4) * 26;
            dummy.scale.set(h * (1 + r(5)), h, h * (1 + r(5)));
            dummy.position.y = h / 2 - 2;
            dummy.updateMatrix();
            this.hills.setMatrixAt(i, dummy.matrix);
        }
        this.hills.instanceMatrix.needsUpdate = true;
    }
}

/** Write one flat quad from (x0, z0) to (x1, z1), `(nx, nz)` its half-width, into slot `q`. */
function quad(pos: Float32Array, col: Float32Array, q: number, x0: number, z0: number, x1: number, z1: number,
    nx: number, nz: number, y: number, c0: Color, c1: Color): void {
    const v = q * 4 * 3;
    pos[v] = x0 - nx; pos[v + 1] = y; pos[v + 2] = z0 - nz;
    pos[v + 3] = x0 + nx; pos[v + 4] = y; pos[v + 5] = z0 + nz;
    pos[v + 6] = x1 - nx; pos[v + 7] = y; pos[v + 8] = z1 - nz;
    pos[v + 9] = x1 + nx; pos[v + 10] = y; pos[v + 11] = z1 + nz;
    for (let k = 0; k < 4; k++) {
        const c = k < 2 ? c0 : c1;
        col[v + k * 3] = c.r;
        col[v + k * 3 + 1] = c.g;
        col[v + k * 3 + 2] = c.b;
    }
}

function age<T extends {age: number}>(list: T[], dt: number, life: number): void {
    for (let i = list.length - 1; i >= 0; i--) {
        list[i].age += dt;
        if (list[i].age >= life) list.splice(i, 1);
    }
}

export const frozenLakeDef: VizModeDef = {
    id: 'frozen-lake',
    name: 'FROZEN LAKE',
    create: () => new FrozenLakeMode(),
};
