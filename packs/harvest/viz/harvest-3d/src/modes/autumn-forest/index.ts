/**
 * AUTUMN FOREST — walking a woodland path through low-poly maples in full
 * colour, one stretch of path per bar. The bass is the wind in the canopy:
 * its level sets how far the trees sway. Hats shake single leaves loose ahead
 * of you, snares shake a whole crown, and each kick is a gust that leans the
 * trees and blows every falling leaf sideways. Pitched notes drop a big leaf
 * in the track colour, low notes on the left of the path, high on the right.
 * Fallen leaves settle into the litter and fade.
 */

import type {VizMode, VizModeDef, VizServices} from '@cycletron/viz-sdk';
import {type FieldHap, type FieldTeam, HapField, type Rgb} from '@cycletron/viz-sdk';
import {clamp01, hash32, rand01, SeededRandom, TAU} from '@cycletron/viz-sdk';
import {
    BufferGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, IcosahedronGeometry, InstancedMesh,
    Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, PlaneGeometry, SphereGeometry,
} from 'three';
import {type Role} from '@naderlabs/kit/roles';
import {bakeHarvest, type Harvest} from '../../lib/colors.js';
import {setRgb} from '@naderlabs/kit/gl';
import {GLOW_QUAD, glowMaterial} from '../../lib/glow.js';
import {age, hide, markDirty} from '../../lib/instances.js';
import {harvestRole} from '../../lib/roles.js';
import {SkyDome} from '../../lib/sky.js';
import {Stage} from '../../lib/stage.js';

const LOOKAHEAD = 1;
/** The forest is one band this long, repeated along the path. */
const BAND = 120;
const TREES = 200;
const LITTER = 700;
const MAX_LEAVES = 320;
const LEAF_LIFE = 7;
/** Path travelled per bar. */
const PACE = 4;
const PATH_HALF = 2.2;

interface Team extends FieldTeam {}

interface Note extends FieldHap<Team> {
    role: Role;
}

interface Tree {
    x: number;
    z: number;
    height: number;
    crown: number;
    tint: number;
    phase: number;
}

/** A tree and where its band puts it now. */
interface Placed {
    tree: Tree;
    z: number;
}

interface Leaf {
    age: number;
    x: number;
    y: number;
    z: number;
    /** Sideways drift picked up from gusts. */
    vx: number;
    size: number;
    seed: number;
    /** A note's leaf wears its track colour; the rest wear the palette's. */
    rgb: Rgb | null;
    landed: number;
}

class AutumnForestMode implements VizMode {
    private readonly stage = new Stage(55, 0.2, 400, 18, 95);
    private readonly sky = new SkyDome(300);
    private readonly field = new HapField<Team, Note>({
        lookahead: LOOKAHEAD,
        maxHaps: 160,
        maxPerTrack: 32,
        idleRate: 0.25,
        team: (base) => base,
        hap: (base) => ({...base, role: harvestRole(base.team.name, base.note)}),
        keep: (h, cycle) => h.end >= cycle - 0.1,
    });
    private readonly trees: Tree[] = [];
    private readonly leaves: Leaf[] = [];
    private readonly dummy = new Object3D();
    private readonly m = new Matrix4();
    private readonly crownLocal = new Matrix4();
    private readonly tint = new Color();
    private colors: Harvest | null = null;
    private bass = 0;
    private gust = 0;
    private wind = 0;
    private camZ = 0;

    private readonly trunkMat = new MeshLambertMaterial({flatShading: true});
    private readonly crownMat = new MeshLambertMaterial({flatShading: true});
    private readonly topMat = new MeshLambertMaterial({flatShading: true});
    private readonly leafMat = new MeshLambertMaterial({side: DoubleSide});
    private readonly groundMat = new MeshLambertMaterial({vertexColors: true});
    private readonly pathMat = new MeshLambertMaterial();
    private readonly sunMat = new MeshBasicMaterial({fog: false});
    private readonly sunGlowMat = glowMaterial();
    private readonly trunks: InstancedMesh;
    private readonly crowns: InstancedMesh;
    /** A smaller second lobe on each crown. */
    private readonly tops: InstancedMesh;
    private readonly topLocal = new Matrix4();
    private readonly litter: InstancedMesh;
    private readonly falling: InstancedMesh;
    private readonly ground: Mesh;
    private readonly path: Mesh;
    private readonly sun: Mesh;

    constructor() {
        const {scene} = this.stage;
        scene.add(this.sky.mesh);
        const rnd = new SeededRandom(23);
        for (let i = 0; i < TREES; i++) {
            const side = i % 2 === 0 ? -1 : 1;
            const off = PATH_HALF + 2.2 + Math.pow(rnd.next(), 1.3) * 28;
            this.trees.push({x: side * off, z: -rnd.next() * BAND, height: rnd.range(3.2, 6), crown: rnd.range(1.3, 2.2),
                tint: rnd.next(), phase: rnd.next() * TAU});
        }
        // Base of the trunk at the origin; the crown sits on top of a unit trunk.
        const trunkGeo = new CylinderGeometry(0.12, 0.2, 1, 5);
        trunkGeo.translate(0, 0.5, 0);
        this.trunks = new InstancedMesh(trunkGeo, this.trunkMat, TREES);
        this.crowns = new InstancedMesh(new IcosahedronGeometry(1, 0), this.crownMat, TREES);
        this.tops = new InstancedMesh(this.crowns.geometry, this.topMat, TREES);

        const leafGeo = new PlaneGeometry(1, 0.7);
        this.falling = new InstancedMesh(leafGeo, this.leafMat, MAX_LEAVES);
        const flat = new PlaneGeometry(1, 0.7);
        flat.rotateX(-Math.PI / 2);
        this.litter = new InstancedMesh(flat, new MeshLambertMaterial(), LITTER);
        scene.add(this.trunks, this.crowns, this.tops, this.falling, this.litter);

        // The ground and the path travel with the camera; they're uniform along z.
        this.ground = new Mesh(stripGround(), this.groundMat);
        const pathGeo = new PlaneGeometry(PATH_HALF * 2, 260);
        pathGeo.rotateX(-Math.PI / 2);
        this.path = new Mesh(pathGeo, this.pathMat);
        this.path.position.y = 0.02;
        scene.add(this.ground, this.path);

        this.sun = new Mesh(new SphereGeometry(14, 16, 10), this.sunMat);
        const glow = new Mesh(GLOW_QUAD, this.sunGlowMat);
        glow.position.z = 16;
        glow.scale.set(120, 120, 1);
        this.sun.add(glow);
        scene.add(this.sun);
        this.stage.uncull();
    }

    layout(s: VizServices): void {
        const c = bakeHarvest(s.theme);
        this.colors = c;
        const horizon = c.sun.clone().lerp(c.leaves[2], 0.4);
        const haze = horizon.clone().lerp(c.leaves[0], 0.25).lerp(c.sky, 0.25);
        this.sky.paint(c.sky.clone().lerp(c.violet, 0.3).lerp(c.cream, 0.15), horizon, haze);
        this.stage.fit(s, haze, c.sun.clone().lerp(c.cream, 0.3), c.soil);
        this.stage.sun.intensity = 2.6;
        this.stage.fill.intensity = 1.3;
        this.trunkMat.color.copy(c.bark).lerp(c.soil, 0.3);
        this.pathMat.color.copy(c.ground).lerp(c.straw, 0.3);
        this.sunMat.color.copy(c.cream).multiplyScalar(1.2);
        this.sunGlowMat.color.copy(c.leaves[2]).lerp(c.cream, 0.4).multiplyScalar(0.9);
        paintGround(this.ground.geometry, c);
        for (let i = 0; i < TREES; i++) {
            this.leafColor(this.tint, c, this.trees[i].tint);
            this.crowns.setColorAt(i, this.tint);
            this.tops.setColorAt(i, this.tint.multiplyScalar(1.15));
        }
        for (let i = 0; i < LITTER; i++) {
            this.leafColor(this.tint, c, rand01(hash32(i, 41))).multiplyScalar(0.5);
            this.litter.setColorAt(i, this.tint);
        }
        markDirty(this.crowns);
        markDirty(this.tops);
        markDirty(this.litter);
        this.field.invalidate();
    }

    private leafColor(out: Color, c: Harvest, t: number): Color {
        const k = Math.floor(t * c.leaves.length * 0.999);
        return out.copy(c.leaves[k]).lerp(c.leaves[(k + 1) % c.leaves.length], (t * c.leaves.length) % 1 * 0.5);
    }

    update(dt: number, s: VizServices): void {
        const field = this.field;
        field.update(dt, s);
        const cycle = field.cycle;
        this.camZ = -cycle * PACE;
        if (field.restarted) {
            this.leaves.length = 0;
            this.gust = 0;
            this.wind = 0;
        }
        let shaken = 0;
        for (const h of field.haps) {
            if (!field.crossed(h)) continue;
            h.done = true;
            h.team.activity = 1;
            switch (h.role) {
                case 'kick':
                    this.gust = 1;
                    this.wind += 2.5;
                    break;
                case 'hat':
                    if (shaken < 3) { this.shed(h.seed, 0); shaken++; }
                    break;
                case 'snare':
                case 'crash':
                    for (let k = 0; k < (h.role === 'crash' ? 14 : 7); k++) this.shed(h.seed, k);
                    break;
                case 'bass':
                case 'mid':
                case 'lead':
                    this.dropNote(h);
                    break;
                default:
                    break;
            }
        }
        this.gust *= Math.exp(-dt * 3);
        this.wind *= Math.exp(-dt * 1.5);
        this.bass += (s.low - this.bass) * (1 - Math.exp(-dt * 6));

        for (const l of this.leaves) {
            if (l.landed >= 0) { l.landed += dt; continue; }
            const flutter = Math.sin(l.age * 2.6 + (l.seed & 63)) * 0.9;
            l.x += (flutter + l.vx + this.wind) * dt;
            l.vx *= Math.exp(-dt * 0.8);
            l.y -= (0.9 + 0.3 * Math.sin(l.age * 4.1 + (l.seed & 31))) * dt;
            if (l.y <= 0.05) { l.y = 0.05; l.landed = 0; }
        }
        age(this.leaves, dt, LEAF_LIFE);

        this.pose(cycle);
    }

    /** The tree at index-hash `seed` placed in front of the camera now. */
    private treeAhead(seed: number, side: number): Placed {
        for (let tries = 0; tries < 8; tries++) {
            const tree = this.trees[hash32(seed, tries + 1) % TREES];
            if (side !== 0 && Math.sign(tree.x) !== side) continue;
            const z = this.wrapZ(tree.z);
            if (z < this.camZ - 4 && z > this.camZ - 40) return {tree, z};
        }
        const tree = this.trees[seed % TREES];
        return {tree, z: this.wrapZ(tree.z)};
    }

    private shed(seed: number, n: number): void {
        const {tree, z} = this.treeAhead(hash32(seed, n), 0);
        this.spawnLeaf(tree, z, hash32(seed, n + 100), 1, null);
    }

    private dropNote(h: Note): void {
        const side = h.note < 60 ? -1 : 1;
        const {tree, z} = this.treeAhead(h.seed, side);
        this.spawnLeaf(tree, z, h.seed, 1.8, h.team.rgb);
    }

    private spawnLeaf(tree: Tree, z: number, seed: number, size: number, rgb: Rgb | null): void {
        if (this.leaves.length >= MAX_LEAVES) this.leaves.shift();
        const r = (k: number) => rand01(hash32(seed, k)) - 0.5;
        const top = tree.height;
        this.leaves.push({age: 0, x: tree.x + r(1) * tree.crown * 1.6, y: top + r(2) * tree.crown, z: z + r(3) * tree.crown * 1.6,
            vx: r(4) * 0.6, size: size * (0.4 + 0.12 * r(5)), seed, rgb, landed: -1});
    }

    private wrapZ(z: number): number {
        const front = this.camZ + 12;
        return front - (((front - z) % BAND) + BAND) % BAND;
    }

    private pose(cycle: number): void {
        const c = this.colors;
        if (!c) return;
        const d = this.dummy;
        const cam = this.stage.camera;
        const sway = Math.sin(cycle * TAU / 8);
        cam.position.set(sway * 0.7, 2.1 + Math.abs(Math.sin(cycle * TAU * 2)) * 0.05, this.camZ);
        cam.lookAt(sway * 0.3, 2.6, this.camZ - 20);
        this.sky.mesh.position.copy(cam.position);
        this.ground.position.z = this.camZ;
        this.path.position.z = this.camZ - 100;
        this.sun.position.set(-30, 26, this.camZ - 260);
        this.stage.sun.position.set(-30, 26, this.camZ - 60);
        this.stage.sun.target.position.set(0, 0, this.camZ);

        const lean = 0.03 + clamp01(this.bass) * 0.1;
        for (let i = 0; i < TREES; i++) {
            const t = this.trees[i];
            const z = this.wrapZ(t.z);
            const bend = lean * Math.sin(cycle * TAU * 0.5 + t.phase) + this.gust * 0.12;
            d.position.set(t.x, 0, z);
            d.rotation.set(0, t.phase, 0);
            d.rotation.z = -bend;
            d.rotation.order = 'YXZ';
            d.scale.set(1, t.height, 1);
            d.updateMatrix();
            this.trunks.setMatrixAt(i, d.matrix);
            d.scale.set(1, 1, 1);
            d.updateMatrix();
            this.crownLocal.makeTranslation(0, t.height + t.crown * 0.55, 0)
                .multiply(this.m.makeScale(t.crown, t.crown * 1.2, t.crown));
            this.m.multiplyMatrices(d.matrix, this.crownLocal);
            this.crowns.setMatrixAt(i, this.m);
            this.topLocal.makeTranslation(t.crown * 0.35, t.height + t.crown * 1.45, t.crown * 0.2)
                .multiply(this.m.makeScale(t.crown * 0.62, t.crown * 0.7, t.crown * 0.62));
            this.m.multiplyMatrices(d.matrix, this.topLocal);
            this.tops.setMatrixAt(i, this.m);
        }
        d.rotation.order = 'XYZ';
        for (let i = 0; i < LITTER; i++) {
            const seed = hash32(i, 77);
            const x = (rand01(seed) - 0.5) * 2 * (PATH_HALF + 14);
            const z = this.wrapZ(-rand01(hash32(seed, 1)) * BAND);
            d.position.set(x, 0.03 + (i % 5) * 0.002, z);
            d.rotation.set(0, rand01(hash32(seed, 2)) * TAU, 0);
            const sz = 0.35 + 0.25 * rand01(hash32(seed, 3));
            d.scale.set(sz, 1, sz);
            d.updateMatrix();
            this.litter.setMatrixAt(i, d.matrix);
        }
        for (let i = 0; i < MAX_LEAVES; i++) {
            const l = this.leaves[i];
            if (!l) { hide(this.falling, i); continue; }
            const spin = l.landed >= 0 ? 0 : l.age;
            d.position.set(l.x, l.y, l.z);
            if (l.landed >= 0) d.rotation.set(-Math.PI / 2, 0, (l.seed & 255) * 0.1);
            else d.rotation.set(spin * 2.3 + (l.seed & 7), spin * 1.7, spin * 3.1 + (l.seed & 15));
            const fade = l.landed >= 0 ? clamp01((LEAF_LIFE - l.age) / 1.5) : 1;
            d.scale.set(l.size * fade, l.size * fade, l.size * fade);
            d.updateMatrix();
            this.falling.setMatrixAt(i, d.matrix);
            if (l.rgb) setRgb(this.tint, l.rgb).multiplyScalar(1.5);
            else this.leafColor(this.tint, c, rand01(hash32(l.seed, 9)));
            this.falling.setColorAt(i, this.tint);
        }
        markDirty(this.trunks);
        markDirty(this.crowns);
        markDirty(this.tops);
        markDirty(this.litter);
        markDirty(this.falling);
    }

    render(ctx: CanvasRenderingContext2D, s: VizServices): void {
        this.stage.draw(ctx, s);
    }
}

/** A wide ground strip, flat along z so it can ride with the camera. */
function stripGround(): BufferGeometry {
    const verts: number[] = [];
    const xs = [-90, -40, -22, -12, -6, -PATH_HALF - 0.6, PATH_HALF + 0.6, 6, 12, 22, 40, 90];
    for (let i = 0; i < xs.length - 1; i++) {
        const [a, b] = [xs[i], xs[i + 1]];
        verts.push(a, 0, 20, b, 0, 20, a, 0, -260, b, 0, 20, b, 0, -260, a, 0, -260);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(verts, 3));
    g.setAttribute('color', new Float32BufferAttribute(new Float32Array(verts.length), 3));
    g.computeVertexNormals();
    return g;
}

function paintGround(geo: BufferGeometry, c: Harvest): void {
    const rgb = geo.getAttribute('color');
    const col = new Color();
    for (let t = 0; t < rgb.count; t += 3) {
        col.copy(c.ground).lerp(c.leaves[3], 0.2 + 0.2 * rand01(hash32(t, 3)));
        for (let k = 0; k < 3; k++) rgb.setXYZ(t + k, col.r, col.g, col.b);
    }
    rgb.needsUpdate = true;
}

export const autumnForestDef: VizModeDef = {
    id: 'autumn-forest',
    name: 'AUTUMN FOREST',
    create: () => new AutumnForestMode(),
};
