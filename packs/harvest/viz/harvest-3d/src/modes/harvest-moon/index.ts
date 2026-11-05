/**
 * HARVEST MOON — a pumpkin patch on rolling hills under a huge rising moon.
 * The patch is the keyboard: three rows (bass at the front, mid, lead at the
 * back) of twelve pumpkins, one per pitch class. A note lights its pumpkin in
 * the track colour for as long as it is held, then the glow dies away. Kicks
 * pulse the moon's halo, hats spark fireflies over the patch, snares and
 * crashes send a shooting star across the sky, and the bass level lights the
 * barn's loft window. The moon climbs over the first bars and then hangs.
 */

import type {VizMode, VizModeDef, VizServices} from '@cycletron/viz-sdk';
import {type FieldHap, type FieldTeam, HapField} from '@cycletron/viz-sdk';
import {clamp01, hash32, rand01, SeededRandom, TAU} from '@cycletron/viz-sdk';
import {
    AdditiveBlending, BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute, InstancedMesh,
    LessEqualDepth, Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, Points, PointsMaterial, SphereGeometry,
} from 'three';
import {type Role} from '@naderlabs/kit/roles';
import {bakeHarvest, type Harvest} from '../../lib/colors.js';
import {setRgb} from '@naderlabs/kit/gl';
import {GLOW_QUAD, glowMaterial} from '../../lib/glow.js';
import {markDirty} from '../../lib/instances.js';
import {harvestRole} from '../../lib/roles.js';
import {groundGeometry, pumpkinGeometry} from '../../lib/shapes.js';
import {Stage} from '../../lib/stage.js';

const LOOKAHEAD = 1;
const COLS = 12;
const ROWS = 3;
const PATCH = COLS * ROWS;
const TAIL = 0.6;
const MAX_FLIES = 48;
const FLY_LIFE = 1.4;
const MAX_STARS = 4;
const STAR_LIFE = 0.9;
/** Glows per shooting star, head first. */
const STREAK = 12;
const MOON_Z = -170;
const MOON_R = 20;

interface Team extends FieldTeam {}

interface Note extends FieldHap<Team> {
    role: Role;
}

interface Fly {
    age: number;
    x: number;
    y: number;
    z: number;
    phase: number;
}

interface Spot {
    x: number;
    z: number;
    size: number;
}

interface Shooter {
    age: number;
    x: number;
    y: number;
    dir: number;
}

/** The rolling ground, lowest under the patch and rising toward the horizon. */
function hills(x: number, z: number): number {
    const back = clamp01((-z - 10) / 60);
    return Math.sin(x * 0.07 + 1.3) * 2.2 * back + Math.sin(x * 0.16 - z * 0.05) * 1.1 + back * back * 9 +
        Math.sin(z * 0.2) * 0.3;
}

class HarvestMoonMode implements VizMode {
    private readonly stage = new Stage(42, 0.5, 400, 40, 230);
    private readonly field = new HapField<Team, Note>({
        lookahead: LOOKAHEAD,
        maxHaps: 240,
        maxPerTrack: 48,
        idleRate: 0.25,
        team: (base) => base,
        hap: (base) => ({...base, role: harvestRole(base.team.name, base.note)}),
        keep: (h, cycle) => h.end + TAIL >= cycle,
    });
    private readonly dummy = new Object3D();
    private readonly tint = new Color();
    private readonly lit = new Color();
    private readonly hot = new Color();
    private readonly spots = Array.from({length: PATCH}, (_, i) => patchSpot(i));
    private readonly glow = new Float32Array(PATCH);
    private readonly glowRgb = new Float32Array(PATCH * 3);
    private readonly flies: Fly[] = [];
    private readonly shooters: Shooter[] = [];
    private colors: Harvest | null = null;
    private halo = 0;
    private bass = 0;
    private lastIdleFly = -1;

    private readonly groundMat = new MeshLambertMaterial({vertexColors: true});
    private readonly ground: Mesh;
    private readonly pumpkins: InstancedMesh;
    private readonly stemMat = new MeshLambertMaterial({flatShading: true});
    private readonly stems: InstancedMesh;
    /** The pumpkins again, additive: black adds nothing, a lit one glows. */
    private readonly shells: InstancedMesh;
    private readonly lanterns: InstancedMesh;
    private readonly moonMat = new MeshBasicMaterial({fog: false});
    private readonly moon: Mesh;
    private readonly haloMat = glowMaterial();
    private readonly halo1: Mesh;
    private readonly flyMesh: InstancedMesh;
    private readonly starMesh: InstancedMesh;
    private readonly skyStars: Points;
    private readonly skyStarMat = new PointsMaterial({size: 1.6, sizeAttenuation: false, fog: false});
    private readonly barnMat = new MeshLambertMaterial();
    private readonly roofMat = new MeshLambertMaterial();
    private readonly windowMat = new MeshBasicMaterial({fog: false});
    private readonly treeMat = new MeshLambertMaterial({flatShading: true});
    private readonly trees: InstancedMesh;
    private readonly baleMat = new MeshLambertMaterial({flatShading: true});
    private readonly bales: InstancedMesh;

    constructor() {
        const {scene} = this.stage;
        this.ground = new Mesh(groundGeometry(-160, -200, 160, 40, 48, 36, hills), this.groundMat);
        scene.add(this.ground);

        this.pumpkins = new InstancedMesh(pumpkinGeometry(6), new MeshLambertMaterial({flatShading: true}), PATCH);
        this.shells = new InstancedMesh(this.pumpkins.geometry, new MeshBasicMaterial({blending: AdditiveBlending, transparent: true,
            depthFunc: LessEqualDepth, depthWrite: false}), PATCH);
        this.stems = new InstancedMesh(new CylinderGeometry(0.07, 0.11, 0.4, 5), this.stemMat, PATCH);
        this.lanterns = new InstancedMesh(GLOW_QUAD, glowMaterial(), PATCH);
        for (let i = 0; i < PATCH; i++) {
            const {x, z, size} = this.spots[i];
            const y = hills(x, z);
            const turn = rand01(hash32(i, 7)) * TAU;
            this.place(x, y, z, size, size * (0.85 + 0.3 * rand01(hash32(i, 9))), size, turn);
            this.pumpkins.setMatrixAt(i, this.dummy.matrix);
            this.shells.setMatrixAt(i, this.dummy.matrix);
            this.place(x, y + size * 1.38, z, size, size, size, turn);
            this.dummy.rotation.z = 0.25;
            this.dummy.updateMatrix();
            this.stems.setMatrixAt(i, this.dummy.matrix);
        }
        scene.add(this.pumpkins, this.shells, this.stems, this.lanterns);

        this.moon = new Mesh(new SphereGeometry(MOON_R, 24, 16), this.moonMat);
        this.halo1 = new Mesh(GLOW_QUAD, this.haloMat);
        scene.add(this.moon, this.halo1);

        const rnd = new SeededRandom(11);
        const starPos: number[] = [];
        for (let i = 0; i < 260; i++) {
            const a = rnd.range(-1.2, 1.2);
            const e = rnd.range(0.08, 0.75);
            starPos.push(Math.sin(a) * 300 * Math.cos(e), Math.sin(e) * 300, -Math.cos(a) * 300 * Math.cos(e));
        }
        const starGeo = new BufferGeometry();
        starGeo.setAttribute('position', new Float32BufferAttribute(starPos, 3));
        this.skyStars = new Points(starGeo, this.skyStarMat);
        scene.add(this.skyStars);

        this.flyMesh = new InstancedMesh(GLOW_QUAD, glowMaterial(), MAX_FLIES);
        this.starMesh = new InstancedMesh(GLOW_QUAD, glowMaterial(), MAX_STARS * STREAK);
        scene.add(this.flyMesh, this.starMesh);

        // The barn on the rise to the left, a loft window above its doors.
        const bx = -30;
        const bz = -58;
        const by = hills(bx, bz);
        const barn = new Mesh(new BoxGeometry(12, 8, 10), this.barnMat);
        barn.position.set(bx, by + 4, bz);
        const roof = new Mesh(new CylinderGeometry(7.6, 7.6, 10.4, 3, 1), this.roofMat);
        roof.rotation.set(Math.PI / 2, 0, Math.PI / 2);
        roof.scale.set(1, 1, 0.55);
        roof.position.set(bx, by + 10.2, bz);
        const loft = new Mesh(new BoxGeometry(2.2, 2, 0.2), this.windowMat);
        loft.position.set(bx, by + 9.4, bz + 5.05);
        const door = new Mesh(new BoxGeometry(5, 5, 0.2), this.roofMat);
        door.position.set(bx, by + 2.5, bz + 5.05);
        scene.add(barn, roof, loft, door);

        // Pines along the ridge and hay bales at the edge of the patch.
        const treeCount = 34;
        this.trees = new InstancedMesh(new ConeGeometry(1, 3, 6), this.treeMat, treeCount);
        for (let i = 0; i < treeCount; i++) {
            const x = -150 + (i / treeCount) * 300 + rnd.range(-3, 3);
            const z = -95 - rnd.range(0, 30);
            const h = rnd.range(3, 6);
            this.place(x, hills(x, z) + h * 1.3, z, h * 0.7, h, h * 0.7, 0);
            this.trees.setMatrixAt(i, this.dummy.matrix);
        }
        this.bales = new InstancedMesh(new CylinderGeometry(1.2, 1.2, 1.8, 9), this.baleMat, 5);
        const baleAt: [number, number][] = [[-19, -6], [-21, -9], [17, -4], [20, -8], [24, -14]];
        baleAt.forEach(([x, z], i) => {
            this.place(x, hills(x, z) + 1.2, z, 1, 1, 1, 0);
            this.dummy.rotation.set(0, i * 0.7, Math.PI / 2);
            this.dummy.updateMatrix();
            this.bales.setMatrixAt(i, this.dummy.matrix);
        });
        scene.add(this.trees, this.bales);
        this.stage.uncull();
    }

    private place(x: number, y: number, z: number, sx: number, sy: number, sz: number, turn: number): void {
        const d = this.dummy;
        d.position.set(x, y, z);
        d.rotation.set(0, turn, 0);
        d.scale.set(sx, sy, sz);
        d.updateMatrix();
    }

    layout(s: VizServices): void {
        const c = bakeHarvest(s.theme);
        this.colors = c;
        const night = c.sky.clone().lerp(new Color(s.theme.bg), 0.5);
        this.stage.fit(s, night, c.cream.clone().lerp(c.sky, 0.4), c.soil);
        this.stage.sun.intensity = 1.6;
        this.stage.fill.intensity = 1.4;
        paintFields(this.ground.geometry, c);
        this.moonMat.color.copy(c.cream).lerp(c.pumpkin, 0.18);
        this.skyStarMat.color.copy(c.cream);
        this.barnMat.color.copy(c.leaves[3]);
        this.roofMat.color.copy(c.bark).lerp(c.soil, 0.4);
        this.treeMat.color.copy(c.soil).lerp(c.leaves[4], 0.25);
        this.baleMat.color.copy(c.straw);
        this.stemMat.color.copy(c.leaves[4]).lerp(c.bark, 0.5);
        this.field.invalidate();
    }

    update(dt: number, s: VizServices): void {
        const field = this.field;
        field.update(dt, s);
        const cycle = field.cycle;
        if (field.restarted) {
            this.flies.length = 0;
            this.shooters.length = 0;
            this.halo = 0;
        }
        for (const h of field.haps) {
            if (!field.crossed(h)) continue;
            h.done = true;
            h.team.activity = 1;
            switch (h.role) {
                case 'kick':
                    this.halo = 1;
                    break;
                case 'hat':
                    this.spawnFly(h.seed);
                    break;
                case 'snare':
                case 'crash':
                    this.spawnShooter(h.seed);
                    break;
                default:
                    break;
            }
        }
        if (!field.locked) {
            const tick = Math.floor(cycle * 4);
            if (tick !== this.lastIdleFly) {
                this.lastIdleFly = tick;
                this.spawnFly(hash32(tick, 17));
            }
        }
        for (let i = this.flies.length - 1; i >= 0; i--) {
            this.flies[i].age += dt;
            if (this.flies[i].age >= FLY_LIFE) this.flies.splice(i, 1);
        }
        for (let i = this.shooters.length - 1; i >= 0; i--) {
            this.shooters[i].age += dt;
            if (this.shooters[i].age >= STAR_LIFE) this.shooters.splice(i, 1);
        }
        this.halo *= Math.exp(-dt * 5);
        this.bass += (s.low - this.bass) * (1 - Math.exp(-dt * 8));

        this.lightPatch(cycle);
        this.pose(cycle);
    }

    private spawnFly(seed: number): void {
        if (this.flies.length >= MAX_FLIES) this.flies.shift();
        const r = (n: number) => rand01(hash32(seed, n));
        const x = (r(1) - 0.5) * 34;
        const z = -2 - r(2) * 16;
        this.flies.push({age: 0, x, y: hills(x, z) + 0.8 + r(3) * 2.2, z, phase: r(4) * TAU});
    }

    private spawnShooter(seed: number): void {
        if (this.shooters.length >= MAX_STARS) this.shooters.shift();
        const r = (n: number) => rand01(hash32(seed, n));
        this.shooters.push({age: 0, x: (r(1) - 0.5) * 160, y: 55 + r(2) * 35, dir: r(3) < 0.5 ? -1 : 1});
    }

    /** Each pumpkin's glow and colour this frame, from the notes sounding now. */
    private lightPatch(cycle: number): void {
        this.glow.fill(0);
        this.glowRgb.fill(0);
        for (const h of this.field.haps) {
            if (h.role !== 'bass' && h.role !== 'mid' && h.role !== 'lead') continue;
            const t = cycle - h.begin;
            if (t < 0) continue;
            const over = cycle - h.end;
            const level = (over <= 0 ? 1 : 1 - over / TAIL) * h.fade;
            if (level <= 0) continue;
            const row = h.role === 'bass' ? 0 : h.role === 'mid' ? 1 : 2;
            const i = row * COLS + (((Math.round(h.note) % 12) + 12) % 12);
            // Strike: a brief flare over the held level.
            const v = level * (1 + 0.6 * Math.exp(-t * 14));
            if (v <= this.glow[i]) continue;
            this.glow[i] = v;
            setRgb(this.tint, h.team.rgb);
            this.glowRgb[i * 3] = this.tint.r;
            this.glowRgb[i * 3 + 1] = this.tint.g;
            this.glowRgb[i * 3 + 2] = this.tint.b;
        }
        if (!this.field.locked) {
            // Stopped: a slow wave walks the patch.
            for (let i = 0; i < PATCH; i++) {
                const w = 0.5 + 0.5 * Math.sin(cycle * TAU * 0.5 - (i % COLS) * 0.6 - Math.floor(i / COLS));
                if (w > 0.85) this.glow[i] = Math.max(this.glow[i], (w - 0.85) * 5);
            }
        }
    }

    private pose(cycle: number): void {
        const c = this.colors;
        if (!c) return;
        const cam = this.stage.camera;
        const drift = Math.sin(cycle * TAU / 32);
        cam.position.set(drift * 4, 8.5 + Math.sin(cycle * TAU / 24) * 0.4, 24);
        cam.lookAt(drift * 1.5, 1.2, -30);

        const rise = 1 - Math.exp(-Math.max(0, cycle) / 8);
        const mx = -18 + drift * 6 + rise * 30;
        const my = 8 + rise * 22;
        this.moon.position.set(mx, my, MOON_Z);
        this.halo1.position.set(mx, my, MOON_Z + MOON_R + 2);
        const haloSize = MOON_R * (4.2 + this.halo * 1.6);
        this.halo1.scale.set(haloSize, haloSize, 1);
        this.haloMat.color.copy(c.cream).lerp(c.pumpkin, 0.4).multiplyScalar(0.55 + this.halo * 0.6);
        this.stage.sun.position.set(mx * 0.3, my * 0.6 + 10, MOON_Z * 0.3 + 40);
        this.stage.sun.target.position.set(0, 0, 0);
        this.windowMat.color.copy(c.cream).lerp(c.pumpkin, 0.5).multiplyScalar(0.25 + clamp01(this.bass) * 1.1);

        const q = cam.quaternion;
        const d = this.dummy;
        for (let i = 0; i < PATCH; i++) {
            const g = clamp01(this.glow[i]);
            const flare = this.glow[i];
            const {x, z, size} = this.spots[i];
            this.lit.setRGB(this.glowRgb[i * 3], this.glowRgb[i * 3 + 1], this.glowRgb[i * 3 + 2]);
            this.tint.copy(c.pumpkin).lerp(c.leaves[3], rand01(hash32(i, 3)) * 0.5).multiplyScalar(0.55);
            this.pumpkins.setColorAt(i, this.tint);
            // Lit from inside: candlelight warmed by the track colour, added over the shading.
            this.hot.copy(c.pumpkin).lerp(c.leaves[2], 0.4).lerp(this.lit, 0.45).multiplyScalar(g * (0.75 + 0.35 * flare));
            this.shells.setColorAt(i, this.hot);
            d.position.set(x, hills(x, z) + size * 0.75, z + size * 0.4);
            d.quaternion.copy(q);
            const gs = size * (3.6 + flare * 2.6) * (g > 0 ? 1 : 0);
            d.scale.set(gs, gs, 1);
            d.updateMatrix();
            this.lanterns.setMatrixAt(i, d.matrix);
            this.tint.copy(this.lit).lerp(c.cream, 0.2).multiplyScalar(g * 1.6);
            this.lanterns.setColorAt(i, this.tint);
        }
        markDirty(this.pumpkins);
        markDirty(this.shells);
        markDirty(this.lanterns);

        for (let i = 0; i < MAX_FLIES; i++) {
            const f = this.flies[i];
            if (!f) {
                d.scale.set(0, 0, 0);
                d.updateMatrix();
                this.flyMesh.setMatrixAt(i, d.matrix);
                continue;
            }
            const t = f.age / FLY_LIFE;
            const blink = Math.sin(t * Math.PI) * (0.6 + 0.4 * Math.sin(f.age * 18 + f.phase));
            d.position.set(f.x + Math.sin(f.age * 2 + f.phase) * 0.8, f.y + t * 1.2, f.z);
            d.quaternion.copy(q);
            d.scale.set(0.9, 0.9, 1);
            d.updateMatrix();
            this.flyMesh.setMatrixAt(i, d.matrix);
            this.tint.copy(c.leaves[2]).lerp(c.cream, 0.5).multiplyScalar(blink * 1.4);
            this.flyMesh.setColorAt(i, this.tint);
        }
        markDirty(this.flyMesh);

        // A shooting star is a head and a fading tail of glows along its path.
        for (let i = 0; i < MAX_STARS; i++) {
            const st = this.shooters[i];
            for (let k = 0; k < STREAK; k++) {
                const slot = i * STREAK + k;
                if (!st) {
                    d.scale.set(0, 0, 0);
                    d.updateMatrix();
                    this.starMesh.setMatrixAt(slot, d.matrix);
                    continue;
                }
                const t = Math.max(0, st.age - k * 0.012);
                const x = st.x + st.dir * t * 120;
                const y = st.y - t * 40;
                d.position.set(x, y, -140);
                d.quaternion.copy(q);
                const sz = 3.4 - k * 0.22;
                d.scale.set(sz, sz, 1);
                d.updateMatrix();
                this.starMesh.setMatrixAt(slot, d.matrix);
                const fade = (1 - st.age / STAR_LIFE) * (1 - k / STREAK);
                this.tint.copy(c.cream).multiplyScalar(fade);
                this.starMesh.setColorAt(slot, this.tint);
            }
        }
        markDirty(this.starMesh);
    }

    render(ctx: CanvasRenderingContext2D, s: VizServices): void {
        this.stage.draw(ctx, s);
    }
}

/**
 * Colour the hills as a patchwork of fields, a tilled patch in front and
 * stubble, straw and late green behind, one colour per triangle.
 */
function paintFields(geo: BufferGeometry, c: Harvest): void {
    const pos = geo.getAttribute('position');
    const fields = [c.straw, c.ground, c.leaves[4], c.soil, c.leaves[3]];
    const rgb = geo.getAttribute('color');
    const col = new Color();
    for (let t = 0; t < pos.count; t += 3) {
        const x = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
        const z = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
        if (z > -14) {
            col.copy(c.soil).lerp(c.ground, 0.4 + 0.25 * rand01(hash32(t, 3)));
        } else {
            const f = hash32(Math.floor((x + Math.sin(z * 0.05) * 8) / 26), Math.floor(z / 18));
            col.copy(fields[f % fields.length]).lerp(c.ground, 0.35 + 0.15 * rand01(hash32(t, 5)));
        }
        for (let k = 0; k < 3; k++) rgb.setXYZ(t + k, col.r, col.g, col.b);
    }
    rgb.needsUpdate = true;
}

/** Where pumpkin `i` sits: front row bass, back row lead, columns by pitch class. */
function patchSpot(i: number): Spot {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    const size = 1.25 - row * 0.2 + rand01(hash32(i, 5)) * 0.15;
    const spread = 2.3 + row * 0.3;
    const x = (col - (COLS - 1) / 2) * spread + (rand01(hash32(i, 1)) - 0.5) * 0.6 + (row & 1) * 0.8;
    const z = 4 - row * 4.2 + (rand01(hash32(i, 2)) - 0.5) * 0.8;
    return {x, z, size};
}

export const harvestMoonDef: VizModeDef = {
    id: 'harvest-moon',
    name: 'HARVEST MOON',
    create: () => new HarvestMoonMode(),
};
