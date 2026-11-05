/**
 * CONFETTI — a party crew on a stage at midnight, each guest playing one
 * voice with a party toy, every hit landing on the frame its note sounds:
 *
 * - Kicks: the cannon gunner. The cannon hangs at rest, swings up to aim an
 *   eighth of a bar before the next kick, and fires on the onset (recoil,
 *   a muzzle flash and a blast of confetti).
 * - Snares and claps: two popper guests, splitting the hits by where in the
 *   bar they fall. Popper raised overhead before the hit; the string is
 *   yanked down on it and the popper bursts.
 * - Hats and other percussion: the blower guest. The party blower unrolls
 *   on each hit and curls back between.
 * - Crashes: the thrower crouches a quarter bar before, scooping, and leaps
 *   with both arms up on the crash, throwing a double handful.
 * - Pitched tracks: four sparkler guests on the riser, one per track (by
 *   track slot). A sparkler comes up half a bar before its line starts, goes
 *   overhead on each note and sparks in the track's colour while it holds.
 *   The bokeh on the back wall is the keyboard: low notes left, high right.
 * - The phrase: four lamps over the stage light one per beat through each
 *   four-bar phrase's last bar, and the net in the ceiling drops its load on
 *   the downbeat. The camera cuts every two bars, wide for each phrase's
 *   last two so the count is seen. The string lights step on the beat.
 *
 * Poses are a few fixed stances switched by `stance()`. Confetti pieces are
 * simulated in update() from seeded launches off the toys.
 */

import type {VizMode, VizModeDef, VizServices} from '@cycletron/viz-sdk';
import {type FieldHap, type FieldTeam, HapField, hash32, rand01, TAU} from '@cycletron/viz-sdk';
import {drawScene, setRgb} from '@naderlabs/kit/gl';
import {type Role} from '@naderlabs/kit/roles';
import {beatIndex, beatsLeft, BIG_HIT, held, HIT, lastOnset, LEAD, nextOnset, stance, type Stance, strike, windup} from '@naderlabs/kit/timing';
import {
    BoxGeometry, Color, ConeGeometry, CylinderGeometry, DirectionalLight, DoubleSide, Euler, HemisphereLight,
    InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial, PerspectiveCamera, PlaneGeometry,
    Quaternion, Scene, ShaderMaterial, Vector3,
} from 'three';
import {Figures} from '../../lib/figures.js';
import {Glow} from '../../lib/glow.js';
import {Ink} from '../../lib/ink.js';
import {pitchPos, roleOf} from '../../lib/roles.js';

const LOOKAHEAD = 2;
const MAX_HAPS = 480;
const MAX_PER_TRACK = 64;
const IDLE_RATE = 0.35;
const FOV = 55;
/** Bars per phrase (the lamps' count) and per camera shot. */
const PHRASE = 4;
const SHOT = 2;
/** A crash's crouch and a sparkler's raise start this far ahead. */
const CRASH_LEAD = 0.25;
const SPARK_LEAD = 0.5;
const TAIL = 0.25;
const MAX_PIECES = 3200;
const LIFE = 9;
const BOKEH = 24;
const ROOM_W = 34;
const CEILING = 30;
const BULBS = 90;
const LAMPS = 4;
const LAMP_Y = 22;
/** Figure scale: a guest stands about nine units tall. */
const SIZE = 4.4;
/** The front row: popper, cannon, thrower, blower, popper. The riser behind holds the sparklers. */
const POPPER_A = 0;
const CANNON = 1;
const THROWER = 2;
const BLOWER = 3;
const POPPER_B = 4;
const FRONT_X = [-16, -8, 0, 8, 16];
const FRONT_Z = 4;
const SPARKLERS = 4;
const BACK_X = [-12, -4, 4, 12];
const BACK_Z = -8;
const RISER = 3;
const GUESTS = FRONT_X.length + SPARKLERS;

/** The cannon: both arms and the barrel's elevation. */
const CANNON_POSE: Record<Stance, {near: number; far: number; aim: number; crouch: number}> = {
    rest: {near: 0.55, far: 0.35, aim: -0.55, crouch: 0},
    ready: {near: 1.35, far: 1.0, aim: 0.95, crouch: 0.25},
    hit: {near: 1.75, far: 1.45, aim: 1.3, crouch: 0.7},
};
/** A popper: the arm holding it and the arm pulling the string. */
const POPPER_POSE: Record<Stance, {hold: number; pull: number}> = {
    rest: {hold: 0.7, pull: 0.45},
    ready: {hold: 2.8, pull: 2.55},
    hit: {hold: 2.95, pull: 0.55},
};
/** The blower's length out of the mouth. */
const BLOW: Record<Stance, number> = {rest: 0.4, ready: 1.3, hit: 3.6};
/** The thrower: both arms, how deep the crouch, how high the leap. */
const THROW_POSE: Record<Stance, {arm: number; fwd: number; crouch: number; leap: number}> = {
    rest: {arm: 0.3, fwd: 0, crouch: 0, leap: 0},
    ready: {arm: 0.2, fwd: 0.9, crouch: 1, leap: 0},
    hit: {arm: 2.75, fwd: 0, crouch: 0, leap: 2.2},
};
const SPARK_ARM: Record<Stance, number> = {rest: 0.35, ready: 1.65, hit: 2.8};

interface Shot {
    pos: Vector3;
    look: Vector3;
}

/** Close left, wide, close right, wide: the wide shots carry each phrase's count. */
const SHOTS: Shot[] = [
    {pos: new Vector3(-4, 8, 22), look: new Vector3(-4, 7.5, 0)},
    {pos: new Vector3(0, 10, 31), look: new Vector3(0, 11, -2)},
    {pos: new Vector3(4, 8, 22), look: new Vector3(4, 7.5, 0)},
    {pos: new Vector3(-10, 13, 30), look: new Vector3(0, 10.5, -2)},
];

interface Team extends FieldTeam {}

interface Note extends FieldHap<Team> {
    role: Role;
}

/** A voice's pose this frame, and how hard its last hit still rings. */
interface Play {
    stance: Stance;
    ring: number;
}

const isPitched = (r: Role): boolean => r === 'bass' || r === 'mid' || r === 'lead';
const isCrash = (h: Note): boolean => h.role === 'crash';
const isHat = (r: Role): boolean => r === 'hat' || r === 'perc' || r === 'tom';
/** Which popper takes a snare: by where in the bar it falls, so a note always goes to the same guest. */
const popperOf = (h: Note): number => Math.round(h.begin * 16) % 2;
/** Guests turn a little toward the middle of the stage. */
const yawOf = (x: number): number => -x * 0.025;
const REST: Play = {stance: 'rest', ring: 0};
const UP = new Vector3(0, 1, 0);

class ConfettiMode implements VizMode {
    private readonly scene = new Scene();
    private readonly camera = new PerspectiveCamera(FOV, 16 / 9, 0.3, 400);
    private readonly ink = new Ink();
    private readonly field = new HapField<Team, Note>({
        lookahead: LOOKAHEAD,
        maxHaps: MAX_HAPS,
        maxPerTrack: MAX_PER_TRACK,
        idleRate: IDLE_RATE,
        team: (base) => base,
        hap: (base) => ({...base, role: roleOf(base.team.name, base.note)}),
        keep: (h, cycle) => h.end + TAIL >= cycle,
    });
    private readonly crew = new Figures(GUESTS, SIZE);
    private readonly mesh: InstancedMesh;
    private readonly colors: InstancedBufferAttribute;
    private readonly rgb = new Float32Array(MAX_PIECES * 3);
    private readonly mat: ShaderMaterial;
    private readonly floorMat: ShaderMaterial;
    private readonly lights = new Glow(BOKEH + BULBS + LAMPS + 160);
    private readonly hemi = new HemisphereLight();
    private readonly key = new DirectionalLight();
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

    // The toys.
    private readonly toyMat = new MeshLambertMaterial({flatShading: true});
    private readonly cannon: Mesh;
    private readonly poppers: InstancedMesh;
    private readonly strings: InstancedMesh;
    private readonly blower: Mesh;
    private readonly blowerMat = new MeshLambertMaterial({flatShading: true});
    private readonly sparklers: InstancedMesh;
    private readonly riser: Mesh;
    private readonly riserMat = new MeshLambertMaterial();
    private readonly truss: Mesh;

    // This frame's poses, and where each toy's business end is.
    private kick: Play = REST;
    private crash: Play = REST;
    private hat: Play = REST;
    private readonly snare: Play[] = [REST, REST];
    private readonly sparkPose: Stance[] = Array.from({length: SPARKLERS}, (): Stance => 'rest');
    private readonly sparkLit = new Float32Array(SPARKLERS);
    private readonly sparkStruck = new Float32Array(SPARKLERS);
    private readonly sparkWound = new Float32Array(SPARKLERS);
    private readonly sparkColor: Color[] = [];
    private readonly muzzle = new Vector3();
    private readonly aim = new Vector3();
    private readonly popperMouth = [new Vector3(), new Vector3()];
    private readonly blowerTip = new Vector3();
    private readonly hands = [new Vector3(), new Vector3()];
    private readonly sparkTip: Vector3[] = [];

    private readonly m = new Matrix4();
    private readonly q = new Quaternion();
    private readonly e = new Euler();
    private readonly p = new Vector3();
    private readonly d = new Vector3();
    private readonly axis = new Vector3();
    private readonly scale = new Vector3(1, 1, 1);
    private readonly tmp = new Color();
    private readonly white = new Color(1, 1, 1);
    private readonly skin = new Color();

    constructor() {
        const geo = new PlaneGeometry(0.62, 0.4);
        this.mat = new ShaderMaterial({
            uniforms: {uGlint: {value: 0.9}, uAmbient: {value: new Color()}},
            vertexShader: PIECE_VERT,
            fragmentShader: PIECE_FRAG,
            side: DoubleSide,
        });
        this.mesh = new InstancedMesh(geo, this.mat, MAX_PIECES);
        this.colors = new InstancedBufferAttribute(this.rgb, 3);
        geo.setAttribute('aColor', this.colors);
        this.mesh.frustumCulled = false;
        for (let i = 0; i < SPARKLERS; i++) {
            this.sparkColor.push(new Color());
            this.sparkTip.push(new Vector3());
        }

        this.floorMat = new ShaderMaterial({
            uniforms: {uColor: {value: new Color()}, uGlow: {value: new Color()}, uPulse: {value: 0}},
            vertexShader: FLOOR_VERT,
            fragmentShader: FLOOR_FRAG,
        });
        const floor = new Mesh(new PlaneGeometry(200, 120), this.floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.z = -10;

        // A cannon: a tube along +y, the hand at its middle.
        this.cannon = new Mesh(new CylinderGeometry(0.75, 0.55, 4.2, 12), this.toyMat);
        const popperGeo = new ConeGeometry(0.55, 1.5, 10);
        popperGeo.rotateX(Math.PI);
        popperGeo.translate(0, 0.75, 0);
        this.poppers = new InstancedMesh(popperGeo, this.toyMat, 2);
        const stringGeo = new BoxGeometry(0.09, 1, 0.09);
        stringGeo.translate(0, 0.5, 0);
        this.strings = new InstancedMesh(stringGeo, this.toyMat, 2);
        // A blower reaches out along +x from the mouth.
        const blowerGeo = new BoxGeometry(1, 0.42, 0.42);
        blowerGeo.translate(0.5, 0, 0);
        this.blower = new Mesh(blowerGeo, this.blowerMat);
        const sparkGeo = new BoxGeometry(0.1, 2.6, 0.1);
        sparkGeo.translate(0, 1.3, 0);
        this.sparklers = new InstancedMesh(sparkGeo, this.toyMat, SPARKLERS);
        for (const mesh of [this.poppers, this.strings, this.sparklers]) mesh.frustumCulled = false;

        this.riser = new Mesh(new BoxGeometry(34, RISER, 6), this.riserMat);
        this.riser.position.set(0, RISER / 2, BACK_Z);
        this.truss = new Mesh(new BoxGeometry(26, 0.6, 0.6), this.riserMat);
        this.truss.position.set(0, LAMP_Y + 1.6, BACK_Z + 2);

        this.key.position.set(10, 30, 30);
        this.lights.group.renderOrder = 2;
        this.scene.add(floor, this.riser, this.truss, this.crew.group, this.cannon, this.poppers, this.strings, this.blower,
            this.sparklers, this.mesh, this.lights.group, this.hemi, this.key);
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
        this.hemi.color.copy(ink.violet).lerp(this.white, 0.45);
        this.hemi.groundColor.copy(ink.bg);
        this.hemi.intensity = 1.6;
        this.key.color.copy(ink.active);
        this.key.intensity = 1.6;
        this.toyMat.color.copy(ink.neon);
        this.blowerMat.color.copy(ink.second);
        this.riserMat.color.copy(ink.bg).lerp(ink.violet, 0.45);
        this.skin.copy(ink.active).lerp(ink.red, 0.25);
        for (let i = 0; i < GUESTS; i++) {
            this.tmp.copy(ink.accent(i + 1)).lerp(ink.active, 0.15).lerp(ink.bg, 0.3);
            this.crew.dress(i, this.tmp, this.skin, ink.accent(i + 3));
        }
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
        const cycle = field.cycle;
        if (field.restarted) this.age.fill(LIFE);

        this.kick = this.play(cycle, (h) => h.role === 'kick');
        const crashRing = strike(cycle, lastOnset(field.haps, cycle, isCrash), BIG_HIT);
        this.crash = {stance: stance(crashRing, windup(cycle, nextOnset(field.haps, cycle, isCrash), CRASH_LEAD)), ring: crashRing};
        this.hat = this.play(cycle, (h) => isHat(h.role));
        for (let k = 0; k < 2; k++) this.snare[k] = this.play(cycle, (h) => h.role === 'snare' && popperOf(h) === k);
        this.playSparklers(cycle);
        this.pose();

        for (const h of field.haps) {
            if (!field.crossed(h)) continue;
            h.done = true;
            h.team.activity = 1;
            this.fire(h);
        }
        // The net drops on each phrase's downbeat; a piece drifts down on every beat.
        if (!field.restarted && Math.floor(field.prevCycle / PHRASE) !== Math.floor(cycle / PHRASE)) {
            const seed = hash32(Math.floor(cycle / PHRASE), 77);
            for (let n = 0; n < 70; n++) this.fromCeiling(hash32(seed, n), 1);
        }
        if (!field.restarted && Math.floor(field.prevCycle * 4) !== Math.floor(cycle * 4)) {
            this.fromCeiling(hash32(Math.floor(cycle * 4), 501), 0.6);
        }
        this.step(dt);
    }

    /** The pose of the voice `pick` selects, from its last hit and its next. */
    private play(cycle: number, pick: (h: Note) => boolean, lead = LEAD): Play {
        const ring = strike(cycle, lastOnset(this.field.haps, cycle, pick));
        return {stance: stance(ring, windup(cycle, nextOnset(this.field.haps, cycle, pick), lead)), ring};
    }

    /** Each sparkler guest plays the pitched tracks of its slot. */
    private playSparklers(cycle: number): void {
        const struck = this.sparkStruck.fill(0);
        const wound = this.sparkWound.fill(0);
        this.sparkLit.fill(0);
        for (const h of this.field.haps) {
            if (!isPitched(h.role)) continue;
            const i = h.team.slot % SPARKLERS;
            struck[i] = Math.max(struck[i], strike(cycle, h.begin));
            wound[i] = Math.max(wound[i], windup(cycle, h.begin, SPARK_LEAD));
            const lit = held(cycle, h.begin, h.end, TAIL) * h.fade;
            if (lit <= this.sparkLit[i]) continue;
            this.sparkLit[i] = lit;
            setRgb(this.sparkColor[i], h.team.rgb);
        }
        for (let i = 0; i < SPARKLERS; i++) {
            const pose = stance(struck[i], wound[i]);
            // A held note keeps the sparkler up between notes.
            this.sparkPose[i] = pose === 'rest' && this.sparkLit[i] > 0 ? 'ready' : pose;
        }
    }

    private pose(): void {
        const crew = this.crew;

        const cp = CANNON_POSE[this.kick.stance];
        const cx = FRONT_X[CANNON];
        crew.stand(CANNON, cx, 0, FRONT_Z, yawOf(cx), cp.crouch);
        crew.arm(CANNON, -1, cp.far, 0.6);
        crew.arm(CANNON, 1, cp.near, 0.6);
        this.aim.set(Math.cos(cp.aim) * 0.55, Math.sin(cp.aim), 0.15).normalize();
        this.cannon.position.copy(crew.hand).addScaledVector(this.aim, 0.3);
        this.cannon.quaternion.setFromUnitVectors(UP, this.aim);
        this.muzzle.copy(this.cannon.position).addScaledVector(this.aim, 2.2);

        for (let k = 0; k < 2; k++) {
            const who = k === 0 ? POPPER_A : POPPER_B;
            const x = FRONT_X[who];
            const pp = POPPER_POSE[this.snare[k].stance];
            const holdSide = k === 0 ? -1 : 1;
            crew.stand(who, x, 0, FRONT_Z, yawOf(x), this.snare[k].stance === 'hit' ? 0.3 : 0);
            crew.arm(who, holdSide, pp.hold, 0.3);
            this.p.copy(crew.hand);
            this.q.setFromUnitVectors(UP, crew.reach);
            this.m.compose(this.p, this.q, this.scale.set(1, 1, 1));
            this.poppers.setMatrixAt(k, this.m);
            this.popperMouth[k].copy(crew.hand).addScaledVector(crew.reach, 1.5);
            crew.arm(who, -holdSide, pp.pull, 0.3);
            this.d.copy(crew.hand).sub(this.p);
            const len = this.d.length();
            this.q.setFromUnitVectors(UP, this.d.normalize());
            this.m.compose(this.p, this.q, this.scale.set(1, len, 1));
            this.strings.setMatrixAt(k, this.m);
        }

        const bx = FRONT_X[BLOWER];
        const blowing = this.hat.stance === 'hit';
        crew.stand(BLOWER, bx, 0, FRONT_Z, yawOf(bx), 0);
        crew.arm(BLOWER, 1, 2.1, 1.2);
        crew.arm(BLOWER, -1, blowing ? 0.9 : 0.5, 0);
        const len = BLOW[this.hat.stance];
        this.blower.position.set(bx + 0.3, 1.74 * SIZE, FRONT_Z + 0.25 * SIZE);
        this.blower.rotation.set(0, 0, 0.25);
        this.blower.scale.set(len, 1, 1);
        this.blowerTip.set(this.blower.position.x + Math.cos(0.25) * len, this.blower.position.y + Math.sin(0.25) * len, this.blower.position.z);

        const tp = THROW_POSE[this.crash.stance];
        const tx = FRONT_X[THROWER];
        crew.stand(THROWER, tx, tp.leap, FRONT_Z, 0, tp.crouch);
        for (let k = 0; k < 2; k++) {
            crew.arm(THROWER, k === 0 ? -1 : 1, tp.arm, tp.fwd);
            this.hands[k].copy(crew.hand);
        }

        for (let i = 0; i < SPARKLERS; i++) {
            const who = FRONT_X.length + i;
            const x = BACK_X[i];
            const side = i < SPARKLERS / 2 ? -1 : 1;
            crew.stand(who, x, RISER, BACK_Z, yawOf(x), 0);
            crew.arm(who, -side, 0.45, 0);
            crew.arm(who, side, SPARK_ARM[this.sparkPose[i]], 0.25);
            this.q.setFromUnitVectors(UP, crew.reach);
            this.m.compose(crew.hand, this.q, this.scale.set(1, 1, 1));
            this.sparklers.setMatrixAt(i, this.m);
            this.sparkTip[i].copy(crew.hand).addScaledVector(crew.reach, 2.6);
        }
        crew.commit();
        for (const mesh of [this.poppers, this.strings, this.sparklers]) mesh.instanceMatrix.needsUpdate = true;
    }

    private fire(h: Note): void {
        switch (h.role) {
            case 'kick':
                this.burst(h.seed, 16, this.muzzle, this.aim, 30, 0.3);
                break;
            case 'snare':
                this.burst(h.seed, 10, this.popperMouth[popperOf(h)], UP, 18, 0.5);
                break;
            case 'crash':
                for (let k = 0; k < 2; k++) this.burst(hash32(h.seed, k), 18, this.hands[k], UP, 24, 0.6);
                break;
            default:
                if (isHat(h.role)) this.burst(h.seed, 2, this.blowerTip, UP, 6, 1);
                break;
        }
    }

    /** `n` pieces from `at` along `dir`, spread by `spread`. */
    private burst(seed: number, n: number, at: Vector3, dir: Vector3, speed: number, spread: number): void {
        for (let k = 0; k < n; k++) {
            const ps = hash32(seed, k + 100);
            const r = (j: number) => rand01(hash32(ps, j)) - 0.5;
            const v = speed * (0.7 + 0.6 * (r(1) + 0.5));
            this.spawn(ps, at.x, at.y, at.z, (dir.x + r(2) * spread * 2) * v, (dir.y + r(3) * spread) * v, (dir.z + r(4) * spread * 0.6) * v);
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

    private fromCeiling(seed: number, spread: number): void {
        const r = (n: number) => rand01(hash32(seed, n));
        this.spawn(seed, (r(1) * 2 - 1) * ROOM_W * spread, CEILING + r(3) * 4, -20 + r(4) * 22, (r(5) - 0.5) * 2, -r(6) * 2, (r(7) - 0.5) * 2);
    }

    /** Ballistic until the air has slowed a piece, then a flutter down; it lies where it lands. */
    private step(dt: number): void {
        const drag = Math.exp(-dt * 2.2);
        for (let i = 0; i < MAX_PIECES; i++) {
            if (this.age[i] >= LIFE) continue;
            this.age[i] += dt;
            if (this.landed[i] === 1) continue;
            const r = rand01(hash32(this.seed[i], 3));
            const fall = 5 + r * 3;
            this.vx[i] *= drag;
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
        const shot = SHOTS[Math.floor(cycle / SHOT) % SHOTS.length];
        cam.position.copy(shot.pos);
        cam.lookAt(shot.look);

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
        this.floorMat.uniforms.uPulse.value = this.kick.ring;
        this.blowerMat.emissive.copy(this.ink.second).multiplyScalar(this.hat.stance === 'hit' ? 0.6 : 0);

        this.drawLights(cycle);
        drawScene(ctx, this.scene, cam, s.width, s.height, s.dpr);
    }

    private drawLights(cycle: number): void {
        const g = this.lights;
        const ink = this.ink;
        g.begin();
        // The toys' flashes, on the hit frames.
        if (this.kick.ring > 0.1) g.add(this.muzzle.x, this.muzzle.y, this.muzzle.z, this.white, this.kick.ring * 1.4, 7);
        for (let k = 0; k < 2; k++) {
            const ring = this.snare[k].ring;
            const at = this.popperMouth[k];
            if (ring > 0.1) g.add(at.x, at.y, at.z, ink.active, ring * 1.3, 5);
        }
        if (this.crash.ring > 0.1) {
            for (const at of this.hands) g.add(at.x, at.y, at.z, ink.neon, this.crash.ring * 1.4, 8);
        }
        // Sparklers: a hot core and sparks while the note holds, a flare on each note.
        for (let i = 0; i < SPARKLERS; i++) {
            const lit = Math.max(this.sparkLit[i], this.sparkStruck[i]);
            if (lit < 0.05) continue;
            const tip = this.sparkTip[i];
            const flare = this.sparkStruck[i] > HIT ? 1 : 0;
            g.add(tip.x, tip.y, tip.z, this.white, 0.8 + flare, 1.6 + flare * 2);
            const frame = Math.floor(cycle * 32);
            for (let k = 0; k < 18; k++) {
                const h = hash32(frame, i * 64 + k);
                const a = rand01(h) * TAU;
                const b = rand01(hash32(h, 1)) * 2 - 1;
                const r = (0.4 + rand01(hash32(h, 2)) * 1.6) * (0.6 + lit * 0.4 + flare * 0.8);
                const c = Math.sqrt(1 - b * b);
                g.add(tip.x + Math.cos(a) * c * r, tip.y + b * r, tip.z + Math.sin(a) * c * r, this.sparkColor[i], 0.9 * lit, 0.45);
            }
        }
        // The count: a lamp a beat through the phrase's last bar, all of them on the downbeat.
        const left = beatsLeft(cycle, PHRASE);
        const lit = left <= 4 ? 5 - left : 0;
        const down = strike(cycle, Math.floor(cycle / PHRASE) * PHRASE, 1 / 16) > HIT;
        for (let j = 0; j < LAMPS; j++) {
            const on = down || j < lit;
            const c = down ? this.white : on ? ink.red : ink.violet;
            g.add((j - (LAMPS - 1) / 2) * 6, LAMP_Y, BACK_Z + 2.6, c, on ? 1.5 : 0.25, on ? 4.5 : 2.5);
        }
        for (let i = 0; i < BOKEH; i++) {
            const x = -ROOM_W * 1.6 + (i + 0.5) * ((ROOM_W * 3.2) / BOKEH);
            const y = 10 + rand01(hash32(i, 31)) * 18;
            g.add(x, y, -46, ink.violet, 0.2, 12);
        }
        for (const h of this.field.haps) {
            if (!isPitched(h.role)) continue;
            const k = strike(cycle, h.begin, 1 / 8) * h.fade;
            if (k < 0.05) continue;
            const i = Math.min(BOKEH - 1, Math.floor(pitchPos(h.note) * BOKEH));
            const x = -ROOM_W * 1.6 + (i + 0.5) * ((ROOM_W * 3.2) / BOKEH);
            g.add(x, 10 + rand01(hash32(i, 31)) * 18, -45, setRgb(this.tmp, h.team.rgb), k * 0.8, 14);
        }
        // String lights in swags under the ceiling, every other bulb lit, swapping on the beat.
        const beat = beatIndex(cycle);
        for (let i = 0; i < BULBS; i++) {
            const swag = Math.floor(i / 15);
            const u = (i % 15) / 14;
            const x = -ROOM_W * 1.3 + swag * ((ROOM_W * 2.6) / 5) + u * ((ROOM_W * 2.6) / 5);
            const y = CEILING - 1 - Math.sin(u * Math.PI) * 4;
            g.add(x, y, -22, ink.neon, (i + beat) % 2 === 0 ? 0.5 : 0.12, 1.3);
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
