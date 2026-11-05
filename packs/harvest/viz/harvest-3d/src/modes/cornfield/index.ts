/**
 * CORNFIELD — rows of corn at sunset round a scarecrow in a clearing. A
 * wave rolls across the rows once every two bars and each beat gusts it,
 * every kick sends a ring of wind out from the scarecrow and flaps its arms,
 * and the scarecrow's head nods from side to side on the beat. The camera
 * cuts between four places every two bars. Snares put up crows that climb away toward
 * the sun; crashes flush the two perched on its arms. Hats puff pollen off
 * the tassels. Pitched notes light ears of corn: pitch picks the row, left
 * (low) to right (high), and an ear glows in its track colour while the note
 * is held.
 */

import type {VizMode, VizModeDef, VizServices} from '@cycletron/viz-sdk';
import {type FieldHap, type FieldTeam, HapField} from '@cycletron/viz-sdk';
import {clamp01, hash32, rand01, TAU} from '@cycletron/viz-sdk';
import {
    BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group,
    InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, SphereGeometry, Vector3,
} from 'three';
import {type Role} from '@naderlabs/kit/roles';
import {beatIndex, strike} from '@naderlabs/kit/timing';
import {bakeHarvest, type Harvest} from '../../lib/colors.js';
import {setRgb} from '@naderlabs/kit/gl';
import {GLOW_QUAD, glowMaterial} from '../../lib/glow.js';
import {harvestRole} from '../../lib/roles.js';
import {age, hide, markDirty} from '../../lib/instances.js';
import {groundGeometry} from '../../lib/shapes.js';
import {SkyDome} from '../../lib/sky.js';
import {Stage} from '../../lib/stage.js';
import {STALK_HEIGHT, stalkGeometry} from './stalk.js';

const LOOKAHEAD = 1;
const ROWS = 30;
const DEPTH = 26;
const ROW_GAP = 1.5;
const STEP = 2.2;
const NEAR_Z = 5;
const CROW_X = 0;
const CROW_Z = -10;
const CLEARING = 3.6;
const TAIL = 0.5;
const MAX_LIT = 48;
const MAX_CROWS = 24;
const PERCHED = 2;
const CROW_LIFE = 4;
const MAX_POLLEN = 64;
const POLLEN_LIFE = 1.1;
const MAX_RINGS = 4;
const RING_SPEED = 14;
const SUN = new Vector3(-40, 16, -260);
/** Where the camera stands along the field's edge, one place per two-bar shot. */
const SHOT_X = [0, -0.8, 0.5, -0.3];

interface Team extends FieldTeam {}

interface Note extends FieldHap<Team> {
    role: Role;
}

interface Stalk {
    x: number;
    z: number;
    yaw: number;
    /** Distance and direction from the scarecrow, for the kick rings. */
    dist: number;
    ux: number;
    uz: number;
    height: number;
}

interface Crow {
    age: number;
    x: number;
    y: number;
    z: number;
    vx: number;
    vz: number;
    seed: number;
}

interface Speck {
    age: number;
    x: number;
    y: number;
    z: number;
    seed: number;
}

class CornfieldMode implements VizMode {
    private readonly stage = new Stage(50, 0.3, 600, 40, 260);
    private readonly sky = new SkyDome(400);
    private readonly field = new HapField<Team, Note>({
        lookahead: LOOKAHEAD,
        maxHaps: 240,
        maxPerTrack: 48,
        idleRate: 0.25,
        team: (base) => base,
        hap: (base) => ({...base, role: harvestRole(base.team.name, base.note)}),
        keep: (h, cycle) => h.end + TAIL >= cycle,
    });
    private readonly stalks: Stalk[] = [];
    /** Stalk indices per row, front first. */
    private readonly rows: number[][] = Array.from({length: ROWS}, () => []);
    private readonly crows: Crow[] = [];
    private readonly pollen: Speck[] = [];
    private readonly rings: number[] = [];
    private readonly dummy = new Object3D();
    private readonly m = new Matrix4();
    private readonly cobLocal = new Matrix4();
    private readonly wingLocal = new Matrix4();
    private readonly v = new Vector3();
    private readonly tint = new Color();
    private readonly hot = new Color();
    private colors: Harvest | null = null;
    private leanX = 0;
    private leanZ = 0;
    private flap = 0;
    private flapSide = 1;
    private perchFlush = -1;

    private readonly cornMat = new MeshLambertMaterial({vertexColors: true, side: DoubleSide});
    private readonly corn: InstancedMesh;
    private readonly cobMat = new MeshLambertMaterial({flatShading: true});
    private readonly cobs: InstancedMesh;
    private readonly lit: InstancedMesh;
    private readonly specks: InstancedMesh;
    private readonly groundMat = new MeshLambertMaterial({vertexColors: true});
    private readonly ground: Mesh;
    private readonly sunMat = new MeshBasicMaterial({fog: false});
    private readonly sunGlowMat = glowMaterial();
    private readonly crowMat = new MeshLambertMaterial({flatShading: true, side: DoubleSide});
    private readonly wingMat = new MeshLambertMaterial({flatShading: true, side: DoubleSide});
    private readonly crowBodies: InstancedMesh;
    private readonly crowWings: InstancedMesh;
    private readonly scarecrow = new Group();
    private readonly arms = new Group();
    private readonly head = new Group();
    private readonly shirtMat = new MeshLambertMaterial({flatShading: true});
    private readonly woodMat = new MeshLambertMaterial({flatShading: true});
    private readonly strawMat = new MeshLambertMaterial({flatShading: true});
    private readonly hatMat = new MeshLambertMaterial({flatShading: true});

    constructor() {
        const {scene} = this.stage;
        scene.add(this.sky.mesh);

        for (let r = 0; r < ROWS; r++) {
            for (let d = 0; d < DEPTH; d++) {
                const seed = hash32(r, d);
                const x = (r - (ROWS - 1) / 2) * ROW_GAP + (rand01(hash32(seed, 1)) - 0.5) * 0.3;
                const z = NEAR_Z - d * STEP + (rand01(hash32(seed, 2)) - 0.5) * 0.6;
                const dx = x - CROW_X;
                const dz = z - CROW_Z;
                const dist = Math.hypot(dx, dz);
                if (dist < CLEARING) continue;
                this.rows[r].push(this.stalks.length);
                this.stalks.push({x, z, yaw: rand01(hash32(seed, 3)) * TAU, dist, ux: dx / dist, uz: dz / dist,
                    height: 0.85 + 0.3 * rand01(hash32(seed, 4))});
            }
        }
        const n = this.stalks.length;
        this.corn = new InstancedMesh(stalkGeometry(), this.cornMat, n);
        this.cobs = new InstancedMesh(new SphereGeometry(1, 6, 4), this.cobMat, n);
        this.cobLocal.makeTranslation(0.13, 1.65, 0)
            .multiply(new Matrix4().makeRotationZ(-0.35))
            .multiply(new Matrix4().makeScale(0.11, 0.3, 0.11));
        this.lit = new InstancedMesh(GLOW_QUAD, glowMaterial(), MAX_LIT);
        this.specks = new InstancedMesh(GLOW_QUAD, glowMaterial(), MAX_POLLEN);
        scene.add(this.corn, this.cobs, this.lit, this.specks);

        this.ground = new Mesh(groundGeometry(-120, -260, 120, 30, 30, 40, groundHeight), this.groundMat);
        scene.add(this.ground);

        const sun = new Mesh(new SphereGeometry(18, 20, 12), this.sunMat);
        sun.position.copy(SUN);
        const sunGlow = new Mesh(GLOW_QUAD, this.sunGlowMat);
        sun.add(sunGlow);
        sunGlow.position.z = 20;
        sunGlow.scale.set(150, 150, 1);
        scene.add(sun);

        // Crows: an ellipsoid body and two triangle wings.
        const wing = new BufferGeometry();
        wing.setAttribute('position', new Float32BufferAttribute([0, 0, -0.25, 0, 0, 0.3, 1, 0.05, 0.05], 3));
        wing.computeVertexNormals();
        this.crowBodies = new InstancedMesh(new SphereGeometry(1, 6, 4), this.crowMat, MAX_CROWS);
        this.crowWings = new InstancedMesh(wing, this.wingMat, MAX_CROWS * 2);
        scene.add(this.crowBodies, this.crowWings);

        this.buildScarecrow();
        scene.add(this.scarecrow);
        this.stage.sun.position.copy(SUN).multiplyScalar(0.2);
        this.stage.uncull();
    }

    private buildScarecrow(): void {
        const s = this.scarecrow;
        s.position.set(CROW_X, groundHeight(CROW_X, CROW_Z), CROW_Z);
        s.rotation.y = 0.25;
        s.add(part(new BoxGeometry(0.22, 4.4, 0.22), this.woodMat, 0, 2.2, 0));
        s.add(part(new CylinderGeometry(0.55, 0.75, 1.5, 6), this.shirtMat, 0, 3.15, 0));
        s.add(part(new ConeGeometry(0.7, 0.6, 6), this.strawMat, 0, 2.15, 0));

        this.arms.position.set(0, 3.55, 0);
        this.arms.add(part(new BoxGeometry(4.2, 0.18, 0.18), this.woodMat, 0, 0, 0));
        for (const side of [-1, 1]) {
            const sleeve = part(new CylinderGeometry(0.22, 0.3, 1.5, 5), this.shirtMat, side * 1.05, 0, 0);
            sleeve.rotation.z = Math.PI / 2;
            const tuft = part(new ConeGeometry(0.24, 0.5, 5), this.strawMat, side * 2.0, -0.05, 0);
            tuft.rotation.z = -side * Math.PI / 2;
            this.arms.add(sleeve, tuft);
        }
        s.add(this.arms);

        this.head.position.set(0, 4.3, 0);
        this.head.add(part(new SphereGeometry(0.5, 7, 5), this.strawMat, 0, 0.3, 0));
        this.head.add(part(new CylinderGeometry(1.0, 1.0, 0.08, 9), this.hatMat, 0, 0.62, 0));
        this.head.add(part(new ConeGeometry(0.5, 0.9, 7), this.hatMat, 0, 1.05, 0));
        s.add(this.head);
    }

    layout(s: VizServices): void {
        const c = bakeHarvest(s.theme);
        this.colors = c;
        const horizon = c.sun.clone().lerp(c.pumpkin, 0.45);
        const haze = horizon.clone().lerp(c.sky, 0.45);
        this.sky.paint(c.sky.clone().lerp(c.violet, 0.4), horizon, haze);
        this.stage.fit(s, haze, c.sun, c.soil);
        this.stage.sun.intensity = 2.4;
        this.stage.fill.intensity = 1.1;
        this.sunMat.color.copy(c.cream).lerp(c.pumpkin, 0.2).multiplyScalar(1.3);
        this.sunGlowMat.color.copy(c.pumpkin).lerp(c.cream, 0.3).multiplyScalar(0.8);
        this.cobMat.color.setRGB(1, 1, 1);
        this.crowMat.color.copy(c.sky).lerp(new Color(s.theme.bg), 0.75);
        this.wingMat.color.copy(this.crowMat.color);
        this.shirtMat.color.copy(c.leaves[1]);
        this.woodMat.color.copy(c.bark);
        this.strawMat.color.copy(c.straw);
        this.hatMat.color.copy(c.bark).lerp(c.soil, 0.5);
        for (let i = 0; i < this.stalks.length; i++) {
            this.tint.copy(c.straw).lerp(c.leaves[4], 0.25 + 0.45 * rand01(hash32(i, 9))).multiplyScalar(0.95);
            this.corn.setColorAt(i, this.tint);
        }
        markDirty(this.corn);
        paintFurrows(this.ground.geometry, c);
        this.field.invalidate();
    }

    update(dt: number, s: VizServices): void {
        const field = this.field;
        field.update(dt, s);
        const cycle = field.cycle;
        if (field.restarted) {
            this.crows.length = 0;
            this.pollen.length = 0;
            this.rings.length = 0;
            this.flap = 0;
            this.perchFlush = -1;
        }
        let puffs = 0;
        for (const h of field.haps) {
            if (!field.crossed(h)) continue;
            h.done = true;
            h.team.activity = 1;
            switch (h.role) {
                case 'kick':
                    if (this.rings.length >= MAX_RINGS) this.rings.shift();
                    this.rings.push(0);
                    this.flap = 1;
                    this.flapSide = -this.flapSide;
                    break;
                case 'snare':
                    this.launch(h.seed, 0);
                    if ((h.seed & 3) === 0) this.launch(h.seed, 1);
                    break;
                case 'crash':
                    this.perchFlush = 0;
                    break;
                case 'hat':
                    if (puffs < 2) { this.puff(h.seed); puffs++; }
                    break;
                default:
                    break;
            }
        }
        for (let i = 0; i < this.rings.length; i++) this.rings[i] += dt;
        while (this.rings.length > 0 && this.rings[0] * RING_SPEED > 120) this.rings.shift();
        age(this.crows, dt, CROW_LIFE);
        age(this.pollen, dt, POLLEN_LIFE);
        if (this.perchFlush >= 0) this.perchFlush += dt;
        if (this.perchFlush > CROW_LIFE) this.perchFlush = -1;
        this.flap *= Math.exp(-dt * 5);

        this.poseField(cycle);
        this.poseCrows(cycle);
        this.poseScarecrow(cycle);
    }

    /** A crow takes off from the corn a little way off the scarecrow. */
    private launch(seed: number, n: number): void {
        if (this.crows.length >= MAX_CROWS - PERCHED) this.crows.shift();
        const r = (k: number) => rand01(hash32(seed + n * 7919, k));
        const a = r(1) * TAU;
        const d = 4 + r(2) * 12;
        this.crows.push({age: 0, x: CROW_X + Math.cos(a) * d, y: STALK_HEIGHT * 0.9, z: CROW_Z + Math.sin(a) * d * 0.6,
            vx: (SUN.x / 260) * 6 + (r(3) - 0.5) * 5, vz: -5 - r(4) * 4, seed: hash32(seed, n + 11)});
    }

    private puff(seed: number): void {
        if (this.pollen.length >= MAX_POLLEN - 3) this.pollen.splice(0, 3);
        const st = this.stalks[hash32(seed, 3) % Math.min(this.stalks.length, ROWS * 8)];
        for (let k = 0; k < 3; k++) {
            this.pollen.push({age: 0, x: st.x, y: STALK_HEIGHT * st.height + 0.3, z: st.z, seed: hash32(seed, k + 20)});
        }
    }

    /** Set `leanX`/`leanZ` for one stalk this frame. */
    private lean(st: Stalk, cycle: number): void {
        // The wind: a wave rolling across the rows, gusting on each beat.
        const wave = Math.sin(st.x * 0.22 + st.z * 0.12 - cycle * TAU * 0.5);
        const gust = 0.05 + strike(cycle, Math.floor(cycle * 4) / 4, 1 / 16) * 0.18;
        let lx = wave * gust + 0.04;
        let lz = 0;
        for (const ring of this.rings) {
            const front = ring * RING_SPEED - st.dist;
            if (front < -2 || front > 6) continue;
            const push = Math.exp(-ring * 0.9) * Math.sin(clamp01((front + 2) / 8) * Math.PI) * 0.4;
            lx += st.ux * push;
            lz += st.uz * push;
        }
        this.leanX = lx;
        this.leanZ = lz;
    }

    private poseField(cycle: number): void {
        const c = this.colors;
        if (!c) return;
        const d = this.dummy;
        d.rotation.order = 'XZY';
        this.stalks.forEach((st, i) => {
            this.lean(st, cycle);
            d.position.set(st.x, groundHeight(st.x, st.z), st.z);
            d.rotation.set(this.leanZ, st.yaw, -this.leanX);
            d.scale.setScalar(st.height);
            d.updateMatrix();
            this.corn.setMatrixAt(i, d.matrix);
            this.m.multiplyMatrices(d.matrix, this.cobLocal);
            this.cobs.setMatrixAt(i, this.m);
            this.tint.copy(c.straw).lerp(c.cream, 0.2);
            this.cobs.setColorAt(i, this.tint);
        });

        // Lit ears: pitch picks the row, the onset a stalk near the front.
        let used = 0;
        const q = this.stage.camera.quaternion;
        for (const h of this.field.haps) {
            if (used >= MAX_LIT) break;
            if (h.role !== 'bass' && h.role !== 'mid' && h.role !== 'lead') continue;
            const t = cycle - h.begin;
            if (t < 0) continue;
            const over = cycle - h.end;
            const level = (over <= 0 ? 1 : 1 - over / TAIL) * h.fade;
            if (level <= 0) continue;
            const row = Math.round(clamp01((h.note - 33) / 54) * (ROWS - 1));
            const i = this.stalkAt(row, h.seed % 7);
            this.corn.getMatrixAt(i, this.m);
            this.m.multiply(this.cobLocal);
            this.v.setFromMatrixPosition(this.m);
            setRgb(this.hot, h.team.rgb);
            this.tint.copy(this.hot).lerp(c.cream, 0.15).multiplyScalar(1 + 1.3 * level);
            this.cobs.setColorAt(i, this.tint);
            const flare = 1 + 0.8 * Math.exp(-t * 12);
            d.rotation.order = 'XYZ';
            d.position.copy(this.v);
            d.quaternion.copy(q);
            d.scale.set(2.6 * flare, 2.6 * flare, 1);
            d.updateMatrix();
            this.lit.setMatrixAt(used, d.matrix);
            this.lit.setColorAt(used, this.hot.multiplyScalar(level * 1.1));
            used++;
        }
        for (let i = used; i < MAX_LIT; i++) hide(this.lit, i);
        d.rotation.order = 'XYZ';

        for (let i = 0; i < MAX_POLLEN; i++) {
            const p = this.pollen[i];
            if (!p) { hide(this.specks, i); continue; }
            const t = p.age / POLLEN_LIFE;
            const r = (k: number) => rand01(hash32(p.seed, k)) - 0.5;
            d.position.set(p.x + r(1) * 2 * t + t * 1.5, p.y + t * 1.6 + r(2) * 0.6 * t, p.z + r(3) * 2 * t);
            d.quaternion.copy(q);
            d.scale.set(0.5, 0.5, 1);
            d.updateMatrix();
            this.specks.setMatrixAt(i, d.matrix);
            this.tint.copy(c.straw).lerp(c.cream, 0.5).multiplyScalar(Math.sin(t * Math.PI) * 1.2);
            this.specks.setColorAt(i, this.tint);
        }
        markDirty(this.corn);
        markDirty(this.cobs);
        markDirty(this.lit);
        markDirty(this.specks);
    }

    /** The stalk `back` places from the front of `row`, skipping the clearing. */
    private stalkAt(row: number, back: number): number {
        const list = this.rows[row];
        return list[Math.min(back, list.length - 1)];
    }

    private poseCrows(cycle: number): void {
        const d = this.dummy;
        for (let i = 0; i < MAX_CROWS; i++) {
            if (i < PERCHED) {
                // Perched on the arms; a crash flushes them, and they come back.
                const side = i === 0 ? -1 : 1;
                const t = this.perchFlush;
                const hop = Math.max(0, Math.sin(cycle * TAU * 2 + i * 1.7)) * 0.05 + this.flap * 0.12;
                this.v.set(side * 1.6, 3.72 + hop, 0).applyAxisAngle(Y_AXIS, 0.25);
                const flying = t >= 0 ? t : 0;
                this.poseCrow(i, CROW_X + this.v.x + flying * side * 3, this.scarecrow.position.y + this.v.y + flying * 3.2,
                    CROW_Z + this.v.z - flying * 5, t >= 0 ? -side : side * 0.3, t >= 0 ? flying * 20 : -1);
                continue;
            }
            const cr = this.crows[i - PERCHED];
            if (!cr) {
                hide(this.crowBodies, i);
                hide(this.crowWings, i * 2);
                hide(this.crowWings, i * 2 + 1);
                continue;
            }
            const t = cr.age;
            const x = cr.x + cr.vx * t;
            const y = cr.y + 6 * (1 - Math.exp(-t * 1.4)) + t * 1.2;
            const z = cr.z + cr.vz * t;
            this.poseCrow(i, x, y, z, Math.atan2(cr.vx, cr.vz), t * 20 + (cr.seed & 7));
        }
        d.rotation.set(0, 0, 0);
        markDirty(this.crowBodies);
        markDirty(this.crowWings);
    }

    /** A crow at (x, y, z) facing `yaw`; `beat` < 0 is folded wings. */
    private poseCrow(i: number, x: number, y: number, z: number, yaw: number, beat: number): void {
        const d = this.dummy;
        d.position.set(x, y, z);
        d.rotation.set(beat < 0 ? 0 : -0.15, yaw, 0);
        d.scale.set(0.32, 0.28, 0.6);
        d.updateMatrix();
        this.crowBodies.setMatrixAt(i, d.matrix);
        d.scale.set(1, 1, 1);
        d.updateMatrix();
        const up = beat < 0 ? -1.2 : Math.sin(beat) * 0.8;
        for (const side of [-1, 1]) {
            this.wingLocal.makeScale(side * 1.3, 1, 1.2).premultiply(this.m.makeRotationZ(side * up));
            this.m.multiplyMatrices(d.matrix, this.wingLocal);
            this.crowWings.setMatrixAt(i * 2 + (side < 0 ? 0 : 1), this.m);
        }
    }

    private poseScarecrow(cycle: number): void {
        const cam = this.stage.camera;
        const drift = SHOT_X[Math.floor(cycle / 2) % SHOT_X.length];
        cam.position.set(drift * 5, 5.4, 10);
        cam.lookAt(drift * 1.5, 3.2, -14);
        this.sky.mesh.position.copy(cam.position);
        this.arms.rotation.z = this.flap * 0.22 * this.flapSide;
        this.arms.position.y = 3.55 + this.flap * 0.12;
        this.head.rotation.z = beatIndex(cycle) % 2 === 0 ? 0.12 : -0.12;
        this.head.rotation.x = this.flap * 0.15;
    }

    render(ctx: CanvasRenderingContext2D, s: VizServices): void {
        this.stage.draw(ctx, s);
    }
}

const Y_AXIS = new Vector3(0, 1, 0);

function part(geo: BufferGeometry, mat: MeshLambertMaterial, x: number, y: number, z: number): Mesh {
    const mesh = new Mesh(geo, mat);
    mesh.position.set(x, y, z);
    return mesh;
}

function groundHeight(x: number, z: number): number {
    const far = clamp01((-z - 50) / 120);
    return Math.sin(x * 0.05) * 3 * far + far * far * 14 + Math.sin(x * 0.3 + z * 0.2) * 0.12;
}

/** Tilled furrows along the rows, fading into the far stubble. */
function paintFurrows(geo: BufferGeometry, c: Harvest): void {
    const pos = geo.getAttribute('position');
    const rgb = geo.getAttribute('color');
    const col = new Color();
    for (let t = 0; t < pos.count; t += 3) {
        const x = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
        const z = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
        const far = clamp01((-z - 50) / 80);
        col.copy(c.soil).lerp(c.ground, 0.3 + 0.3 * rand01(hash32(t, 7)));
        col.lerp(rand01(hash32(Math.floor(x / 30), Math.floor(z / 25))) < 0.5 ? c.straw : c.leaves[4], far * 0.55);
        rgb.setXYZ(t, col.r, col.g, col.b);
        rgb.setXYZ(t + 1, col.r, col.g, col.b);
        rgb.setXYZ(t + 2, col.r, col.g, col.b);
    }
    rgb.needsUpdate = true;
}

export const cornfieldDef: VizModeDef = {
    id: 'cornfield',
    name: 'CORNFIELD',
    create: () => new CornfieldMode(),
};
