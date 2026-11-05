/**
 * AUTUMN FOREST — a woodcutters' clearing in the maples. Every voice has its
 * own worker, and every hit lands on the frame its note sounds:
 *
 * - Kicks: the woodsman at the big chopping block. The axe goes up over his
 *   head an eighth of a bar before each kick, is in the block on the onset,
 *   and the log on it splits and its halves fly; a fresh log is on the block
 *   by the next wind-up.
 * - Snares: the second woodsman's hatchet on the kindling block, the same way.
 * - Hats: the woodpecker on the dead snag, head drawn back before each hat
 *   and driven into the bark on it.
 * - Crashes: the cabin's dinner bell, pulled back and swung through.
 * - Pitched notes: three maples, bass, mid and lead. A maple gathers before
 *   each of its notes, swells on the onset and drops a few leaves in the
 *   track colour, and its crown wears that colour while the note holds.
 * - The phrase: two sawyers work a crosscut saw through a tree, a stroke on
 *   every beat. In the last bar of every four the tree leans a step further
 *   on each beat, and it hits the ground on the next phrase's downbeat; a new
 *   tree stands from the bar after.
 *
 * Nothing drifts: the camera cuts between four fixed shots every two bars,
 * offset a bar so each phrase's count and fall share one shot.
 */

import type {VizMode, VizModeDef, VizServices} from '@cycletron/viz-sdk';
import {type FieldHap, type FieldTeam, HapField} from '@cycletron/viz-sdk';
import {clamp01, hash32, rand01, SeededRandom, TAU} from '@cycletron/viz-sdk';
import {
    BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, Group, IcosahedronGeometry,
    InstancedMesh, Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, PlaneGeometry, SphereGeometry, Vector3,
} from 'three';
import {type Role} from '@naderlabs/kit/roles';
import {setRgb} from '@naderlabs/kit/gl';
import {beatIndex, held, lastOnset, nextOnset, type Stance, stance, strike, windup} from '@naderlabs/kit/timing';
import {bakeHarvest, type Harvest} from '../../lib/colors.js';
import {GLOW_QUAD, glowMaterial} from '../../lib/glow.js';
import {age, hide, markDirty} from '../../lib/instances.js';
import {harvestRole} from '../../lib/roles.js';
import {groundGeometry} from '../../lib/shapes.js';
import {SkyDome} from '../../lib/sky.js';
import {Stage} from '../../lib/stage.js';
import {axe, Woodsman, type WoodsmanMats} from './woodsman.js';

/** Two bars, so a downbeat's wind-up is already in the field at the end of the bar before. */
const LOOKAHEAD = 2;
const TAIL = 0.5;
/** Bars per tree: sawn for three, felled on the fourth's downbeat. */
const PHRASE = 4;
/** Bars per camera shot. */
const SHOT = 2;
const MAX_LEAVES = 180;
const LEAF_LIFE = 2.6;
const BACKDROP = 70;
const LITTER = 320;

/** The chopper, his block, and the log on it. */
const CHOP = new Vector3(-5.0, 0, 0.3);
const CHOP_BLOCK = new Vector3(-3.55, 0, 0.3);
/** The hatchet man and his taller kindling block. */
const HATCH = new Vector3(-1.4, 0, 0.3);
const HATCH_BLOCK = new Vector3(-0.35, 0, 0.3);
/** The sawn tree: its stump, the cut height, and the two sawyers either side along x. */
const TREE = new Vector3(5.2, 0, -0.6);
const CUT = 0.9;
const TREE_R = 0.36;
const SAW_REACH = 0.42;
const SNAG = new Vector3(1.7, 0, -0.2);
const PECK_Y = 1.9;
const BELL = new Vector3(-8.2, 0, -0.6);
const MAPLE_X = [-5.6, -1.6, 2.4];
const MAPLE_Z = -5.2;

/** Arm angle and lean for a pose. */
interface Swing {
    arm: number;
    lean: number;
}

const AXE: Record<Stance, Swing> = {rest: {arm: 0.35, lean: 0}, ready: {arm: 3.45, lean: -0.12}, hit: {arm: 0.95, lean: 0.22}};
const HATCHET: Record<Stance, Swing> = {rest: {arm: 0.3, lean: 0}, ready: {arm: 3.2, lean: -0.08}, hit: {arm: 1.05, lean: 0.25}};
/** The woodpecker's head: tipped back and drawn off the bark, or driven in. */
const PECK: Record<Stance, {tip: number; reach: number}> = {rest: {tip: -0.15, reach: 0}, ready: {tip: -0.7, reach: 0.12},
    hit: {tip: 0.2, reach: -0.08}};
const BELL_SWING: Record<Stance, number> = {rest: 0, ready: -0.55, hit: 0.75};
/** A maple's crown: gathered before a note, swollen on it. */
const CROWN: Record<Stance, number> = {rest: 1, ready: 0.92, hit: 1.16};

interface Shot {
    pos: Vector3;
    look: Vector3;
}

/** Bars 1–2 the chopper, 3–4 wide (the count and the fall), 5–6 the hatchet and the woodpecker, 7–8 the saw. */
const SHOTS: Shot[] = [
    {pos: new Vector3(-4.2, 1.8, 5.4), look: new Vector3(-4.2, 1.4, 0.3)},
    {pos: new Vector3(-0.8, 3.3, 9.4), look: new Vector3(-0.6, 2.0, -0.5)},
    {pos: new Vector3(-0.2, 2.2, 5.0), look: new Vector3(-0.3, 1.7, 0)},
    {pos: new Vector3(7.6, 2.8, 6.0), look: new Vector3(5.0, 2.0, -1.0)},
];

interface Team extends FieldTeam {}

interface Note extends FieldHap<Team> {
    role: Role;
}

interface Leaf {
    age: number;
    x: number;
    y: number;
    z: number;
    seed: number;
    rgb: readonly [number, number, number];
}

interface Maple {
    group: Group;
    mat: MeshLambertMaterial;
    topMat: MeshLambertMaterial;
    base: Color;
}

const isPitched = (r: Role): boolean => r === 'bass' || r === 'mid' || r === 'lead';
const MAPLE_ROLE: Role[] = ['bass', 'mid', 'lead'];
const isKick = (h: Note): boolean => h.role === 'kick';
const isSnare = (h: Note): boolean => h.role === 'snare';
const isHat = (h: Note): boolean => h.role === 'hat';
const isCrash = (h: Note): boolean => h.role === 'crash';
const MAPLE_PICK = MAPLE_ROLE.map((role) => (h: Note): boolean => h.role === role);

class AutumnForestMode implements VizMode {
    private readonly stage = new Stage(50, 0.2, 400, 30, 120);
    private readonly sky = new SkyDome(300);
    private readonly field = new HapField<Team, Note>({
        lookahead: LOOKAHEAD,
        maxHaps: 320,
        maxPerTrack: 64,
        idleRate: 0.25,
        team: (base) => base,
        hap: (base) => ({...base, role: harvestRole(base.team.name, base.note)}),
        keep: (h, cycle) => h.end + TAIL >= cycle,
    });
    private readonly dummy = new Object3D();
    private readonly tint = new Color();
    private readonly leaves: Leaf[] = [];
    private colors: Harvest | null = null;

    private readonly mats: WoodsmanMats = {shirt: lambert(), pants: lambert(), skin: lambert(), cap: lambert(), beard: lambert()};
    private readonly hatchMats: WoodsmanMats = {shirt: lambert(), pants: lambert(), skin: this.mats.skin, cap: lambert(),
        beard: this.mats.beard};
    private readonly handleMat = lambert();
    private readonly steelMat = lambert();
    private readonly woodMat = lambert();
    private readonly endMat = lambert();
    private readonly barkMat = lambert();
    private readonly crownMat = lambert();
    private readonly birdMat = lambert();
    private readonly crestMat = lambert();
    private readonly bellMat = lambert();
    private readonly sunMat = new MeshBasicMaterial({fog: false});
    private readonly sunGlowMat = glowMaterial();
    private readonly glowMat = glowMaterial();
    private readonly groundMat = new MeshLambertMaterial({vertexColors: true});

    private readonly chopper: Woodsman;
    private readonly hatcher: Woodsman;
    private readonly sawyers: Woodsman[];
    private readonly log: Mesh;
    private readonly halves: Mesh[];
    private readonly kindling: Mesh;
    private readonly splits: Mesh[];
    private readonly felled = new Group();
    private readonly saw: Mesh;
    private readonly peckHead = new Group();
    private readonly bell = new Group();
    private readonly bellGlow: Mesh;
    private readonly maples: Maple[] = [];
    private readonly fallen: InstancedMesh;
    private readonly backTrunks: InstancedMesh;
    private readonly backCrowns: InstancedMesh;
    private readonly litter: InstancedMesh;
    private readonly ground: Mesh;

    constructor() {
        const {scene} = this.stage;
        scene.add(this.sky.mesh);

        // The chopper, his block and the log he splits.
        this.chopper = new Woodsman(this.mats, 1.25);
        this.chopper.group.position.copy(CHOP);
        this.chopper.hands.add(axe(this.handleMat, this.steelMat, 0.85));
        const block = new Mesh(new CylinderGeometry(0.48, 0.55, 0.55, 10), this.woodMat);
        block.position.set(CHOP_BLOCK.x, 0.275, CHOP_BLOCK.z);
        this.log = new Mesh(new CylinderGeometry(0.24, 0.24, 0.6, 9), this.endMat);
        this.halves = [0, 1].map(() => new Mesh(new CylinderGeometry(0.24, 0.24, 0.6, 9, 1, false, 0, Math.PI), this.endMat));
        scene.add(this.chopper.group, block, this.log, ...this.halves);

        // The hatchet man at the kindling block.
        this.hatcher = new Woodsman(this.hatchMats, 1.1);
        this.hatcher.group.position.copy(HATCH);
        this.hatcher.hands.add(axe(this.handleMat, this.steelMat, 0.5));
        const stand = new Mesh(new CylinderGeometry(0.38, 0.42, 0.95, 10), this.woodMat);
        stand.position.set(HATCH_BLOCK.x, 0.475, HATCH_BLOCK.z);
        this.kindling = new Mesh(new BoxGeometry(0.12, 0.42, 0.12), this.endMat);
        this.splits = [0, 1].map(() => new Mesh(new BoxGeometry(0.06, 0.42, 0.12), this.endMat));
        scene.add(this.hatcher.group, stand, this.kindling, ...this.splits);

        // The sawn tree: a stump, and the tree above the cut pivoting on its far edge.
        const stump = new Mesh(new CylinderGeometry(TREE_R, TREE_R + 0.08, CUT, 9), this.barkMat);
        stump.position.set(TREE.x, CUT / 2, TREE.z);
        this.felled.position.set(TREE.x, CUT, TREE.z - TREE_R);
        const trunk = new Mesh(new CylinderGeometry(TREE_R * 0.7, TREE_R, 5, 9), this.barkMat);
        trunk.position.set(0, 2.5, TREE_R);
        const crown = new Mesh(new IcosahedronGeometry(2.0, 0), this.crownMat);
        crown.position.set(0, 5.6, TREE_R);
        crown.scale.set(1, 1.2, 1);
        this.felled.add(trunk, crown);
        this.saw = new Mesh(new BoxGeometry(2.6, 0.2, 0.03), this.steelMat);
        this.sawyers = [1, -1].map((side) => {
            const w = new Woodsman(side > 0 ? this.mats : this.hatchMats, 1.15);
            w.group.position.set(TREE.x - side * 1.55, 0, TREE.z);
            w.group.rotation.y = side > 0 ? 0 : Math.PI;
            return w;
        });
        scene.add(stump, this.felled, this.saw, ...this.sawyers.map((w) => w.group));

        // The woodpecker's snag, and the cabin's dinner bell on its post.
        const snag = new Mesh(new CylinderGeometry(0.22, 0.34, 3.6, 7), this.barkMat);
        snag.position.set(SNAG.x, 1.8, SNAG.z);
        const bird = new Mesh(new SphereGeometry(0.3, 7, 5), this.birdMat);
        bird.scale.set(0.8, 1.4, 0.8);
        bird.position.set(SNAG.x + 0.5, PECK_Y - 0.3, SNAG.z);
        this.peckHead.position.set(SNAG.x + 0.55, PECK_Y + 0.2, SNAG.z);
        const head = new Mesh(new SphereGeometry(0.2, 7, 5), this.crestMat);
        const beak = new Mesh(new ConeGeometry(0.07, 0.34, 5), this.steelMat);
        beak.rotation.z = Math.PI / 2;
        beak.position.x = -0.3;
        this.peckHead.add(head, beak);
        scene.add(snag, bird, this.peckHead);
        const post = new Mesh(new BoxGeometry(0.16, 2.6, 0.16), this.woodMat);
        post.position.set(BELL.x, 1.3, BELL.z);
        const beam = new Mesh(new BoxGeometry(0.9, 0.12, 0.12), this.woodMat);
        beam.position.set(BELL.x + 0.35, 2.6, BELL.z);
        this.bell.position.set(BELL.x + 0.65, 2.55, BELL.z);
        const cup = new Mesh(new ConeGeometry(0.28, 0.42, 9, 1, true), this.bellMat);
        cup.material.side = DoubleSide;
        cup.position.y = -0.24;
        this.bell.add(cup);
        this.bellGlow = new Mesh(GLOW_QUAD, this.glowMat);
        scene.add(post, beam, this.bell, this.bellGlow);
        const cabin = new Mesh(new BoxGeometry(4, 2.6, 3.2), this.woodMat);
        cabin.position.set(BELL.x - 1.6, 1.3, BELL.z - 3.4);
        const roof = new Mesh(new CylinderGeometry(2.6, 2.6, 3.6, 3), this.endMat);
        roof.rotation.set(Math.PI / 2, 0, Math.PI / 2);
        roof.scale.set(1, 1, 0.5);
        roof.position.set(BELL.x - 1.6, 3.2, BELL.z - 3.4);
        scene.add(cabin, roof);

        // The three maples that play the pitched notes.
        for (const x of MAPLE_X) {
            const g = new Group();
            g.position.set(x, 0, MAPLE_Z);
            const mat = lambert();
            const topMat = lambert();
            const t = new Mesh(new CylinderGeometry(0.2, 0.32, 3.4, 7), this.barkMat);
            t.position.y = 1.7;
            const c = new Mesh(new IcosahedronGeometry(1.8, 0), mat);
            c.position.y = 4.6;
            c.scale.set(1, 1.15, 1);
            const top = new Mesh(new IcosahedronGeometry(1.1, 0), topMat);
            top.position.set(0.6, 6.1, 0.3);
            g.add(t, c, top);
            scene.add(g);
            this.maples.push({group: g, mat, topMat, base: new Color()});
        }
        this.fallen = new InstancedMesh(new PlaneGeometry(0.42, 0.3), new MeshLambertMaterial({side: DoubleSide}), MAX_LEAVES);
        scene.add(this.fallen);

        // The still forest round the clearing.
        const rnd = new SeededRandom(23);
        const trunkGeo = new CylinderGeometry(0.16, 0.26, 1, 6);
        trunkGeo.translate(0, 0.5, 0);
        this.backTrunks = new InstancedMesh(trunkGeo, lambert(), BACKDROP);
        this.backCrowns = new InstancedMesh(new IcosahedronGeometry(1, 0), lambert(), BACKDROP);
        for (let i = 0; i < BACKDROP; i++) {
            const a = rnd.range(-1.45, 1.45);
            const r = rnd.range(17, 40);
            const x = Math.sin(a) * r * 1.3;
            const z = -Math.cos(a) * r - 2;
            const h = rnd.range(3, 6);
            const cr = rnd.range(1.4, 2.4);
            this.place(x, 0, z, 1, h, 1);
            this.backTrunks.setMatrixAt(i, this.dummy.matrix);
            this.place(x, h + cr * 0.6, z, cr, cr * 1.2, cr);
            this.backCrowns.setMatrixAt(i, this.dummy.matrix);
        }
        this.litter = new InstancedMesh(new PlaneGeometry(0.5, 0.35).rotateX(-Math.PI / 2), lambert(), LITTER);
        for (let i = 0; i < LITTER; i++) {
            const x = rnd.range(-16, 16);
            const z = rnd.range(-12, 8);
            this.dummy.position.set(x, 0.02 + (i % 4) * 0.002, z);
            this.dummy.rotation.set(0, rnd.next() * TAU, 0);
            this.dummy.scale.setScalar(rnd.range(0.6, 1.1));
            this.dummy.updateMatrix();
            this.litter.setMatrixAt(i, this.dummy.matrix);
        }
        this.ground = new Mesh(groundGeometry(-60, -60, 60, 20, 24, 16, () => 0), this.groundMat);
        scene.add(this.backTrunks, this.backCrowns, this.litter, this.ground);

        const sun = new Mesh(new SphereGeometry(12, 16, 10), this.sunMat);
        sun.position.set(-40, 24, -220);
        const sunGlow = new Mesh(GLOW_QUAD, this.sunGlowMat);
        sunGlow.position.z = 14;
        sunGlow.scale.set(110, 110, 1);
        sun.add(sunGlow);
        scene.add(sun);
        this.stage.sun.position.set(-14, 16, 10);
        this.stage.uncull();
    }

    private place(x: number, y: number, z: number, sx: number, sy: number, sz: number): void {
        const d = this.dummy;
        d.position.set(x, y, z);
        d.rotation.set(0, 0, 0);
        d.scale.set(sx, sy, sz);
        d.updateMatrix();
    }

    layout(s: VizServices): void {
        const c = bakeHarvest(s.theme);
        this.colors = c;
        const horizon = c.sun.clone().lerp(c.leaves[2], 0.4);
        const haze = horizon.clone().lerp(c.leaves[0], 0.25).lerp(c.sky, 0.25);
        this.sky.paint(c.sky.clone().lerp(c.violet, 0.3).lerp(c.cream, 0.15), horizon, haze);
        this.stage.fit(s, haze, c.sun.clone().lerp(c.cream, 0.3), c.soil);
        this.stage.sun.intensity = 2.6;
        this.stage.fill.intensity = 1.4;
        this.sunMat.color.copy(c.cream).multiplyScalar(1.2);
        this.sunGlowMat.color.copy(c.leaves[2]).lerp(c.cream, 0.4).multiplyScalar(0.9);

        this.mats.shirt.color.copy(c.leaves[1]);
        this.mats.pants.color.copy(c.violet).lerp(c.soil, 0.4);
        this.mats.skin.color.copy(c.cream).lerp(c.pumpkin, 0.3);
        this.mats.cap.color.copy(c.leaves[3]).lerp(c.soil, 0.3);
        this.mats.beard.color.copy(c.bark).lerp(c.leaves[3], 0.3);
        this.hatchMats.shirt.color.copy(c.leaves[4]).lerp(c.straw, 0.2);
        this.hatchMats.pants.color.copy(c.bark).lerp(c.soil, 0.4);
        this.hatchMats.cap.color.copy(c.leaves[2]);
        this.handleMat.color.copy(c.straw).lerp(c.bark, 0.3);
        this.steelMat.color.copy(c.cream).lerp(c.violet, 0.45);
        this.woodMat.color.copy(c.bark).lerp(c.straw, 0.15);
        this.endMat.color.copy(c.straw).lerp(c.cream, 0.25);
        this.barkMat.color.copy(c.bark).lerp(c.soil, 0.35);
        this.crownMat.color.copy(c.leaves[2]).lerp(c.cream, 0.3);
        this.birdMat.color.copy(c.soil).lerp(c.violet, 0.3);
        this.crestMat.color.copy(c.leaves[1]);
        this.bellMat.color.copy(c.leaves[2]).lerp(c.cream, 0.2);
        this.maples.forEach((m, i) => m.base.copy(c.leaves[[0, 3, 1][i]]));

        paintGround(this.ground.geometry, c);
        const back = [c.leaves[0], c.leaves[1], c.leaves[2], c.leaves[3], c.leaves[4]];
        // The backdrop is dimmed so the three maples that play stand out against it.
        for (let i = 0; i < BACKDROP; i++) {
            this.backTrunks.setColorAt(i, this.tint.copy(c.bark).lerp(c.soil, 0.3));
            this.backCrowns.setColorAt(i, this.tint.copy(back[hash32(i, 5) % back.length]).lerp(c.sky, 0.45).multiplyScalar(0.7));
        }
        for (let i = 0; i < LITTER; i++) {
            this.litter.setColorAt(i, this.tint.copy(back[hash32(i, 41) % back.length]).multiplyScalar(0.5));
        }
        for (const mesh of [this.backTrunks, this.backCrowns, this.litter]) markDirty(mesh);
        this.field.invalidate();
    }

    update(dt: number, s: VizServices): void {
        const field = this.field;
        field.update(dt, s);
        const cycle = field.cycle;
        if (field.restarted) this.leaves.length = 0;
        for (const h of field.haps) {
            if (!field.crossed(h)) continue;
            h.done = true;
            h.team.activity = 1;
            if (isPitched(h.role)) this.drop(h);
        }
        age(this.leaves, dt, LEAF_LIFE);
        this.pose(cycle);
    }

    /** A note's maple lets go of a few leaves in its track colour. */
    private drop(h: Note): void {
        const m = MAPLE_ROLE.indexOf(h.role);
        for (let k = 0; k < 2; k++) {
            if (this.leaves.length >= MAX_LEAVES) this.leaves.shift();
            const r = (n: number) => rand01(hash32(h.seed, k * 8 + n)) - 0.5;
            this.leaves.push({age: 0, x: MAPLE_X[m] + r(1) * 3, y: 4.4 + r(2) * 2, z: MAPLE_Z + 1.2 + r(3) * 1.5,
                seed: hash32(h.seed, k), rgb: h.team.rgb});
        }
    }

    /** The stance of the voice `pick` selects, from its last onset and its next. */
    private stanceOf(cycle: number, pick: (h: Note) => boolean): Stance {
        const haps = this.field.haps;
        return stance(strike(cycle, lastOnset(haps, cycle, pick)), windup(cycle, nextOnset(haps, cycle, pick)));
    }

    private pose(cycle: number): void {
        const c = this.colors;
        if (!c) return;
        const shot = SHOTS[(((Math.floor((cycle - 1) / SHOT)) % SHOTS.length) + SHOTS.length) % SHOTS.length];
        const cam = this.stage.camera;
        cam.position.copy(shot.pos);
        cam.lookAt(shot.look);
        this.sky.mesh.position.copy(cam.position);

        const haps = this.field.haps;
        const kick = this.stanceOf(cycle, isKick);
        const sw = AXE[kick];
        this.chopper.pose(sw.arm, sw.lean);
        this.split(cycle, kick, lastOnset(haps, cycle, isKick), this.log, this.halves, CHOP_BLOCK, 0.55, 0.3);
        const snare = this.stanceOf(cycle, isSnare);
        const hw = HATCHET[snare];
        this.hatcher.pose(hw.arm, hw.lean);
        this.split(cycle, snare, lastOnset(haps, cycle, isSnare), this.kindling, this.splits, HATCH_BLOCK, 0.95, 0.21);

        const peck = PECK[this.stanceOf(cycle, isHat)];
        this.peckHead.position.x = SNAG.x + 0.55 + peck.reach * 1.6;
        this.peckHead.rotation.z = peck.tip;

        this.bell.rotation.z = BELL_SWING[this.stanceOf(cycle, isCrash)];
        const ring = strike(cycle, lastOnset(haps, cycle, isCrash), 1 / 16);
        this.bellGlow.visible = ring > 0.05;
        this.bellGlow.position.set(BELL.x + 0.65, 2.25, BELL.z + 0.3);
        this.bellGlow.quaternion.copy(cam.quaternion);
        this.bellGlow.scale.setScalar(1.2 + ring * 2.4);
        this.glowMat.color.copy(c.cream).lerp(c.leaves[2], 0.4).multiplyScalar(ring);

        this.poseMaples(cycle, c);
        this.poseSaw(cycle);
        this.poseLeaves(c);
    }

    /**
     * A block's log: whole from the wind-up until the hit, then split, the
     * halves thrown apart and lying where they fell until the next wind-up.
     */
    private split(cycle: number, pose: Stance, last: number, whole: Mesh, parts: Mesh[], at: Vector3, top: number, h: number): void {
        const fresh = pose === 'ready' || last === -Infinity || cycle - last > 1;
        whole.visible = fresh;
        whole.position.set(at.x, top + h / 2, at.z);
        for (const [i, part] of parts.entries()) {
            part.visible = !fresh;
            const side = i === 0 ? -1 : 1;
            // On the onset the halves have just parted; a sixteenth later they are down off the block.
            const flown = 1 - strike(cycle, last, 1 / 48);
            part.position.set(at.x + side * (0.05 + flown * 0.55), top + h / 2 - flown * (top - 0.02 + 0.05), at.z);
            part.rotation.set(0, i === 0 ? 0 : Math.PI, side * flown * 1.2);
        }
    }

    /** Each maple's crown from its register's notes: gathered, struck, and coloured while a note holds. */
    private poseMaples(cycle: number, c: Harvest): void {
        for (const [i, m] of this.maples.entries()) {
            const role = MAPLE_ROLE[i];
            const pose = this.stanceOf(cycle, MAPLE_PICK[i]);
            m.group.scale.set(CROWN[pose], CROWN[pose] * (pose === 'hit' ? 1.04 : 1), CROWN[pose]);
            let lit = 0;
            for (const h of this.field.haps) {
                if (h.role !== role) continue;
                const v = held(cycle, h.begin, h.end, TAIL) * h.fade;
                if (v <= lit) continue;
                lit = v;
                setRgb(this.tint, h.team.rgb);
            }
            m.mat.color.copy(m.base);
            if (lit > 0) m.mat.color.lerp(this.tint, 0.6 * lit).multiplyScalar(1 + 0.35 * lit);
            m.topMat.color.copy(m.mat.color).multiplyScalar(1.12);
            if (pose === 'hit') m.mat.color.lerp(c.cream, 0.25);
        }
    }

    /**
     * The phrase. Bar 0: the tree lies where it fell, landing on the
     * downbeat. Bars 1–3: the saw strokes on every beat; through bar 3 the
     * tree leans a step per beat, then goes over on the last.
     */
    private poseSaw(cycle: number): void {
        const start = Math.floor(cycle / PHRASE) * PHRASE;
        const bar = Math.floor(cycle) - start;
        const beat = beatIndex(cycle);
        const next = start + PHRASE;
        let tilt: number;
        if (bar === 0) {
            const t = cycle - start;
            // Down on the downbeat, a bounce, then still.
            tilt = FELLED - (t < 1 / 16 ? Math.sin((t * 16) * Math.PI) * 0.12 : 0);
        } else if (bar === PHRASE - 1) {
            tilt = LEAN[beat];
            if (beat === 3) tilt += (FELLED - LEAN[3]) * windup(cycle, next, 1 / 4) ** 2;
        } else {
            tilt = 0;
        }
        this.felled.rotation.x = -tilt;

        // A stroke a beat, snapping to the far end, sawyers pulling in turn.
        const sawing = bar > 0;
        const dir = beat % 2 === 0 ? 1 : -1;
        const x = dir * SAW_REACH * (1 - 2 * strike(cycle, Math.floor(cycle * 4) / 4, 1 / 48));
        this.saw.visible = sawing;
        this.saw.position.set(TREE.x + x, CUT + 0.05, TREE.z);
        for (const [i, w] of this.sawyers.entries()) {
            if (!sawing) {
                w.pose(0.25, 0);
                continue;
            }
            // The left sawyer has the saw close when it has run left.
            const near = (i === 0 ? -x : x) / SAW_REACH;
            w.pose(1.05 - near * 0.35, 0.5);
        }
    }

    private poseLeaves(c: Harvest): void {
        const d = this.dummy;
        for (let i = 0; i < MAX_LEAVES; i++) {
            const l = this.leaves[i];
            if (!l) { hide(this.fallen, i); continue; }
            const t = l.age;
            const y = Math.max(0.04, l.y - t * 1.9);
            const down = y <= 0.04;
            d.position.set(l.x + Math.sin(t * 3 + (l.seed & 15)) * 0.5, y, l.z);
            if (down) d.rotation.set(-Math.PI / 2, 0, (l.seed & 63) * 0.1);
            else d.rotation.set(t * 2.3 + (l.seed & 7), t * 1.7, t * 3.1);
            d.scale.setScalar(clamp01((LEAF_LIFE - t) / 0.5));
            d.updateMatrix();
            this.fallen.setMatrixAt(i, d.matrix);
            this.fallen.setColorAt(i, setRgb(this.tint, l.rgb).lerp(c.cream, 0.1).multiplyScalar(1.3));
        }
        markDirty(this.fallen);
    }

    render(ctx: CanvasRenderingContext2D, s: VizServices): void {
        this.stage.draw(ctx, s);
    }
}

/** The felled tree's tilt, resting on its crown, and its lean on each beat of the count. */
const FELLED = Math.PI / 2 - 0.1;
const LEAN = [0.08, 0.18, 0.3, 0.45];

function lambert(): MeshLambertMaterial {
    return new MeshLambertMaterial({flatShading: true});
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
