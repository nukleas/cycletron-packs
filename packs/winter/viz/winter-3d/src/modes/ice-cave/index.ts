/**
 * ICE CAVE — a slow flight down a tunnel of ice, where distance is musical
 * time. Every note is a crystal on the cave wall, placed at its onset three
 * bars ahead as a bud: pitch is how high up the wall it sits (bass on the
 * floor, leads on the ceiling), length is its size, so held chords grow the
 * big crystals. A crystal shoots to full size as it reaches the ring of
 * light that marks now, glows in its track's colour while the note sounds,
 * then cools as it drifts past. Kicks flash the ring and its light, snares
 * shake shards loose from the ceiling, hats glint on the walls.
 */

import type {VizMode, VizModeDef, VizServices} from '@cycletron/viz-sdk';
import {type FieldHap, type FieldTeam, HapField} from '@cycletron/viz-sdk';
import {clamp01, hash32, rand01, TAU} from '@cycletron/viz-sdk';
import {drawScene, setRgb} from '@naderlabs/kit/gl';
import {type Role} from '@naderlabs/kit/roles';
import {
    AdditiveBlending, AmbientLight, BackSide, BufferAttribute, BufferGeometry, Color, CylinderGeometry, Fog,
    InstancedMesh, LatheGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, OctahedronGeometry,
    PerspectiveCamera, PointLight, Points, PointsMaterial, Scene, TorusGeometry, Vector2, Vector3,
} from 'three';
import {dotTexture} from '../../lib/dot.js';
import {Ink} from '../../lib/ink.js';
import {winterRole} from '../../lib/roles.js';

/** World units per bar along the tunnel. */
const D = 9;
/** The camera sits this far behind the ring that marks now. */
const BACK = 6.5;
const LOOKAHEAD = 3;
const R = 4.6;
const FLOOR = -0.62 * R;
const SEG_RINGS = 6;
const SEG_SIDES = 13;
const SEG_VARIANTS = 3;
const SEGS_BEHIND = 1;
const SEGS_AHEAD = 4;
const DECOR_PER_SEG = 9;
const MAX_GHOSTS = 200;
const MAX_CRYSTALS = MAX_GHOSTS + (SEGS_BEHIND + SEGS_AHEAD + 1) * DECOR_PER_SEG;
const MAX_PER_TRACK = 40;
const DRUM_CAP = 16;
const IDLE_RATE = 0.25;
const MAX_SHARDS = 24;
const MAX_GLINTS = 48;
const GLINT_LIFE = 0.4;
const GROW = 0.07;

interface Team extends FieldTeam {}

interface Crystal extends FieldHap<Team> {
    role: Role;
    theta: number;
    tiltA: number;
    tiltB: number;
    spin: number;
    size: number;
}

interface Shard {
    x: number;
    y: number;
    z: number;
    vy: number;
    spin: number;
    age: number;
}

interface Glint {
    x: number;
    y: number;
    z: number;
    age: number;
}

const UP = new Vector3(0, 1, 0);

class IceCaveMode implements VizMode {
    private readonly ink = new Ink();
    private readonly scene = new Scene();
    private readonly camera = new PerspectiveCamera(62, 16 / 9, 0.1, 60);
    private readonly fog = new Fog(0x000000, 7, 34);
    private readonly air = new Color();
    private readonly field = new HapField<Team, Crystal>({
        lookahead: LOOKAHEAD,
        maxHaps: MAX_GHOSTS,
        maxPerTrack: MAX_PER_TRACK,
        idleRate: IDLE_RATE,
        team: (base) => base,
        hap: (base) => makeCrystal(base),
        cap: (_team, note) => (Number.isFinite(note) ? Infinity : DRUM_CAP),
        keep: (h, cycle) => (h.begin - cycle) * D < BACK + 2,
    });

    private readonly walls: Mesh[] = [];
    private readonly wallGeos: BufferGeometry[] = [];
    private readonly wallMat = new MeshStandardMaterial({flatShading: true, side: BackSide, vertexColors: true, roughness: 0.9});
    private readonly bodies: InstancedMesh;
    private readonly shells: InstancedMesh;
    private readonly bodyMat = new MeshStandardMaterial({flatShading: true, roughness: 0.3, metalness: 0.05});
    private readonly shellMat = new MeshBasicMaterial({blending: AdditiveBlending, transparent: true, depthWrite: false});
    private readonly ring: Mesh;
    private readonly ringMat = new MeshBasicMaterial({blending: AdditiveBlending, transparent: true, depthWrite: false});
    private readonly shards: InstancedMesh;
    private readonly shardMat = new MeshStandardMaterial({flatShading: true, roughness: 0.2});
    private readonly glints: Points;
    private readonly glintPos = new Float32Array(MAX_GLINTS * 3);
    private readonly glintCol = new Float32Array(MAX_GLINTS * 3);
    private readonly ambient = new AmbientLight(0xffffff, 1);
    private readonly lamp = new PointLight(0xffffff, 30, 0, 1.6);
    private readonly nowLight = new PointLight(0xffffff, 20, 0, 1.6);

    private readonly shardList: Shard[] = [];
    private readonly glintList: Glint[] = [];
    private readonly dummy = new Object3D();
    private readonly dir = new Vector3();
    private readonly tint = new Color();
    private readonly tint2 = new Color();
    private kick = 0;
    private snap = 0;

    constructor() {
        const {scene} = this;
        scene.fog = this.fog;
        scene.background = this.air;
        for (let v = 0; v < SEG_VARIANTS; v++) this.wallGeos.push(wallGeometry(v));
        for (let i = 0; i < SEGS_BEHIND + SEGS_AHEAD + 1; i++) {
            const m = new Mesh(this.wallGeos[0], this.wallMat);
            this.walls.push(m);
            scene.add(m);
        }
        const crystal = new LatheGeometry([new Vector2(0, -0.25), new Vector2(0.3, 0), new Vector2(0.33, 0.7), new Vector2(0, 1)], 6);
        this.bodies = instanced(crystal, this.bodyMat, MAX_CRYSTALS);
        this.shells = instanced(crystal, this.shellMat, MAX_CRYSTALS);
        this.shells.renderOrder = 2;
        scene.add(this.bodies, this.shells);

        this.ring = new Mesh(new TorusGeometry(R * 0.86, 0.035, 4, 48), this.ringMat);
        this.ring.renderOrder = 3;
        scene.add(this.ring);

        this.shards = instanced(new OctahedronGeometry(0.16, 0), this.shardMat, MAX_SHARDS);
        scene.add(this.shards);

        const g = new BufferGeometry();
        g.setAttribute('position', new BufferAttribute(this.glintPos, 3));
        g.setAttribute('color', new BufferAttribute(this.glintCol, 3));
        this.glints = new Points(g, new PointsMaterial({size: 0.5, map: dotTexture(0.3), vertexColors: true,
            blending: AdditiveBlending, transparent: true, depthWrite: false}));
        this.glints.frustumCulled = false;
        this.glints.renderOrder = 4;
        scene.add(this.glints);

        scene.add(this.ambient, this.lamp, this.nowLight);
    }

    layout(s: VizServices): void {
        const {ink} = this;
        ink.bake(s.theme);
        this.air.copy(ink.bg).lerp(ink.deep, 0.3);
        this.fog.color.copy(this.air);
        for (const g of this.wallGeos) paintWall(g, ink);
        this.bodyMat.emissive.copy(ink.deep).multiplyScalar(0.25);
        this.shardMat.color.copy(ink.snow);
        this.shardMat.emissive.copy(ink.ice).multiplyScalar(0.3);
        this.ambient.color.copy(ink.deep).lerp(ink.ice, 0.3);
        this.ambient.intensity = 0.7;
        this.lamp.color.copy(ink.snow);
        this.nowLight.color.copy(ink.ice);
        this.ringMat.color.copy(ink.ice);
        this.camera.aspect = s.width / Math.max(1, s.height);
        this.camera.updateProjectionMatrix();
        this.field.invalidate();
    }

    update(dt: number, s: VizServices): void {
        const field = this.field;
        field.update(dt, s);
        if (field.restarted) {
            this.shardList.length = 0;
            this.glintList.length = 0;
            this.kick = 0;
            this.snap = 0;
        }
        const now = field.cycle;
        let hats = 0;
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
                case 'tom':
                    this.snap = 1;
                    this.spawnShard(h.seed, now);
                    break;
                case 'hat':
                case 'perc':
                    if (hats++ < 2) this.spawnGlint(h.seed, now);
                    break;
                default:
                    break;
            }
        }
        this.kick *= Math.exp(-dt * 7);
        this.snap *= Math.exp(-dt * 6);

        for (let i = this.shardList.length - 1; i >= 0; i--) {
            const sh = this.shardList[i];
            sh.age += dt;
            sh.vy -= 22 * dt;
            sh.y += sh.vy * dt;
            if (sh.y < FLOOR + 0.1) this.shardList.splice(i, 1);
        }
        for (let i = this.glintList.length - 1; i >= 0; i--) {
            this.glintList[i].age += dt;
            if (this.glintList[i].age >= GLINT_LIFE) this.glintList.splice(i, 1);
        }

        this.placeCamera(now);
        this.placeWalls(now);
        this.placeCrystals(now);
        this.placeShards();
        this.placeGlints();
    }

    render(ctx: CanvasRenderingContext2D, s: VizServices): void {
        drawScene(ctx, this.scene, this.camera, s.width, s.height, s.dpr);
    }

    private spawnShard(seed: number, now: number): void {
        if (this.shardList.length >= MAX_SHARDS) return;
        const r = (n: number) => rand01(hash32(seed, n));
        const a = Math.PI / 2 + (r(1) - 0.5) * 1.2;
        this.shardList.push({x: Math.cos(a) * R * 0.8, y: Math.sin(a) * R * 0.8, z: -now * D - 1 - r(2) * 4,
            vy: 0, spin: r(3) * TAU, age: 0});
    }

    private spawnGlint(seed: number, now: number): void {
        if (this.glintList.length >= MAX_GLINTS) return;
        const r = (n: number) => rand01(hash32(seed, n));
        const a = r(1) * TAU;
        const rad = R * 0.86;
        this.glintList.push({x: Math.cos(a) * rad, y: Math.max(FLOOR + 0.2, Math.sin(a) * rad), z: -now * D - r(2) * 6, age: 0});
    }

    private placeCamera(now: number): void {
        const z = -now * D + BACK;
        const sway = Math.sin(now * TAU / 8) * 0.6;
        const bob = Math.sin(now * TAU / 5) * 0.25 - this.kick * 0.08;
        this.camera.position.set(sway, bob - 0.3, z);
        this.camera.lookAt(sway * 0.4, -0.1, z - 20);
        this.camera.rotateZ(Math.sin(now * TAU / 11) * 0.05);
        this.lamp.position.set(sway, 0.6, z - 1);
        this.nowLight.position.set(0, 0.4, -now * D);
        this.nowLight.intensity = 10 + 70 * this.kick + 25 * this.snap;
        this.ring.position.set(0, 0, -now * D);
        this.ring.scale.setScalar(1 + this.kick * 0.04);
        this.ringMat.opacity = 0.25 + 0.75 * this.kick;
    }

    private placeWalls(now: number): void {
        const first = Math.floor(now) - SEGS_BEHIND;
        for (let i = 0; i < this.walls.length; i++) {
            const bar = first + i;
            const w = this.walls[i];
            w.geometry = this.wallGeos[hash32(bar, 7) % SEG_VARIANTS];
            w.position.set(0, 0, -(bar + 0.5) * D);
        }
    }

    private placeCrystals(now: number): void {
        const {bodies, shells, dummy, tint, tint2, ink} = this;
        let n = 0;
        // The décor: dim crystals every bar of wall, there with or without music.
        const first = Math.floor(now) - SEGS_BEHIND;
        for (let b = first; b <= first + SEGS_BEHIND + SEGS_AHEAD; b++) {
            for (let k = 0; k < DECOR_PER_SEG; k++) {
                const seed = hash32(b * 31 + k, 101);
                const r = (m: number) => rand01(hash32(seed, m));
                const z = -(b + r(1)) * D;
                const size = 0.35 + r(2) * r(2) * 1.3;
                this.aim(r(3) * TAU, r(4) - 0.5, r(5) - 0.5, r(6) * TAU, z, size);
                bodies.setMatrixAt(n, dummy.matrix);
                bodies.setColorAt(n, tint.copy(ink.deep).lerp(ink.ice, 0.25 + 0.3 * r(7)));
                dummy.scale.multiplyScalar(1.12);
                dummy.updateMatrix();
                shells.setMatrixAt(n, dummy.matrix);
                const shimmer = 0.04 + 0.05 * Math.max(0, Math.sin(now * 3 + r(8) * TAU));
                shells.setColorAt(n, tint.copy(ink.ice).multiplyScalar(shimmer));
                n++;
            }
        }
        for (const h of this.field.haps) {
            if (h.role !== 'bass' && h.role !== 'mid' && h.role !== 'lead') continue;
            if (n >= MAX_CRYSTALS) break;
            const t = now - h.begin;
            const dur = h.end - h.begin;
            const grow = t < 0 ? 0.16 : t < GROW ? 0.16 + 0.98 * easeOut(t / GROW) : 1 + 0.14 * Math.exp(-(t - GROW) * 10);
            const glow = t < 0 ? 0.12 * clamp01(1 + t) : t < dur ? 1 - 0.3 * (t / Math.max(dur, 0.01)) : 0.7 * Math.exp(-(t - dur) * 2.5);
            const fade = clamp01(h.fade);
            this.aim(h.theta, h.tiltA, h.tiltB, h.spin, -h.begin * D, h.size * grow * fade);
            bodies.setMatrixAt(n, dummy.matrix);
            setRgb(tint2, h.team.rgb);
            bodies.setColorAt(n, tint.copy(ink.deep).lerp(tint2, 0.3 + 0.55 * glow).multiplyScalar(0.7 + 0.3 * glow));
            dummy.scale.multiplyScalar(1.15 + 0.1 * glow);
            dummy.updateMatrix();
            shells.setMatrixAt(n, dummy.matrix);
            shells.setColorAt(n, tint.copy(tint2).multiplyScalar(0.05 + 0.4 * glow));
            n++;
        }
        bodies.count = n;
        shells.count = n;
        flush(bodies);
        flush(shells);
    }

    /** Set `dummy` to a crystal rooted on the wall at angle `theta`, pointing inward. */
    private aim(theta: number, tiltA: number, tiltB: number, spin: number, z: number, size: number): void {
        const c = Math.cos(theta);
        const sn = Math.sin(theta);
        const base = sn < -0.2 ? Math.min(R * 0.9, -FLOOR / -sn) : R * 0.9;
        const {dummy, dir} = this;
        dummy.position.set(c * base, sn * base, z);
        dir.set(-c + tiltA * 0.8 * -sn, -sn + tiltA * 0.8 * c, tiltB * 0.9).normalize();
        dummy.quaternion.setFromUnitVectors(UP, dir);
        dummy.rotateY(spin);
        dummy.scale.set(size, size * 1.8, size);
        dummy.updateMatrix();
    }

    private placeShards(): void {
        const {shards, dummy} = this;
        let n = 0;
        for (const sh of this.shardList) {
            dummy.position.set(sh.x, sh.y, sh.z);
            dummy.rotation.set(sh.spin + sh.age * 7, sh.age * 5, 0);
            dummy.scale.set(1, 1.8, 1);
            dummy.updateMatrix();
            shards.setMatrixAt(n++, dummy.matrix);
        }
        shards.count = n;
        flush(shards);
    }

    private placeGlints(): void {
        const {glintPos, glintCol, ink} = this;
        let n = 0;
        for (const g of this.glintList) {
            const t = g.age / GLINT_LIFE;
            const a = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
            glintPos[n * 3] = g.x;
            glintPos[n * 3 + 1] = g.y;
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
}

function instanced(geo: BufferGeometry, mat: MeshStandardMaterial | MeshBasicMaterial, max: number): InstancedMesh {
    const m = new InstancedMesh(geo, mat, max);
    const black = new Color(0, 0, 0);
    for (let i = 0; i < max; i++) m.setColorAt(i, black);
    m.count = 0;
    m.frustumCulled = false;
    return m;
}

function flush(m: InstancedMesh): void {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
}

function easeOut(t: number): number {
    const u = 1 - t;
    return 1 - u * u * u;
}

/** One bar of cave wall: a rough tube along z with a flat floor, its end rings shared by every variant. */
function wallGeometry(variant: number): BufferGeometry {
    const g = new CylinderGeometry(R, R, D, SEG_SIDES, SEG_RINGS, true);
    g.rotateX(Math.PI / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const side = Math.round(((Math.atan2(y, x) + TAU) % TAU) / (TAU / SEG_SIDES)) % SEG_SIDES;
        const ring = Math.round((z + D / 2) / (D / SEG_RINGS));
        const v = ring === 0 || ring === SEG_RINGS ? 0 : variant + 1;
        const k = 1 + (rand01(hash32(side * 17 + ring, v * 7919 + 3)) - 0.5) * 0.34;
        pos.setXYZ(i, x * k, Math.max(FLOOR, y * k), z);
    }
    g.setAttribute('color', new BufferAttribute(new Float32Array(pos.count * 3), 3));
    g.computeVertexNormals();
    return g;
}

/** Wall colour by height: snow on the floor, deep ice up the walls, frost on the roof. */
function paintWall(g: BufferGeometry, ink: Ink): void {
    const pos = g.attributes.position;
    const col = g.attributes.color;
    const c = new Color();
    for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const h = clamp01((y - FLOOR) / (R - FLOOR));
        if (y <= FLOOR + 0.01) c.copy(ink.snow).multiplyScalar(0.4);
        else c.copy(ink.deep).lerp(ink.frost, 0.1 + 0.25 * h).multiplyScalar(0.55);
        col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
}

function makeCrystal(base: FieldHap<Team>): Crystal {
    const r = (n: number) => rand01(hash32(base.seed, n));
    const pitched = Number.isFinite(base.note);
    const u = pitched ? clamp01((base.note - 30) / 66) : 0;
    const side = (base.seed & 1) === 0 ? 1 : -1;
    const dur = base.end - base.begin;
    return {
        ...base,
        role: winterRole(base.team.name, base.note),
        theta: -Math.PI / 2 + side * (0.12 + 0.88 * u) * Math.PI + (r(1) - 0.5) * 0.16,
        tiltA: (r(2) - 0.5) * 0.7,
        tiltB: 0.15 + r(3) * 0.35,
        spin: r(4) * TAU,
        size: 0.32 + 0.7 * Math.sqrt(Math.min(dur, 4)),
    };
}

export const iceCaveDef: VizModeDef = {
    id: 'ice-cave',
    name: 'ICE CAVE',
    create: () => new IceCaveMode(),
};
