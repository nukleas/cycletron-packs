/**
 * PARADE: a Thanksgiving marching band halted at the reviewing stand, seen
 * from the kerb. Everyone in it plays one voice, and every hit lands on the
 * frame its note sounds:
 *
 * - The drum line. The bass drummer plays the kicks, two snare drummers
 *   split the snares hit by hit, the cymbal player the crashes. Each pair of
 *   sticks has three poses: at rest, cocked over the head an eighth of a bar
 *   before the next hit, and on the head on the onset.
 * - The horns, three ranks of four, one per register: trumpets play the
 *   high notes, trombones the middle, sousaphones the bass. Within its rank
 *   each pitched track has its own player (by track slot), who brings the
 *   horn up half a bar before their line starts, kicks the bell up and flares
 *   it in the track colour on each note, and holds it while the note holds.
 *   A trombone's slide runs out for low notes and in for high ones, and is
 *   set for the next note before it sounds. A sousaphone is worn, so its
 *   player only kicks and lights the bell over their head.
 * - The drum major counts the phrase: the mace keeps time, climbs a step on
 *   each beat of the last bar of every four, and is thrust forward on the
 *   downbeat.
 * - The whole band marks time on the beat. The camera cuts every two bars,
 *   and is wide for each phrase's last two bars so the count is seen. One
 *   balloon float crosses behind the band per phrase, dipping on the beat.
 *   Snares and crashes also throw confetti off the roofs; hats bounce the
 *   crowd.
 */

import type {VizMode, VizModeDef, VizServices} from '@cycletron/viz-sdk';
import {type FieldHap, type FieldTeam, HapField} from '@cycletron/viz-sdk';
import {clamp01, hash32, rand01, SeededRandom} from '@cycletron/viz-sdk';
import {
    BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, DynamicDrawUsage, Float32BufferAttribute,
    InstancedMesh, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D,
    PlaneGeometry, SphereGeometry, Vector3,
} from 'three';
import {type Role} from '@naderlabs/kit/roles';
import {beatIndex, beatPhase, beatsLeft, held, HIT, lastOnset, nextOnset, type Stance, stance, strike, windup} from '@naderlabs/kit/timing';
import {setRgb} from '@naderlabs/kit/gl';
import {bakeHarvest, type Harvest} from '../../lib/colors.js';
import {GLOW_QUAD, glowMaterial} from '../../lib/glow.js';
import {age, hide, markDirty} from '../../lib/instances.js';
import {harvestRole} from '../../lib/roles.js';
import {SkyDome} from '../../lib/sky.js';
import {Stage} from '../../lib/stage.js';
import {acorn, type Balloon, type BalloonMats, pumpkinFloat, turkey} from './balloons.js';
import {
    SLIDE_RUN, slideGeometry, SOUSA_BELL_X, SOUSA_BELL_Y, sousaBellGeometry, sousaRingGeometry, TROMBONE_BELL,
    tromboneGeometry, TRUMPET_BELL, trumpetGeometry,
} from './instruments.js';

/** Two bars, so a note on the next downbeat is in view for its wind-up. */
const LOOKAHEAD = 2;
/** Bars per phrase: the drum major's count, and one balloon crossing. */
const PHRASE = 4;
/** Bars per camera shot. */
const SHOT = 2;
/** A horn comes up this long before its line starts. */
const HORN_LEAD = 0.5;
/** Files across the march (depth), and where each stands. */
const FILE_Z = [-1.6, -0.3, 1.0, 2.3];
/** The horn ranks, front to back: trumpets, trombones, sousaphones. */
const HORN_RANKS = [1.2, -0.8, -2.8];
const TRUMPETS = 0;
const TROMBONES = 1;
/** The rank that plays each register. */
const RANK_OF: Partial<Record<Role, number>> = {lead: TRUMPETS, mid: TROMBONES, bass: 2};
const FILES = FILE_Z.length;
const HORNS = HORN_RANKS.length * FILES;
/** The trombones' range, top to bottom: the slide is in at the top and all the way out at the bottom. */
const SLIDE_TOP = 72;
const SLIDE_SPAN = 24;
const DRUM_X = 3.2;
const MAJOR_X = 5.6;
const MAJOR_Z = 0.6;
/** The drum line, far file to near: the bass drum, two snares, the cymbals. */
const BASS = 0;
const CYMBAL = 3;
const SNARES = [1, 2];
/** Drum major, drum line, horns, and the four handlers of the one balloon. */
const MAX_PEOPLE = 1 + FILE_Z.length + HORNS + 4;
const HORN_ARMS = 2 * FILE_Z.length;
const MAJOR_ARM = HORN_ARMS + HORNS;
const STICKS = 2 * FILE_Z.length;
/** Two arms for each drummer, one for each horn player and the drum major. */
const ARMS = 2 * FILE_Z.length + HORNS + 1;
const FAR = 46;
const NEAR = 12;
const CROWD = FAR + NEAR;
const MAX_CONFETTI = 260;
const CONFETTI_LIFE = 3.2;
const TAIL = 0.4;
const KERB = -7.4;
const FACADE = -10;
const BALLOON_Z = -4.6;
const BALLOON_Y = 6.3;

/**
 * Each player's pose as arm and stick angles about z. An arm hangs from the
 * shoulder: 0 is straight down, π/2 straight forward along +x, π overhead.
 * A stick (or mallet) is a world angle from +x, held at the hand.
 */
interface Grip {
    arm: number;
    stick: number;
}

const SNARE_GRIP: Record<Stance, Grip> = {rest: {arm: 0.7, stick: 0.05}, ready: {arm: 2.4, stick: 1.35}, hit: {arm: 0.9, stick: -0.6}};
const BASS_GRIP: Record<Stance, Grip> = {rest: {arm: 0.5, stick: -1.3}, ready: {arm: 2.6, stick: 2.0}, hit: {arm: 1.15, stick: 2.75}};
/** The cymbals clap vertically: the upper plate's arm and the lower's. */
const CYMBAL_ARMS: Record<Stance, [number, number]> = {rest: [0.6, 0.35], ready: [2.5, 0.35], hit: [1.4, 1.25]};
/** The direction a horn's bell points: down at the chest at rest, level to play, kicked up on a note. */
const HORN_TILT: Record<Stance, number> = {rest: -1.1, ready: 0, hit: 0.35};
const HORN_ARM: Record<Stance, number> = {rest: 0.25, ready: 1.45, hit: 1.6};
/** A sousaphone player's hand stays on the valves; the bell kicks back on a note. */
const SOUSA_ARM = 1.2;
const SOUSA_KICK = 0.25;
const ARM = 0.62;
const SHOULDER = 0.88;

interface Shot {
    pos: Vector3;
    look: Vector3;
}

/** Drum line close, wide, horns close, wide: the wide shots carry each phrase's count. */
const SHOTS: Shot[] = [
    {pos: new Vector3(6.4, 2.1, 6.4), look: new Vector3(3.4, 1.4, 0.2)},
    {pos: new Vector3(2.0, 5.6, 14.5), look: new Vector3(2.0, 1.6, -1)},
    {pos: new Vector3(0.9, 2.2, 6.4), look: new Vector3(-0.9, 1.5, 0)},
    {pos: new Vector3(2.0, 5.6, 14.5), look: new Vector3(2.0, 1.6, -1)},
];

interface Team extends FieldTeam {}

interface Note extends FieldHap<Team> {
    role: Role;
}

interface Bit {
    age: number;
    x: number;
    y: number;
    z: number;
    vx: number;
    vz: number;
    seed: number;
}

interface Building {
    x: number;
    w: number;
    h: number;
    tint: number;
}

/** A drum voice's pose this frame: the stance, and how hard the last hit still rings. */
interface Play {
    stance: Stance;
    ring: number;
}

class ParadeMode implements VizMode {
    private readonly stage = new Stage(46, 0.3, 500, 40, 160);
    private readonly sky = new SkyDome(350);
    private readonly field = new HapField<Team, Note>({
        lookahead: LOOKAHEAD,
        maxHaps: 400,
        maxPerTrack: 80,
        idleRate: 0.25,
        team: (base) => base,
        hap: (base) => ({...base, role: harvestRole(base.team.name, base.note)}),
        keep: (h, cycle) => h.end + TAIL >= cycle,
    });
    private readonly dummy = new Object3D();
    private readonly tint = new Color();
    private readonly hot = new Color();
    private readonly bell = new Vector3();
    private readonly confetti: Bit[] = [];
    private readonly crowdHop = new Float32Array(CROWD);
    private readonly buildings: Building[] = [];
    private colors: Harvest | null = null;

    /** Per horn player: pose, how lit the bell is, and in which colour. */
    private readonly hornPose: Stance[] = Array.from({length: HORNS}, (): Stance => 'rest');
    private readonly hornLit = new Float32Array(HORNS);
    private readonly hornRgb = new Float32Array(HORNS * 3);
    private readonly hornStruck = new Float32Array(HORNS);
    private readonly hornWound = new Float32Array(HORNS);
    /** Per horn player: the onset and pitch of the last note and the next, for the trombone slides. */
    private readonly hornLast = new Float32Array(HORNS);
    private readonly hornNext = new Float32Array(HORNS);
    private readonly lastNote = new Float32Array(HORNS);
    private readonly nextNote = new Float32Array(HORNS);
    private readonly kick: Play = {stance: 'rest', ring: 0};
    private readonly crash: Play = {stance: 'rest', ring: 0};
    private readonly snare: Play[] = SNARES.map((): Play => ({stance: 'rest', ring: 0}));

    private readonly uniformMat = new MeshLambertMaterial({flatShading: true});
    private readonly legs: InstancedMesh;
    private readonly torsos: InstancedMesh;
    private readonly heads: InstancedMesh;
    private readonly hats: InstancedMesh;
    private readonly plumes: InstancedMesh;
    private readonly trumpets: InstancedMesh;
    private readonly trombones: InstancedMesh;
    private readonly slides: InstancedMesh;
    private readonly sousaRings: InstancedMesh;
    private readonly sousaBells: InstancedMesh;
    private readonly glows: InstancedMesh;
    private readonly sticks: InstancedMesh;
    private readonly arms: InstancedMesh;
    /** The hand `arm()` last placed. */
    private handX = 0;
    private handY = 0;
    private readonly snareDrums: InstancedMesh;
    private readonly bassDrum: Mesh;
    private readonly cymbals: InstancedMesh;
    private readonly mace: Mesh;
    private readonly maceHead: Mesh;
    private readonly crowdBodies: InstancedMesh;
    private readonly crowdHeads: InstancedMesh;
    private readonly bits: InstancedMesh;
    private readonly blocks: InstancedMesh;
    private readonly cornices: InstancedMesh;
    private readonly windows: InstancedMesh;
    private readonly pennants: InstancedMesh;
    private readonly balloons: Balloon[];
    private readonly ropes: LineSegments;
    private readonly ropePos: Float32BufferAttribute;
    private readonly ropeMat = new LineBasicMaterial();
    private readonly roadMat = new MeshLambertMaterial();
    private readonly walkMat = new MeshLambertMaterial();
    private readonly lineMat = new MeshBasicMaterial();
    private readonly windowMat = new MeshBasicMaterial();
    private readonly drumMat = lambert();
    private readonly maceMat = lambert();
    private readonly mats: BalloonMats = {
        body: lambert(), tail: [lambert(), lambert(), lambert(), lambert(), lambert()], beak: lambert(), wattle: lambert(),
        pumpkin: lambert(), stem: lambert(), nut: lambert(), cap: lambert(),
    };

    constructor() {
        const {scene} = this.stage;
        scene.add(this.sky.mesh);

        const legGeo = new BoxGeometry(0.16, 0.85, 0.16);
        legGeo.translate(0, -0.42, 0);
        this.legs = new InstancedMesh(legGeo, this.uniformMat, MAX_PEOPLE * 2);
        this.torsos = new InstancedMesh(new CylinderGeometry(0.3, 0.36, 0.95, 6), lambert(), MAX_PEOPLE);
        this.heads = new InstancedMesh(new SphereGeometry(0.24, 7, 5), lambert(), MAX_PEOPLE);
        this.hats = new InstancedMesh(new CylinderGeometry(0.22, 0.2, 0.5, 6), lambert(), MAX_PEOPLE);
        this.plumes = new InstancedMesh(new ConeGeometry(0.09, 0.4, 5), lambert(), MAX_PEOPLE);
        this.trumpets = new InstancedMesh(trumpetGeometry(), brass(), FILES);
        this.trombones = new InstancedMesh(tromboneGeometry(), brass(), FILES);
        this.slides = new InstancedMesh(slideGeometry(), lambert(), FILES);
        this.sousaRings = new InstancedMesh(sousaRingGeometry(), lambert(), FILES);
        this.sousaBells = new InstancedMesh(sousaBellGeometry(), brass(), FILES);
        this.glows = new InstancedMesh(GLOW_QUAD, glowMaterial(), HORNS + 3);
        // A stick pivots at the hand and reaches out along +x.
        const stickGeo = new BoxGeometry(0.7, 0.08, 0.08);
        stickGeo.translate(0.35, 0, 0);
        this.sticks = new InstancedMesh(stickGeo, lambert(), STICKS);
        const armGeo = new BoxGeometry(0.15, ARM, 0.15);
        armGeo.translate(0, -ARM / 2, 0);
        this.arms = new InstancedMesh(armGeo, lambert(), ARMS);
        this.snareDrums = new InstancedMesh(new CylinderGeometry(0.34, 0.34, 0.26, 12), lambert(), SNARES.length);
        const bassGeo = new CylinderGeometry(0.62, 0.62, 0.42, 14);
        bassGeo.rotateX(Math.PI / 2);
        this.bassDrum = new Mesh(bassGeo, this.drumMat);
        const cymbalGeo = new CylinderGeometry(0.36, 0.36, 0.04, 14);
        this.cymbals = new InstancedMesh(cymbalGeo, lambert(), 2);
        const maceGeo = new BoxGeometry(0.06, 1.5, 0.06);
        maceGeo.translate(0, 0.55, 0);
        this.mace = new Mesh(maceGeo, this.maceMat);
        this.maceHead = new Mesh(new SphereGeometry(0.16, 8, 6), this.maceMat);
        this.mace.add(this.maceHead);
        this.maceHead.position.set(0, 1.3, 0);
        scene.add(this.legs, this.torsos, this.heads, this.hats, this.plumes, ...this.brassMeshes(), this.glows, this.sticks,
            this.arms, this.snareDrums, this.bassDrum, this.cymbals, this.mace);

        this.crowdBodies = new InstancedMesh(new CylinderGeometry(0.3, 0.38, 1.3, 6), lambert(), CROWD);
        this.crowdHeads = new InstancedMesh(new SphereGeometry(0.25, 7, 5), lambert(), CROWD);
        scene.add(this.crowdBodies, this.crowdHeads);

        const bitGeo = new PlaneGeometry(0.22, 0.14);
        this.bits = new InstancedMesh(bitGeo, new MeshLambertMaterial({side: DoubleSide}), MAX_CONFETTI);
        scene.add(this.bits);

        // The street, kerbs and the facades across it.
        const road = plane(200, 15, this.roadMat);
        road.position.set(0, 0, 0);
        const walkFar = plane(200, 6, this.walkMat);
        walkFar.position.set(0, 0.12, -10.5);
        const walkNear = plane(200, 10, this.walkMat);
        walkNear.position.set(0, 0.12, 12.5);
        const stripe = plane(200, 0.18, this.lineMat);
        stripe.position.set(0, 0.02, 4.2);
        scene.add(road, walkFar, walkNear, stripe);

        const rnd = new SeededRandom(5);
        for (let x = -90; x < 90;) {
            const w = rnd.range(6, 11);
            this.buildings.push({x: x + w / 2, w, h: rnd.range(6, 15), tint: rnd.next()});
            x += w + 0.15;
        }
        const nb = this.buildings.length;
        const boxGeo = new BoxGeometry(1, 1, 1);
        boxGeo.translate(0, 0.5, -0.5);
        this.blocks = new InstancedMesh(boxGeo, lambert(), nb);
        this.cornices = new InstancedMesh(boxGeo, lambert(), nb);
        let nWin = 0;
        for (const b of this.buildings) nWin += Math.floor((b.w - 1) / 1.6) * Math.floor((b.h - 2) / 2.2);
        this.windows = new InstancedMesh(new PlaneGeometry(0.8, 1.1), this.windowMat, nWin);
        this.buildings.forEach((b, i) => {
            this.place(b.x, 0, FACADE - 0.1, b.w, b.h, 8);
            this.blocks.setMatrixAt(i, this.dummy.matrix);
            this.place(b.x, b.h, FACADE + 0.2, b.w + 0.3, 0.45, 8.6);
            this.cornices.setMatrixAt(i, this.dummy.matrix);
        });
        let w = 0;
        this.buildings.forEach((b) => {
            const cols = Math.floor((b.w - 1) / 1.6);
            const rows = Math.floor((b.h - 2) / 2.2);
            for (let r = 0; r < rows; r++) {
                for (let k = 0; k < cols; k++) {
                    this.place(b.x + (k - (cols - 1) / 2) * 1.6, 2.6 + r * 2.2, FACADE + 0.01, 1, 1, 1);
                    this.windows.setMatrixAt(w++, this.dummy.matrix);
                }
            }
        });
        scene.add(this.blocks, this.cornices, this.windows);

        // Bunting along the far kerb, sagging between poles.
        const pennantGeo = new BufferGeometry();
        pennantGeo.setAttribute('position', new Float32BufferAttribute([-0.3, 0, 0, 0.3, 0, 0, 0, -0.65, 0], 3));
        pennantGeo.computeVertexNormals();
        this.pennants = new InstancedMesh(pennantGeo, new MeshLambertMaterial({side: DoubleSide}), 120);
        scene.add(this.pennants);

        this.balloons = [turkey(this.mats), pumpkinFloat(this.mats), acorn(this.mats)];
        for (const b of this.balloons) {
            b.group.scale.setScalar(1.3);
            scene.add(b.group);
        }
        this.ropePos = new Float32BufferAttribute(new Float32Array(4 * 2 * 3), 3);
        this.ropePos.setUsage(DynamicDrawUsage);
        const ropeGeo = new BufferGeometry();
        ropeGeo.setAttribute('position', this.ropePos);
        this.ropes = new LineSegments(ropeGeo, this.ropeMat);
        this.ropes.frustumCulled = false;
        scene.add(this.ropes);

        this.stage.sun.position.set(-20, 30, 25);
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
        const horizon = c.sun.clone().lerp(c.cream, 0.3);
        const zenith = c.sky.clone().lerp(c.violet, 0.4).lerp(c.cream, 0.25);
        this.sky.paint(zenith, horizon, horizon);
        this.stage.fit(s, horizon.clone().lerp(zenith, 0.3), c.cream.clone().lerp(c.sun, 0.5), c.soil);
        this.stage.sun.intensity = 2.3;
        this.stage.fill.intensity = 1.5;
        const asphalt = new Color(s.theme.bg).lerp(c.violet, 0.3);
        this.roadMat.color.copy(asphalt).lerp(c.cream, 0.08);
        this.walkMat.color.copy(c.cream).lerp(c.ground, 0.55);
        this.lineMat.color.copy(c.leaves[2]);
        this.windowMat.color.copy(c.cream).lerp(c.leaves[2], 0.35).multiplyScalar(0.9);
        this.ropeMat.color.copy(c.cream).multiplyScalar(0.8);
        this.uniformMat.color.copy(c.cream).multiplyScalar(0.95);
        this.maceMat.color.copy(c.leaves[2]).lerp(c.cream, 0.3);
        const m = this.mats;
        m.body.color.copy(c.bark).lerp(c.leaves[3], 0.3);
        m.tail.forEach((mat, i) => mat.color.copy(c.leaves[i % c.leaves.length]));
        m.beak.color.copy(c.leaves[2]);
        m.wattle.color.copy(c.leaves[1]);
        m.pumpkin.color.copy(c.pumpkin);
        m.stem.color.copy(c.leaves[4]);
        m.nut.color.copy(c.straw).lerp(c.bark, 0.45);
        m.cap.color.copy(c.bark).lerp(c.soil, 0.3);

        const facade = [c.leaves[3], c.cream, c.leaves[1], c.bark, c.straw];
        this.buildings.forEach((b, i) => {
            this.tint.copy(facade[Math.floor(b.tint * facade.length)]).lerp(c.ground, 0.3);
            this.blocks.setColorAt(i, this.tint);
            this.cornices.setColorAt(i, this.tint.multiplyScalar(0.7));
        });
        for (let i = 0; i < CROWD; i++) {
            this.tint.copy(c.leaves[hash32(i, 3) % c.leaves.length]).lerp(c.ground, 0.25);
            if (i >= FAR) this.tint.lerp(c.soil, 0.55);
            this.crowdBodies.setColorAt(i, this.tint);
            this.crowdHeads.setColorAt(i, i >= FAR ? this.tint.copy(c.bark).lerp(c.soil, 0.5) : this.skin(c));
        }
        for (let i = 0; i < 120; i++) this.pennants.setColorAt(i, c.leaves[i % 3 === 2 ? 2 : i % 3]);
        for (let i = 0; i < MAX_CONFETTI; i++) this.bits.setColorAt(i, i % 4 === 3 ? c.cream : c.leaves[i % c.leaves.length]);
        this.tint.copy(c.cream).multiplyScalar(0.85);
        for (let i = 0; i < STICKS; i++) this.sticks.setColorAt(i, this.tint);
        for (let i = 0; i < ARMS; i++) this.arms.setColorAt(i, c.leaves[i === ARMS - 1 ? 3 : 1]);
        this.tint.copy(c.cream).lerp(c.leaves[1], 0.25);
        for (let i = 0; i < SNARES.length; i++) this.snareDrums.setColorAt(i, this.tint);
        this.tint.copy(c.leaves[2]).lerp(c.cream, 0.2);
        for (let i = 0; i < FILES; i++) {
            this.slides.setColorAt(i, this.tint);
            this.sousaRings.setColorAt(i, this.tint);
        }
        this.tint.copy(c.leaves[2]).lerp(c.cream, 0.35);
        for (let i = 0; i < 2; i++) this.cymbals.setColorAt(i, this.tint);
        for (const mesh of [this.blocks, this.cornices, this.crowdBodies, this.crowdHeads, this.pennants, this.bits,
            this.sticks, this.arms, this.snareDrums, this.cymbals, this.slides, this.sousaRings]) markDirty(mesh);
        this.field.invalidate();
    }

    private skin(c: Harvest): Color {
        return this.hot.copy(c.cream).lerp(c.pumpkin, 0.25);
    }

    update(dt: number, s: VizServices): void {
        const field = this.field;
        field.update(dt, s);
        const cycle = field.cycle;
        if (field.restarted) {
            this.confetti.length = 0;
            this.crowdHop.fill(0);
        }
        for (const h of field.haps) {
            if (!field.crossed(h)) continue;
            h.done = true;
            h.team.activity = 1;
            if (h.role === 'snare') this.throwConfetti(h.seed, 10);
            else if (h.role === 'crash') this.throwConfetti(h.seed, 26);
            else if (h.role === 'hat') for (let k = 0; k < 4; k++) this.crowdHop[hash32(h.seed, k) % CROWD] = 1;
        }
        for (const b of this.confetti) {
            b.vx *= Math.exp(-dt * 1.2);
            b.vz *= Math.exp(-dt * 1.2);
            b.x += (b.vx + Math.sin(b.age * 3 + (b.seed & 15)) * 0.6) * dt;
            b.z += b.vz * dt;
            b.y = Math.max(0.05, b.y - (b.age < 0.3 ? -2 : 1.4) * dt);
        }
        age(this.confetti, dt, CONFETTI_LIFE);
        const k = Math.exp(-dt * 7);
        for (let i = 0; i < CROWD; i++) this.crowdHop[i] *= k;

        this.play(this.kick, cycle, (h) => h.role === 'kick');
        this.play(this.crash, cycle, (h) => h.role === 'crash');
        // The snares go hit by hit to the two drummers, by where in the bar each falls.
        for (let i = 0; i < this.snare.length; i++) {
            this.play(this.snare[i], cycle, (h) => h.role === 'snare' && sixteenth(h.begin) % 2 === i);
        }
        this.playHorns(cycle);
        this.pose(cycle);
    }

    /** Pose the voice `pick` selects from its last hit and its next. */
    private play(out: Play, cycle: number, pick: (h: Note) => boolean): void {
        out.ring = strike(cycle, lastOnset(this.field.haps, cycle, pick));
        out.stance = stance(out.ring, windup(cycle, nextOnset(this.field.haps, cycle, pick)));
    }

    /** Each horn player's pose and bell from the pitched notes of the tracks they play. */
    private playHorns(cycle: number): void {
        const struck = this.hornStruck.fill(0);
        const wound = this.hornWound.fill(0);
        this.hornLit.fill(0);
        this.hornLast.fill(-Infinity);
        this.hornNext.fill(Infinity);
        for (const h of this.field.haps) {
            const rank = RANK_OF[h.role];
            if (rank === undefined) continue;
            const i = rank * FILES + (h.team.slot % FILES);
            if (h.begin <= cycle && h.begin > this.hornLast[i]) {
                this.hornLast[i] = h.begin;
                this.lastNote[i] = h.note;
            } else if (h.begin > cycle && h.begin < this.hornNext[i]) {
                this.hornNext[i] = h.begin;
                this.nextNote[i] = h.note;
            }
            struck[i] = Math.max(struck[i], strike(cycle, h.begin));
            wound[i] = Math.max(wound[i], windup(cycle, h.begin, HORN_LEAD));
            const lit = held(cycle, h.begin, h.end, TAIL) * h.fade;
            if (lit <= this.hornLit[i]) continue;
            this.hornLit[i] = lit;
            setRgb(this.tint, h.team.rgb);
            this.hornRgb[i * 3] = this.tint.r;
            this.hornRgb[i * 3 + 1] = this.tint.g;
            this.hornRgb[i * 3 + 2] = this.tint.b;
        }
        for (let i = 0; i < HORNS; i++) {
            const pose = stance(struck[i], wound[i]);
            // A held note keeps the horn up between hits.
            this.hornPose[i] = pose === 'rest' && this.hornLit[i] > 0 ? 'ready' : pose;
        }
    }

    private throwConfetti(seed: number, n: number): void {
        const r = (k: number) => rand01(hash32(seed, k));
        const x0 = (r(1) - 0.5) * 36;
        const b = this.buildings[Math.floor(clamp01((x0 + 90) / 180) * (this.buildings.length - 1))];
        for (let i = 0; i < n; i++) {
            if (this.confetti.length >= MAX_CONFETTI) this.confetti.shift();
            const q = (k: number) => rand01(hash32(seed, i * 16 + k + 3));
            this.confetti.push({age: 0, x: x0 + (q(1) - 0.5) * 3, y: (b ? b.h : 10) + 0.5, z: FACADE + 0.4,
                vx: (q(2) - 0.5) * 6, vz: 1.5 + q(3) * 4, seed: hash32(seed, i)});
        }
    }

    private pose(cycle: number): void {
        const c = this.colors;
        if (!c) return;
        const shot = SHOTS[Math.floor(cycle / SHOT) % SHOTS.length];
        const cam = this.stage.camera;
        cam.position.copy(shot.pos);
        cam.lookAt(shot.look);

        let p = 0;
        let glows = 0;
        p = this.poseMajor(cycle, p, c);
        p = this.poseDrumLine(cycle, p, c);
        for (let i = 0; i < HORNS; i++) {
            const rank = Math.floor(i / FILES);
            const x = HORN_RANKS[rank];
            const z = FILE_Z[i % FILES];
            const y = this.march(p, x, z, cycle, c.leaves[1], c.cream);
            p++;
            const lit = this.hornLit[i];
            this.hot.setRGB(this.hornRgb[i * 3], this.hornRgb[i * 3 + 1], this.hornRgb[i * 3 + 2]);
            this.tint.copy(c.leaves[2]).lerp(c.cream, 0.2);
            if (lit > 0) this.tint.lerp(this.hot, 0.6).multiplyScalar(1 + lit * 1.2);
            const bell = rank === TRUMPETS || rank === TROMBONES ? this.poseHorn(i, rank, x, y, z) : this.poseSousa(i, x, y, z);
            if (lit > 0) {
                const d = this.dummy;
                d.position.copy(bell);
                d.quaternion.copy(cam.quaternion);
                const gs = (0.9 + lit * 0.5 + (this.hornPose[i] === 'hit' ? 0.9 : 0)) * (rank === TRUMPETS || rank === TROMBONES ? 1 : 1.6);
                d.scale.set(gs, gs, 1);
                d.updateMatrix();
                this.glows.setMatrixAt(glows, d.matrix);
                this.glows.setColorAt(glows, this.hot.multiplyScalar(lit * 0.75));
                glows++;
            }
        }
        glows = this.glowDrums(glows, c);
        p = this.poseBalloon(cycle, p, c);
        for (let i = p; i < MAX_PEOPLE; i++) {
            for (const mesh of [this.torsos, this.heads, this.hats, this.plumes]) hide(mesh, i);
            hide(this.legs, i * 2);
            hide(this.legs, i * 2 + 1);
        }
        for (let i = glows; i < HORNS + 3; i++) hide(this.glows, i);

        this.poseCrowd(cycle);
        this.poseBunting(cycle);
        this.poseConfetti();
        for (const mesh of [this.legs, this.torsos, this.heads, this.hats, this.plumes, ...this.brassMeshes(), this.glows, this.sticks,
            this.arms, this.snareDrums, this.cymbals, this.crowdBodies, this.crowdHeads, this.pennants, this.bits]) markDirty(mesh);
    }

    /**
     * A trumpet or trombone, held in the near hand: down at the chest at
     * rest, up at the lips to play. Colours it with `tint` and returns where
     * its bell is.
     */
    private poseHorn(i: number, rank: number, x: number, y: number, z: number): Vector3 {
        const pose = this.hornPose[i];
        const file = i % FILES;
        const d = this.dummy;
        this.arm(HORN_ARMS + i, x, y, z + 0.3, HORN_ARM[pose]);
        const hx = pose === 'rest' ? this.handX : x + 0.3;
        const hy = pose === 'rest' ? this.handY : y + 1.12;
        const tilt = HORN_TILT[pose];
        const size = pose === 'hit' ? 1.15 : 1;
        d.position.set(hx, hy, z + 0.12);
        d.rotation.set(0, 0, tilt);
        d.scale.setScalar(size);
        d.updateMatrix();
        const mesh = rank === TRUMPETS ? this.trumpets : this.trombones;
        mesh.setMatrixAt(file, d.matrix);
        mesh.setColorAt(file, this.tint);
        if (rank === TROMBONES) {
            // The slide is set for the next note once the player is ready for it.
            const note = pose === 'ready' && Number.isFinite(this.hornNext[i]) ? this.nextNote[i] : this.lastNote[i];
            const out = SLIDE_RUN * clamp01((SLIDE_TOP - note) / SLIDE_SPAN);
            d.position.set(hx + Math.cos(tilt) * out, hy + Math.sin(tilt) * out, z + 0.12);
            d.updateMatrix();
            this.slides.setMatrixAt(file, d.matrix);
        }
        const reach = (rank === TRUMPETS ? TRUMPET_BELL : TROMBONE_BELL) * size;
        return this.bell.set(hx + Math.cos(tilt) * reach, hy + Math.sin(tilt) * reach, z + 0.25);
    }

    /** A sousaphone, worn: the hand stays on the valves and the bell over the head kicks back on a note. */
    private poseSousa(i: number, x: number, y: number, z: number): Vector3 {
        const pose = this.hornPose[i];
        const file = i % FILES;
        const d = this.dummy;
        this.arm(HORN_ARMS + i, x, y, z + 0.3, SOUSA_ARM);
        d.position.set(x, y, z);
        d.rotation.set(0, 0, 0);
        d.scale.setScalar(1);
        d.updateMatrix();
        this.sousaRings.setMatrixAt(file, d.matrix);
        const kick = pose === 'hit' ? SOUSA_KICK : 0;
        const size = pose === 'hit' ? 1.2 : 1;
        d.position.set(x, y + SOUSA_BELL_Y, z);
        d.rotation.set(0, 0, kick);
        d.scale.setScalar(size);
        d.updateMatrix();
        this.sousaBells.setMatrixAt(file, d.matrix);
        this.sousaBells.setColorAt(file, this.tint);
        const reach = SOUSA_BELL_X * size;
        return this.bell.set(x + Math.cos(kick) * reach, y + SOUSA_BELL_Y + Math.sin(kick) * reach, z + 0.3);
    }

    private brassMeshes(): InstancedMesh[] {
        return [this.trumpets, this.trombones, this.slides, this.sousaRings, this.sousaBells];
    }

    /** The drum major: the mace keeps time, counts up through the phrase's last bar, and is thrust on the downbeat. */
    private poseMajor(cycle: number, p: number, c: Harvest): number {
        const y = this.march(p, MAJOR_X, MAJOR_Z, cycle, c.leaves[3], c.leaves[2]);
        const left = beatsLeft(cycle, PHRASE);
        const down = strike(cycle, Math.floor(cycle / PHRASE) * PHRASE, 1 / 16);
        let arm: number;
        let tilt: number;
        if (down > HIT) {
            // The downbeat: arm and mace thrust straight out.
            arm = 1.5;
            tilt = -1.5;
        } else if (left <= 4) {
            // The count: the arm a step higher on each beat of the last bar.
            arm = 1.5 + (5 - left) * 0.38;
            tilt = 0.1 + (5 - left) * 0.1;
        } else {
            arm = beatIndex(cycle) % 2 === 0 ? 1.1 : 1.6;
            tilt = beatIndex(cycle) % 2 === 0 ? 0.35 : -0.25;
        }
        this.arm(MAJOR_ARM, MAJOR_X, y, MAJOR_Z + 0.32, arm);
        this.mace.position.set(this.handX, this.handY - 0.5, MAJOR_Z + 0.4);
        this.mace.rotation.set(0, 0, tilt);
        return p + 1;
    }

    /**
     * An arm from the shoulder of the player at (`x`, hip `y`) on the `z`
     * side, swung to `angle`. Leaves the hand in `handX`/`handY`.
     */
    private arm(i: number, x: number, y: number, z: number, angle: number): void {
        const d = this.dummy;
        const sy = y + SHOULDER;
        d.position.set(x, sy, z);
        d.rotation.set(0, 0, angle);
        d.scale.setScalar(1);
        d.updateMatrix();
        this.arms.setMatrixAt(i, d.matrix);
        this.handX = x + Math.sin(angle) * ARM;
        this.handY = sy - Math.cos(angle) * ARM;
    }

    /** A stick held at the last hand, pointing along `angle`. */
    private stick(i: number, z: number, angle: number): void {
        const d = this.dummy;
        d.position.set(this.handX, this.handY, z);
        d.rotation.set(0, 0, angle);
        d.scale.setScalar(1);
        d.updateMatrix();
        this.sticks.setMatrixAt(i, d.matrix);
    }

    /** The drum line: cymbals, two snares and the bass drum, each in its pose. */
    private poseDrumLine(cycle: number, p: number, c: Harvest): number {
        const d = this.dummy;
        let next = p;
        for (const [file, z] of FILE_Z.entries()) {
            const y = this.march(next, DRUM_X, z, cycle, c.leaves[1], c.cream);
            next++;
            const snare = SNARES.indexOf(file);
            if (snare >= 0) {
                const grip = SNARE_GRIP[this.snare[snare].stance];
                d.position.set(DRUM_X + 0.78, y + 0.2, z);
                d.rotation.set(0, 0, 0);
                d.scale.setScalar(1);
                d.updateMatrix();
                this.snareDrums.setMatrixAt(snare, d.matrix);
                for (const side of [0, 1]) {
                    const sz = z + (side === 0 ? -0.3 : 0.3);
                    this.arm(file * 2 + side, DRUM_X, y, sz, grip.arm);
                    this.stick(file * 2 + side, sz, grip.stick);
                }
            } else if (file === BASS) {
                const grip = BASS_GRIP[this.kick.stance];
                this.bassDrum.position.set(DRUM_X + 0.2, y + 0.5, z);
                this.bassDrum.scale.setScalar(this.kick.stance === 'hit' ? 1.06 : 1);
                for (const side of [0, 1]) {
                    // The near arm plays; the far one steadies the drum.
                    const sz = z + (side === 0 ? -0.45 : 0.45);
                    this.arm(file * 2 + side, DRUM_X, y, sz, side === 1 ? grip.arm : 0.9);
                    if (side === 1) this.stick(file * 2 + side, sz, grip.stick);
                    else hide(this.sticks, file * 2 + side);
                }
            } else if (file === CYMBAL) {
                const arms = CYMBAL_ARMS[this.crash.stance];
                for (const side of [0, 1]) {
                    const sz = z + (side === 0 ? -0.2 : 0.2);
                    this.arm(file * 2 + side, DRUM_X, y, sz, arms[side]);
                    d.position.set(this.handX + 0.3, this.handY + (side === 0 ? -0.04 : 0.04), z);
                    d.rotation.set(0, 0, 0);
                    d.scale.setScalar(1);
                    d.updateMatrix();
                    this.cymbals.setMatrixAt(side, d.matrix);
                    hide(this.sticks, file * 2 + side);
                }
            }
        }
        this.drumMat.color.copy(c.cream).lerp(c.leaves[2], 0.3).multiplyScalar(0.9 + this.kick.ring * 1.4);
        return next;
    }

    /** A glow on the bass drum's face on a kick and between the cymbals on a crash. */
    private glowDrums(start: number, c: Harvest): number {
        const d = this.dummy;
        let g = start;
        const cam = this.stage.camera;
        if (this.kick.ring > 0.05) {
            d.position.copy(this.bassDrum.position);
            d.position.z += 0.3;
            d.quaternion.copy(cam.quaternion);
            d.scale.set(2.2, 2.2, 1);
            d.updateMatrix();
            this.glows.setMatrixAt(g, d.matrix);
            this.glows.setColorAt(g, this.hot.copy(c.sun).multiplyScalar(this.kick.ring * 0.6));
            g++;
        }
        if (this.crash.ring > 0.05) {
            d.position.set(DRUM_X + 0.85, 0.85 + SHOULDER + 0.1, FILE_Z[CYMBAL] + 0.5);
            d.quaternion.copy(cam.quaternion);
            const gs = 1.5 + this.crash.ring * 2.5;
            d.scale.set(gs, gs, 1);
            d.updateMatrix();
            this.glows.setMatrixAt(g, d.matrix);
            this.glows.setColorAt(g, this.hot.copy(c.cream).lerp(c.leaves[2], 0.4).multiplyScalar(this.crash.ring * 0.9));
            g++;
        }
        return g;
    }

    /** One balloon a phrase, crossing behind the band and dipping on each beat, with four handlers. */
    private poseBalloon(cycle: number, p: number, c: Harvest): number {
        const phrase = Math.floor(cycle / PHRASE);
        const t = cycle / PHRASE - phrase;
        const type = ((phrase % 3) + 3) % 3;
        for (const [i, b] of this.balloons.entries()) b.group.visible = i === type;
        const balloon = this.balloons[type];
        const ux = 34 - t * 68;
        const dip = strike(cycle, Math.floor(cycle * 4) / 4, 1 / 24) * 0.35;
        const by = BALLOON_Y - dip;
        const g = balloon.group;
        g.position.set(ux, by, BALLOON_Z);
        g.rotation.set(0, balloon.yaw, 0);
        const arr = this.ropePos.array;
        let next = p;
        for (let h = 0; h < 4; h++) {
            const hx = ux + (h < 2 ? -2.2 : 2.2);
            const hz = BALLOON_Z + (h % 2 === 0 ? -1.6 : 1.6);
            this.march(next, hx, hz, cycle, c.leaves[2], c.leaves[3]);
            next++;
            const at = h * 6;
            arr[at] = hx + 0.3; arr[at + 1] = 2.1; arr[at + 2] = hz;
            arr[at + 3] = ux + (hx - ux) * 0.35; arr[at + 4] = by + balloon.ropeY * 1.3; arr[at + 5] = BALLOON_Z + (hz - BALLOON_Z) * 0.35;
        }
        this.ropePos.needsUpdate = true;
        return next;
    }

    /**
     * One marcher marking time: a knee comes up through each beat and the
     * foot plants on the next, left and right in turn. Returns the hip height.
     */
    private march(p: number, x: number, z: number, cycle: number, coat: Color, hat: Color): number {
        const d = this.dummy;
        const c = this.colors;
        if (!c) return 0.85;
        const up = Math.sin(Math.PI * beatPhase(cycle));
        const leg = beatIndex(cycle) % 2;
        const y = 0.85 + up * 0.06;
        for (const side of [0, 1]) {
            d.position.set(x, y, z + (side === 0 ? -0.13 : 0.13));
            d.rotation.set(0, 0, side === leg ? up * 0.7 : 0);
            d.scale.setScalar(1);
            d.updateMatrix();
            this.legs.setMatrixAt(p * 2 + side, d.matrix);
        }
        d.rotation.set(0, 0, 0);
        d.position.set(x, y + 0.45, z);
        d.updateMatrix();
        this.torsos.setMatrixAt(p, d.matrix);
        this.torsos.setColorAt(p, coat);
        d.position.set(x, y + 1.15, z);
        d.updateMatrix();
        this.heads.setMatrixAt(p, d.matrix);
        this.heads.setColorAt(p, this.skin(c));
        d.position.set(x, y + 1.5, z);
        d.updateMatrix();
        this.hats.setMatrixAt(p, d.matrix);
        this.hats.setColorAt(p, hat);
        d.position.set(x, y + 1.9, z);
        d.updateMatrix();
        this.plumes.setMatrixAt(p, d.matrix);
        this.plumes.setColorAt(p, c.leaves[2]);
        return y;
    }

    private poseCrowd(cycle: number): void {
        const d = this.dummy;
        // The crowd sways a step on each beat, not a drift.
        const lean = beatIndex(cycle) % 2 === 0 ? 0.04 : -0.04;
        for (let i = 0; i < CROWD; i++) {
            const near = i >= FAR;
            const x = near ? -10 + ((i - FAR) / NEAR) * 21 + (rand01(hash32(i, 1)) - 0.5) * 1.5
                : -38 + (i / FAR) * 76 + (rand01(hash32(i, 1)) - 0.5) * 1.2;
            const z = near ? 11 + rand01(hash32(i, 2)) * 1.2 : KERB - 1 - rand01(hash32(i, 2)) * 1.6;
            const hop = this.crowdHop[i] * 0.35;
            const tall = 0.9 + rand01(hash32(i, 4)) * 0.25;
            const wide = near ? 1.5 : 1;
            d.position.set(x, 0.12 + 0.65 * tall + hop, z);
            d.rotation.set(0, 0, lean * (i % 2 === 0 ? 1 : -1));
            d.scale.set(wide, tall, wide);
            d.updateMatrix();
            this.crowdBodies.setMatrixAt(i, d.matrix);
            d.position.y += 0.65 * tall + 0.25 * wide;
            d.scale.setScalar(wide);
            d.updateMatrix();
            this.crowdHeads.setMatrixAt(i, d.matrix);
        }
    }

    private poseBunting(cycle: number): void {
        const d = this.dummy;
        // Each beat snaps the bunting, which settles before the next.
        const flick = strike(cycle, Math.floor(cycle * 4) / 4, 1 / 24) * 0.4;
        for (let i = 0; i < 120; i++) {
            const x = -60 + i;
            const span = ((x % 8) + 8) % 8;
            const sag = Math.sin((span / 8) * Math.PI) * 0.9;
            d.position.set(x, 5.6 - sag, KERB - 0.2);
            d.rotation.set((i % 2 === 0 ? 1 : -1) * flick, 0, 0);
            d.scale.setScalar(1);
            d.updateMatrix();
            this.pennants.setMatrixAt(i, d.matrix);
        }
    }

    private poseConfetti(): void {
        const d = this.dummy;
        for (let i = 0; i < MAX_CONFETTI; i++) {
            const b = this.confetti[i];
            if (!b) { hide(this.bits, i); continue; }
            const s = b.age * 6;
            d.position.set(b.x, b.y, b.z);
            d.rotation.set(s + (b.seed & 7), s * 0.7, s * 1.3 + (b.seed & 15));
            const fade = clamp01((CONFETTI_LIFE - b.age) / 0.6);
            d.scale.setScalar(fade);
            d.updateMatrix();
            this.bits.setMatrixAt(i, d.matrix);
        }
    }

    render(ctx: CanvasRenderingContext2D, s: VizServices): void {
        this.stage.draw(ctx, s);
    }
}

/** Which sixteenth of its bar an onset falls on. */
function sixteenth(begin: number): number {
    return Math.round((begin - Math.floor(begin)) * 16);
}

function lambert(): MeshLambertMaterial {
    return new MeshLambertMaterial({flatShading: true});
}

/** Brass for an open horn, lit inside its bell too. */
function brass(): MeshLambertMaterial {
    return new MeshLambertMaterial({flatShading: true, side: DoubleSide});
}

function plane(w: number, d: number, mat: MeshLambertMaterial | MeshBasicMaterial): Mesh {
    const g = new PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    return new Mesh(g, mat);
}

export const paradeDef: VizModeDef = {
    id: 'parade',
    name: 'PARADE',
    create: () => new ParadeMode(),
};
