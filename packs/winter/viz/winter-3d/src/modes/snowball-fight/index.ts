/**
 * SNOWBALL FIGHT — two snow forts at dusk, four kids behind each, and every
 * snowball lands on the frame its note sounds. Each kid throws one voice:
 *
 * - Left fort: the kicks (big lobs), the snares, and two pitched tracks.
 *   Right fort: the hats (quick flat flicks), the crashes, toms and other
 *   percussion, and two more pitched tracks. A pitched track keeps its kid
 *   from the moment it is first heard, the kid wears its colour, and pitch
 *   is how high the snowball arcs; long notes are bigger snowballs.
 * - A kid cocks the arm an eighth of a bar before the release, throws, and
 *   the ball is in the air for an eighth (a sixteenth for hats), so the
 *   splat on the opposite wall is the onset. The kid behind that wall ducks
 *   on the hit.
 * - Between the forts a snowman is built through each four-bar phrase: the
 *   base on beat two of the first bar, then a ball a bar, the hat and arms
 *   in the last bar, where the arms count off its beats. On the next
 *   downbeat it bursts and both forts cheer.
 * - The camera cuts on the bar lines: close on one fort, from the field, for
 *   the phrase's first two bars (alternating forts), wide for the last two so
 *   the count is seen.
 */

import type {VizMode, VizModeDef, VizServices} from '@cycletron/viz-sdk';
import {type FieldHap, type FieldTeam, HapField} from '@cycletron/viz-sdk';
import {hash32, rand01, TAU} from '@cycletron/viz-sdk';
import {drawScene, setRgb} from '@naderlabs/kit/gl';
import {type Role} from '@naderlabs/kit/roles';
import {beatIndex, stance, strike, windup} from '@naderlabs/kit/timing';
import {
    AdditiveBlending, AmbientLight, BoxGeometry, Color, ConeGeometry, CylinderGeometry, DirectionalLight, Fog,
    HemisphereLight, IcosahedronGeometry, InstancedMesh, Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D,
    PerspectiveCamera, PlaneGeometry, Scene, Sprite, SpriteMaterial,
} from 'three';
import {dotTexture} from '../../lib/dot.js';
import {Ink} from '../../lib/ink.js';
import {Pines} from '../../lib/pines.js';
import {winterRole} from '../../lib/roles.js';
import {NightSky} from '../../lib/sky.js';
import {Kid} from './kid.js';

const LOOKAHEAD = 2;
const MAX_HAPS = 600;
const MAX_PER_TRACK = 64;
const DRUM_CAP = 48;
const IDLE_RATE = 0.25;
/** Bars a kid holds the cocked pose before letting go. */
const COCK = 1 / 8;
const SPLAT = 0.22;
const CHUNKS = 7;
const MAX_SHOTS = 160;
const MAX_BALLS = 96;
const MAX_CHUNKS = 520;
const PHRASE = 4;
const FORT_X = 4.6;
const KID_X = FORT_X + 1.1;
const LANES = [-2.6, -0.87, 0.87, 2.6];
const KIDS = 8;
/** Kids that take pitched tracks, in the order tracks are first heard. */
const PITCHED_KIDS = [2, 6, 3, 7];
const SNOWMAN_Z = -3.9;
const SKY_RADIUS = 150;

type Voice = 'kick' | 'snare' | 'hat' | 'crash' | 'pitched';

/** How each voice throws: time in the air (bars), arc height, ball radius. */
const THROW: Record<Voice, {flight: number; arc: number; size: number}> = {
    kick: {flight: 1 / 8, arc: 3.2, size: 0.42},
    snare: {flight: 1 / 8, arc: 1.4, size: 0.3},
    hat: {flight: 1 / 16, arc: 0.35, size: 0.17},
    crash: {flight: 1 / 8, arc: 2.2, size: 0.36},
    pitched: {flight: 1 / 8, arc: 1, size: 0.24},
};

interface Team extends FieldTeam {
    color: Color;
}

interface Note extends FieldHap<Team> {
    role: Role;
}

/** One throw: who, when it lands, and how it flies. */
interface Shot {
    kid: number;
    begin: number;
    flight: number;
    arc: number;
    size: number;
    seed: number;
    color: Color;
}

class SnowballFightMode implements VizMode {
    private readonly ink = new Ink();
    private readonly scene = new Scene();
    private readonly camera = new PerspectiveCamera(52, 16 / 9, 0.1, 500);
    private readonly air = new Color();
    private readonly fog = new Fog(0x000000, 30, 120);
    private readonly field = new HapField<Team, Note>({
        lookahead: LOOKAHEAD,
        maxHaps: MAX_HAPS,
        maxPerTrack: MAX_PER_TRACK,
        idleRate: IDLE_RATE,
        team: (base) => ({...base, color: new Color()}),
        hap: (base) => ({...base, role: winterRole(base.team.name, base.note)}),
        cap: (_team, note) => (Number.isFinite(note) ? Infinity : DRUM_CAP),
        keep: (h, cycle) => h.end + 0.3 >= cycle,
    });

    private readonly kids: Kid[] = [];
    private readonly jackets: MeshLambertMaterial[] = [];
    private readonly skinMat = new MeshLambertMaterial({flatShading: true});
    private readonly woolMat = new MeshLambertMaterial({flatShading: true});
    private readonly snowMat = new MeshLambertMaterial({flatShading: true});
    private readonly groundMat = new MeshLambertMaterial({flatShading: true});
    private readonly blocks: InstancedMesh;
    private readonly balls: InstancedMesh;
    private readonly chunks: InstancedMesh;
    private readonly splats: InstancedMesh;
    private readonly splatMat = new MeshBasicMaterial({transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2});
    private readonly snowman: Mesh[] = [];
    private readonly snowmanArms: Mesh[] = [];
    private readonly snowmanHat: Mesh;
    private readonly stickMat = new MeshLambertMaterial({flatShading: true});
    private readonly hatMat = new MeshLambertMaterial({flatShading: true});
    private readonly noseMat = new MeshLambertMaterial({flatShading: true});
    private readonly lampMat = new SpriteMaterial({blending: AdditiveBlending, transparent: true, depthWrite: false});
    private readonly pines = new Pines(80);
    private readonly sky = new NightSky(500, SKY_RADIUS, 0.03, 31337);
    private readonly ambient = new AmbientLight(0xffffff, 0.7);
    private readonly hemi = new HemisphereLight(0xffffff, 0x000000, 0.9);
    private readonly moon = new DirectionalLight(0xffffff, 1.4);

    /** Which kid each pitched track belongs to, by track name, kept for the life of the mode. */
    private readonly owners = new Map<string, number>();
    private readonly shots: Shot[] = [];
    private nShots = 0;
    private readonly last = new Float64Array(KIDS);
    private readonly next = new Float64Array(KIDS);
    private readonly hitAt = new Float64Array(KIDS);
    private readonly kidColor: Color[] = [];
    private readonly dummy = new Object3D();
    private readonly tint = new Color();

    constructor() {
        const {scene} = this;
        scene.background = this.air;
        scene.fog = this.fog;
        const ground = new Mesh(new PlaneGeometry(400, 400).rotateX(-Math.PI / 2), this.groundMat);
        scene.add(ground);

        for (let i = 0; i < KIDS; i++) {
            const jacket = new MeshLambertMaterial({flatShading: true});
            this.jackets.push(jacket);
            this.kidColor.push(new Color());
            const kid = new Kid(jacket, this.skinMat, this.woolMat, this.snowMat);
            const left = i < 4;
            kid.root.position.set(left ? -KID_X : KID_X, 0, LANES[i % 4]);
            kid.root.rotation.y = left ? 0 : Math.PI;
            kid.root.scale.setScalar(1.4);
            this.kids.push(kid);
            scene.add(kid.root);
        }

        this.blocks = new InstancedMesh(new BoxGeometry(0.9, 0.6, 1.05), new MeshLambertMaterial({flatShading: true}), 80);
        this.buildForts();
        scene.add(this.blocks);

        this.balls = pool(new IcosahedronGeometry(1, 1), new MeshLambertMaterial({flatShading: true}), MAX_BALLS);
        this.chunks = pool(new IcosahedronGeometry(1, 0), new MeshLambertMaterial({flatShading: true}), MAX_CHUNKS);
        this.splatMat.map = dotTexture(0.85);
        this.splats = pool(new PlaneGeometry(1, 1).rotateY(Math.PI / 2), this.splatMat, MAX_SHOTS);
        this.splats.renderOrder = 2;
        scene.add(this.balls, this.chunks, this.splats);

        for (const [r, y] of [[1, 0.85], [0.72, 2.2], [0.5, 3.2]]) {
            const m = new Mesh(new IcosahedronGeometry(r, 1), this.snowMat);
            m.position.set(0, y, SNOWMAN_Z);
            this.snowman.push(m);
            scene.add(m);
        }
        const head = this.snowman[2];
        const nose = new Mesh(new ConeGeometry(0.09, 0.5, 5).rotateZ(-Math.PI / 2).rotateY(-Math.PI / 2), this.noseMat);
        nose.position.set(0, 0, 0.5);
        head.add(nose);
        this.snowmanHat = new Mesh(new CylinderGeometry(0.34, 0.34, 0.55, 8).translate(0, 0.28, 0), this.hatMat);
        this.snowmanHat.position.y = 0.38;
        head.add(this.snowmanHat);
        for (const side of [-1, 1]) {
            const arm = new Mesh(new BoxGeometry(0.08, 1.3, 0.08).translate(0, 0.65, 0), this.stickMat);
            arm.position.set(side * 0.62, 2.35, SNOWMAN_Z);
            this.snowmanArms.push(arm);
            scene.add(arm);
        }

        this.lampMat.map = dotTexture(0);
        for (const [x, z] of [[-FORT_X - 3.5, -5], [FORT_X + 3.5, -5]]) {
            const post = new Mesh(new CylinderGeometry(0.08, 0.1, 4, 6).translate(0, 2, 0), this.stickMat);
            post.position.set(x, 0, z);
            const glow = new Sprite(this.lampMat);
            glow.position.set(x, 4.1, z);
            glow.scale.setScalar(2.4);
            scene.add(post, glow);
        }
        scene.add(this.pines.mesh, this.sky.group);
        this.plantPines();
        this.moon.position.set(-20, 30, 25);
        scene.add(this.ambient, this.hemi, this.moon);

        for (let i = 0; i < MAX_SHOTS; i++) this.shots.push({kid: 0, begin: 0, flight: 0, arc: 0, size: 0, seed: 0, color: new Color()});
    }

    layout(s: VizServices): void {
        const {ink} = this;
        ink.bake(s.theme);
        this.air.copy(ink.bg).lerp(ink.deep, 0.35);
        this.fog.color.copy(this.air);
        this.groundMat.color.copy(ink.snow).multiplyScalar(0.8);
        this.snowMat.color.copy(ink.snow);
        this.skinMat.color.copy(ink.warm).lerp(ink.snow, 0.45);
        this.woolMat.color.copy(ink.deep).lerp(ink.bg, 0.3);
        this.stickMat.color.copy(ink.warm).multiplyScalar(0.35);
        this.hatMat.color.copy(ink.bg);
        this.noseMat.color.copy(ink.warm);
        this.lampMat.color.copy(ink.warm).multiplyScalar(0.8);
        setMat(this.blocks, ink.snow, 0.9);
        setMat(this.balls, ink.snow, 1);
        setMat(this.chunks, ink.snow, 1);
        this.pines.paint(this.tint.copy(ink.deep).lerp(ink.bg, 0.6), ink.snow, ink.bg);
        this.sky.paint(ink);
        this.ambient.color.copy(ink.deep).lerp(ink.frost, 0.4);
        this.hemi.color.copy(ink.frost);
        this.hemi.groundColor.copy(ink.deep).multiplyScalar(0.5);
        this.moon.color.copy(ink.frost).lerp(ink.snow, 0.6);
        this.camera.aspect = s.width / Math.max(1, s.height);
        this.camera.updateProjectionMatrix();
        this.field.invalidate();
    }

    update(dt: number, s: VizServices): void {
        const field = this.field;
        field.update(dt, s);
        for (const t of field.teams) setRgb(t.color, t.rgb);
        const now = field.cycle;
        this.paintKids();
        if (field.locked) this.collect();
        else this.idleShots(now);
        this.poseKids(now);
        this.placeSnow(now);
        this.buildSnowman(now);
        this.placeCamera(now);
        this.sky.update(Math.floor(now * 4) / 4, 0.12, this.camera.position);
    }

    render(ctx: CanvasRenderingContext2D, s: VizServices): void {
        drawScene(ctx, this.scene, this.camera, s.width, s.height, s.dpr);
    }

    private paintKids(): void {
        const {ink, kidColor} = this;
        kidColor[0].copy(ink.rose);
        kidColor[1].copy(ink.warm);
        kidColor[4].copy(ink.ice);
        kidColor[5].copy(ink.aurora);
        for (const k of PITCHED_KIDS) kidColor[k].copy(ink.frost).multiplyScalar(0.6);
        for (const t of this.field.teams) {
            const k = this.owners.get(t.name);
            if (k !== undefined) kidColor[k].copy(t.color);
        }
        for (let i = 0; i < KIDS; i++) this.jackets[i].color.copy(kidColor[i]);
    }

    /** The throws in the field's window, one per hap that has a kid. */
    private collect(): void {
        this.nShots = 0;
        for (const h of this.field.haps) {
            const voice = voiceOf(h.role);
            if (!voice) continue;
            const kid = voice === 'pitched' ? this.ownerOf(h.team.name) : drumKid(voice);
            const th = THROW[voice];
            const pitch = voice === 'pitched' ? Math.min(1, Math.max(0, (h.note - 36) / 54)) : 0;
            const long = voice === 'pitched' ? Math.min(1, h.end - h.begin) : 0;
            const color = voice === 'pitched' ? h.team.color : this.kidColor[kid];
            this.addShot(kid, h.begin, th.flight, th.arc + pitch * 3.4, th.size + long * 0.3, h.seed, color);
        }
    }

    /** Nothing playing: each kid throws once a bar, in turn. */
    private idleShots(now: number): void {
        this.nShots = 0;
        const bar = Math.floor(now);
        for (let b = bar - 1; b <= bar + 1; b++) {
            for (let k = 0; k < KIDS; k++) {
                const at = b + (k % 4) / 4 + (k < 4 ? 0 : 1 / 8);
                this.addShot(k, at, 1 / 8, 1.6, 0.26, hash32(b, k), this.kidColor[k]);
            }
        }
    }

    private addShot(kid: number, begin: number, flight: number, arc: number, size: number, seed: number, color: Color): void {
        if (this.nShots >= MAX_SHOTS) return;
        const sh = this.shots[this.nShots++];
        sh.kid = kid;
        sh.begin = begin;
        sh.flight = flight;
        sh.arc = arc;
        sh.size = size;
        sh.seed = seed;
        sh.color.copy(color);
    }

    private ownerOf(name: string): number {
        let k = this.owners.get(name);
        if (k === undefined) {
            k = PITCHED_KIDS[this.owners.size % PITCHED_KIDS.length];
            this.owners.set(name, k);
        }
        return k;
    }

    /** Each kid: cocked before a release, thrown on it, and ducking when a ball hits their wall. */
    private poseKids(now: number): void {
        const {last, next, hitAt} = this;
        last.fill(-Infinity);
        next.fill(Infinity);
        hitAt.fill(-Infinity);
        for (let i = 0; i < this.nShots; i++) {
            const sh = this.shots[i];
            const release = sh.begin - sh.flight;
            if (release <= now) last[sh.kid] = Math.max(last[sh.kid], release);
            else next[sh.kid] = Math.min(next[sh.kid], release);
            if (sh.begin <= now) hitAt[target(sh.kid)] = Math.max(hitAt[target(sh.kid)], sh.begin);
        }
        const phrase = Math.floor(now / PHRASE) * PHRASE;
        const cheer = strike(now, phrase, 1 / 16) > 0.3;
        for (let i = 0; i < KIDS; i++) {
            const pose = stance(strike(now, last[i], 1 / 24), windup(now, next[i], COCK));
            this.kids[i].pose(pose, strike(now, hitAt[i], 1 / 24), cheer);
        }
    }

    /** Balls in the air, and the splats where they land. */
    private placeSnow(now: number): void {
        const {balls, chunks, splats, dummy, tint} = this;
        let nb = 0;
        let nc = 0;
        let ns = 0;
        for (let i = 0; i < this.nShots; i++) {
            const sh = this.shots[i];
            const t = now - sh.begin;
            const dir = sh.kid < 4 ? 1 : -1;
            const lane = LANES[sh.kid % 4];
            const jz = (rand01(hash32(sh.seed, 1)) - 0.5) * 0.8;
            const tx = dir * (FORT_X - 0.55);
            const ty = 0.9 + rand01(hash32(sh.seed, 2)) * 0.4;
            if (t < 0 && t >= -sh.flight && nb < MAX_BALLS) {
                const p = 1 + t / sh.flight;
                const x0 = -dir * (KID_X - 0.9);
                const y0 = 3.2;
                dummy.position.set(x0 + (tx - x0) * p, y0 + (ty - y0) * p + sh.arc * 4 * p * (1 - p), lane + 0.6 * dir * (1 - p) + jz * p);
                dummy.rotation.set(0, 0, 0);
                dummy.scale.setScalar(sh.size);
                dummy.updateMatrix();
                balls.setMatrixAt(nb, dummy.matrix);
                balls.setColorAt(nb++, tint.setRGB(1, 1, 1).lerp(sh.color, 0.45));
            } else if (t >= 0 && t < SPLAT) {
                const k = t / SPLAT;
                for (let c = 0; c < CHUNKS && nc < MAX_CHUNKS; c++) {
                    const a = rand01(hash32(sh.seed, 10 + c)) * TAU;
                    const up = 0.3 + rand01(hash32(sh.seed, 20 + c));
                    const r = sh.size * 5 * (1 - 2 ** (-t / 0.03));
                    dummy.position.set(tx - dir * r * 0.5 * up, ty + Math.sin(a) * r * 0.6 + up * r * 0.5 - 30 * t * t, lane + jz + Math.cos(a) * r);
                    dummy.rotation.set(a, a * 2, 0);
                    dummy.scale.setScalar(sh.size * 0.45 * (1 - k));
                    dummy.updateMatrix();
                    chunks.setMatrixAt(nc, dummy.matrix);
                    chunks.setColorAt(nc++, tint.setRGB(1, 1, 1).lerp(sh.color, 0.45));
                }
                if (ns < MAX_SHOTS) {
                    dummy.position.set(tx - dir * 0.02, ty, lane + jz);
                    dummy.rotation.set(0, 0, 0);
                    dummy.scale.setScalar(sh.size * 7 * Math.min(1, 0.6 + k * 3) * (k > 0.8 ? (1 - k) * 5 : 1));
                    dummy.updateMatrix();
                    splats.setMatrixAt(ns, dummy.matrix);
                    splats.setColorAt(ns++, sh.color);
                }
            }
        }
        nc = this.burst(now, nc);
        balls.count = nb;
        chunks.count = nc;
        splats.count = ns;
        flush(balls);
        flush(chunks);
        flush(splats);
    }

    /** The snowman bursting on the phrase's downbeat. */
    private burst(now: number, n: number): number {
        const phrase = Math.floor(now / PHRASE) * PHRASE;
        const t = now - phrase;
        if (t >= 0.4 || phrase <= 0) return n;
        const {dummy, chunks} = this;
        for (let c = 0; c < 40 && n < MAX_CHUNKS; c++) {
            const r = (k: number) => rand01(hash32(phrase * 97 + c, k));
            const a = r(1) * TAU;
            const sp = 4 + r(2) * 8;
            const y0 = 0.8 + r(3) * 2.6;
            dummy.position.set(Math.cos(a) * sp * t * 2.4, Math.max(0.1, y0 + (2 + r(4) * 6) * t * 2.4 - 40 * t * t), SNOWMAN_Z + Math.sin(a) * sp * t * 2.4);
            dummy.rotation.set(a, a, 0);
            dummy.scale.setScalar((0.15 + r(5) * 0.3) * (1 - t / 0.4));
            dummy.updateMatrix();
            chunks.setMatrixAt(n, dummy.matrix);
            chunks.setColorAt(n++, this.tint.setRGB(1, 1, 1));
        }
        return n;
    }

    /** The snowman goes up a ball a bar; in the last bar its arms count the beats. */
    private buildSnowman(now: number): void {
        const phrase = Math.floor(now / PHRASE) * PHRASE;
        const bar = Math.floor(now) - phrase;
        for (let i = 0; i < 3; i++) {
            const m = this.snowman[i];
            const appear = phrase + (i === 0 ? 0.25 : i);
            m.visible = now >= appear;
            m.scale.setScalar(1 + 0.3 * strike(now, appear, 1 / 32));
        }
        const dressed = bar === PHRASE - 1;
        this.snowmanHat.visible = dressed;
        const beat = beatIndex(now);
        for (let i = 0; i < 2; i++) {
            const arm = this.snowmanArms[i];
            arm.visible = dressed;
            const side = i === 0 ? -1 : 1;
            const raised = beat >= 3 || beat === i + 1;
            arm.rotation.z = -side * (raised ? 0.35 : 2.2);
        }
        this.snowmanHat.position.y = 0.38 + (dressed && beat === 3 ? 0.25 : 0);
    }

    private placeCamera(now: number): void {
        const phrase = Math.floor(now / PHRASE);
        const bar = Math.floor(now) - phrase * PHRASE;
        const cam = this.camera;
        if (bar >= 2) {
            cam.position.set(0, 3.4, 9.2);
            cam.lookAt(0, 1.7, -0.6);
        } else {
            const side = (phrase & 1) === 0 ? -1 : 1;
            cam.position.set(side * 1.2, 2.9, 5.4);
            cam.lookAt(side * KID_X, 1.7, -0.3);
        }
    }

    private buildForts(): void {
        const {dummy, blocks} = this;
        let n = 0;
        for (const side of [-1, 1]) {
            for (let row = 0; row < 2; row++) {
                for (let k = 0; k < 8; k++) {
                    const r = (j: number) => rand01(hash32(n, 400 + j));
                    dummy.position.set(side * FORT_X + (r(1) - 0.5) * 0.1, 0.3 + row * 0.6, -3.4 + k * 0.97 + (row & 1) * 0.45 - (row === 1 && k === 7 ? 0.45 : 0));
                    dummy.rotation.set(0, (r(2) - 0.5) * 0.15, (r(3) - 0.5) * 0.1);
                    dummy.scale.set(1, 1 - r(4) * 0.15, 1);
                    dummy.updateMatrix();
                    blocks.setMatrixAt(n++, dummy.matrix);
                }
            }
        }
        blocks.count = n;
        blocks.instanceMatrix.needsUpdate = true;
    }

    private plantPines(): void {
        const {pines} = this;
        pines.begin();
        for (let i = 0; i < 80; i++) {
            const r = (k: number) => rand01(hash32(i, 700 + k));
            const a = Math.PI * (1.05 + r(1) * 0.9);
            const d = 18 + r(2) * 30;
            pines.add(Math.cos(a) * d * 1.4, 0, Math.sin(a) * d, 1.8 + r(3) * 2.4, r(4) * TAU, r(5));
        }
        pines.end();
    }
}

function voiceOf(role: Role): Voice | null {
    switch (role) {
        case 'kick':
            return 'kick';
        case 'snare':
            return 'snare';
        case 'hat':
            return 'hat';
        case 'crash':
        case 'tom':
        case 'perc':
            return 'crash';
        case 'bass':
        case 'mid':
        case 'lead':
            return 'pitched';
        default:
            return null;
    }
}

function drumKid(voice: Voice): number {
    return voice === 'kick' ? 0 : voice === 'snare' ? 1 : voice === 'hat' ? 4 : 5;
}

/** The kid across the field in the same lane. */
function target(kid: number): number {
    return kid < 4 ? kid + 4 : kid - 4;
}

function pool(geo: IcosahedronGeometry | PlaneGeometry, mat: MeshLambertMaterial | MeshBasicMaterial, max: number): InstancedMesh {
    const m = new InstancedMesh(geo, mat, max);
    const white = new Color(1, 1, 1);
    for (let i = 0; i < max; i++) m.setColorAt(i, white);
    m.count = 0;
    m.frustumCulled = false;
    return m;
}

function flush(m: InstancedMesh): void {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
}

function setMat(m: InstancedMesh, c: Color, k: number): void {
    if (m.material instanceof MeshLambertMaterial) m.material.color.copy(c).multiplyScalar(k);
}

export const snowballFightDef: VizModeDef = {
    id: 'snowball-fight',
    name: 'SNOWBALL FIGHT',
    create: () => new SnowballFightMode(),
};
