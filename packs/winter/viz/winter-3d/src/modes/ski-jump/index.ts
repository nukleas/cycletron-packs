/**
 * SKI JUMP — a floodlit ski jump at night, one jumper a bar: down the
 * in-run for the first half, off the lip on beat three, and down on the
 * landing hill on the next downbeat, where the kick is. The bar's highest
 * note sets how far the jump goes; a glowing line across the hill marks the
 * spot in the colour of the track that played it. Every kick throws snow
 * from the skis of whoever is on the snow, and the landing throws the most.
 * The lamps lining the hill are a keyboard: each note lights the lamp at its
 * pitch, high notes up the in-run, low notes down by the outrun. Held notes
 * brighten the floodlight beams, snares go off as camera flashes in the
 * crowd, hats glitter the falling snow. The cameras cut like a broadcast:
 * the landing, the in-run, the flight, the landing again.
 */

import type {VizMode, VizModeDef, VizServices} from '@cycletron/viz-sdk';
import {type FieldHap, type FieldTeam, HapField} from '@cycletron/viz-sdk';
import {clamp01, hash32, rand01, TAU} from '@cycletron/viz-sdk';
import {drawScene, setRgb} from '@naderlabs/kit/gl';
import {isLong, type Role} from '@naderlabs/kit/roles';
import {type Stance, stance, strike, windup} from '@naderlabs/kit/timing';
import {
    AdditiveBlending, AmbientLight, BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry,
    CylinderGeometry, DirectionalLight, Fog, HemisphereLight, InstancedMesh, Mesh, MeshBasicMaterial,
    MeshLambertMaterial, Object3D, PerspectiveCamera, PlaneGeometry, Points, PointsMaterial, Scene, Vector3,
} from 'three';
import {dotTexture} from '../../lib/dot.js';
import {Ink} from '../../lib/ink.js';
import {Pines} from '../../lib/pines.js';
import {winterRole} from '../../lib/roles.js';
import {NightSky} from '../../lib/sky.js';
import {Snowfall} from '../../lib/snow.js';
import {
    groundY, HILL_W, inrunY, landY, LIP_X, LIP_Y, paintTerrain, stripGeometry, terrainGeometry, terrainY, TRACK,
} from './hill.js';
import {Skier} from './skier.js';

const LOOKAHEAD = 1;
const MAX_HAPS = 200;
const MAX_PER_TRACK = 32;
const DRUM_CAP = 16;
const IDLE_RATE = 0.25;
const INRUN_W = 3;
const LAMPS = 22;
const LAMP_END = 112;
const MAX_SPRAY = 700;
const SPRAY_LIFE = 0.9;
const CROWD = 120;
const CROWD_X0 = 66;
const CROWD_X1 = 124;
const FLASHES = 14;
const FLASH_LIFE = 0.18;
const OUTRUN_END = 150;
const SKY_RADIUS = 220;

/** Skier poses (crouch, lean, vee, arms), switched on the lip at beat three and the landing on the downbeat. */
type Pose = [number, number, number, number];
const POSE_HALF = 1 / 16;
/** The tuck down the in-run; ready is the deeper load just before the lip. */
const INRUN: Record<Stance, Pose> = {rest: [1, 0.15, 0, 0], ready: [1, 0.45, 0, 0.2], hit: [1, 0.45, 0, 0.2]};
/** The pop off the lip, the V in the air, and the brace for the landing. */
const FLIGHT: Record<Stance, Pose> = {rest: [0, 1.5, 0.34, 0], ready: [0.2, 0.5, 0.12, 0.9], hit: [0, 0.2, 0, 1]};
/** The telemark on the downbeat, settling, then gliding out. */
const OUTRUN: Record<Stance, Pose> = {rest: [0.1, 0.05, 0, 0.6], ready: [0.25, -0.1, 0, 1], hit: [0.4, -0.3, 0, 1.2]};

interface Team extends FieldTeam {
    color: Color;
}

interface Note extends FieldHap<Team> {
    role: Role;
}

/** One bar's jump: how far, where it lands, and whose colour marks it. */
interface Jump {
    bar: number;
    dist: number;
    landX: number;
    landY: number;
    mark: Color;
}

interface Flake {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    age: number;
}

interface Flash {
    i: number;
    age: number;
}

class SkiJumpMode implements VizMode {
    private readonly ink = new Ink();
    private readonly scene = new Scene();
    private readonly camera = new PerspectiveCamera(50, 16 / 9, 0.1, 600);
    private readonly air = new Color();
    private readonly fog = new Fog(0x000000, 60, 220);
    private readonly field = new HapField<Team, Note>({
        lookahead: LOOKAHEAD,
        maxHaps: MAX_HAPS,
        maxPerTrack: MAX_PER_TRACK,
        idleRate: IDLE_RATE,
        team: (base) => ({...base, color: new Color()}),
        hap: (base) => ({...base, role: winterRole(base.team.name, base.note)}),
        cap: (_team, note) => (Number.isFinite(note) ? Infinity : DRUM_CAP),
        keep: (h, cycle) => h.end + 0.05 >= cycle,
    });

    private readonly terrain: Mesh;
    private readonly terrainMat = new MeshLambertMaterial({flatShading: true, vertexColors: true});
    private readonly trackMat = new MeshLambertMaterial({polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1});
    private readonly deckMat = new MeshLambertMaterial({flatShading: true});
    private readonly steelMat = new MeshLambertMaterial({flatShading: true});
    private readonly markMat = new MeshBasicMaterial({polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2});
    private readonly mark: Mesh;
    private readonly beamMat = new MeshBasicMaterial({blending: AdditiveBlending, transparent: true, depthWrite: false});
    private readonly headMat = new MeshBasicMaterial();
    private readonly pines = new Pines(160);
    private readonly sky = new NightSky(400, SKY_RADIUS, 0.05, 777);
    private readonly snow = new Snowfall(360, 40, 24, 40, 0.16, 99);
    private readonly skiers = [new Skier(), new Skier()];
    private readonly crowd: InstancedMesh;
    private readonly crowdSeats: Vector3[] = [];

    private readonly lamps: Points;
    private readonly lampPos = new Float32Array(LAMPS * 2 * 3);
    private readonly lampCol = new Float32Array(LAMPS * 2 * 3);
    private readonly lampGlow = new Float32Array(LAMPS);
    private readonly lampTint: Color[] = [];
    private readonly spray: Points;
    private readonly sprayPos = new Float32Array(MAX_SPRAY * 3);
    private readonly sprayCol = new Float32Array(MAX_SPRAY * 3);
    private readonly flakes: Flake[] = [];
    private readonly flashPts: Points;
    private readonly flashPos = new Float32Array(FLASHES * 3);
    private readonly flashCol = new Float32Array(FLASHES * 3);
    private readonly flashes: Flash[] = [];

    private readonly ambient = new AmbientLight(0xffffff, 0.3);
    private readonly hemi = new HemisphereLight(0xffffff, 0x000000, 0.45);
    private readonly flood = new DirectionalLight(0xffffff, 0.9);
    private readonly jumps: Jump[] = [];
    private readonly dummy = new Object3D();
    private readonly at = new Vector3();
    private readonly look = new Vector3();
    private readonly tint = new Color();
    private kick = 0;
    private hat = 0;
    private beams = 0;
    private lastBar = Number.NaN;

    constructor() {
        const {scene} = this;
        scene.background = this.air;
        scene.fog = this.fog;
        this.terrain = new Mesh(terrainGeometry(), this.terrainMat);
        scene.add(this.terrain);
        scene.add(new Mesh(stripGeometry(landY, LIP_X - 1, OUTRUN_END + 30, 90, HILL_W, 0.06), this.trackMat));
        scene.add(new Mesh(stripGeometry(inrunY, 0, LIP_X, 40, INRUN_W, -0.02), this.deckMat));
        scene.add(new Mesh(stripGeometry(inrunY, 0, LIP_X, 40, TRACK, 0.03), this.trackMat));
        this.buildStructure();

        const markGeo = new PlaneGeometry(0.6, HILL_W);
        markGeo.rotateX(-Math.PI / 2);
        this.mark = new Mesh(markGeo, this.markMat);
        this.mark.renderOrder = 2;
        scene.add(this.mark);

        for (const sk of this.skiers) scene.add(sk.root);
        scene.add(this.pines.mesh, this.sky.group, this.snow.points);
        this.sky.placeMoon(new Vector3(0.6, 0.35, -0.7).normalize(), SKY_RADIUS);
        this.plantPines();

        this.crowd = new InstancedMesh(new BoxGeometry(0.45, 1, 0.35).translate(0, 0.5, 0), new MeshLambertMaterial({flatShading: true}), CROWD);
        this.crowd.frustumCulled = false;
        for (let i = 0; i < CROWD; i++) {
            const r = (k: number) => rand01(hash32(i, 50 + k));
            const row = Math.floor(r(1) * 5);
            const x = CROWD_X0 + r(2) * (CROWD_X1 - CROWD_X0);
            const z = -(HILL_W / 2 + 2.5 + row * 1.1);
            this.crowdSeats.push(new Vector3(x, terrainY(x, z), z));
            this.crowd.setColorAt(i, this.tint.setRGB(1, 1, 1));
        }
        scene.add(this.crowd);

        const dot = dotTexture(0.2);
        this.lamps = points(this.lampPos, this.lampCol, 2.4, dot);
        for (let k = 0; k < LAMPS; k++) {
            this.lampTint.push(new Color());
            const x = 2 + (LAMP_END - 2) * (k / (LAMPS - 1));
            const onRun = x < LIP_X;
            const y = (onRun ? inrunY(x) : landY(x)) + 1.3;
            const z = onRun ? INRUN_W / 2 + 0.3 : HILL_W / 2 + 0.6;
            this.lampPos.set([x, y, -z, x, y, z], k * 6);
        }
        this.spray = points(this.sprayPos, this.sprayCol, 0.35, dot);
        this.flashPts = points(this.flashPos, this.flashCol, 3, dot);
        this.lamps.geometry.attributes.position.needsUpdate = true;
        scene.add(this.lamps, this.spray, this.flashPts);

        this.flood.position.set(60, 60, 30);
        this.flood.target.position.set(60, 0, 0);
        scene.add(this.ambient, this.hemi, this.flood, this.flood.target);
    }

    layout(s: VizServices): void {
        const {ink} = this;
        ink.bake(s.theme);
        this.air.copy(ink.bg);
        this.fog.color.copy(ink.bg).lerp(ink.deep, 0.3);
        paintTerrain(this.terrain.geometry, ink.snow, this.tint.copy(ink.deep).lerp(ink.frost, 0.25));
        this.trackMat.color.copy(ink.snow).multiplyScalar(0.85);
        this.deckMat.color.copy(ink.deep).lerp(ink.bg, 0.3);
        this.steelMat.color.copy(ink.deep).lerp(ink.frost, 0.2);
        this.headMat.color.copy(ink.warm).lerp(ink.snow, 0.5);
        this.pines.paint(this.tint.copy(ink.deep).lerp(ink.bg, 0.65), ink.snow, ink.bg);
        this.sky.paint(ink);
        this.snow.paint(ink.snow, 0.6);
        for (let i = 0; i < this.skiers.length; i++) {
            const suit = ink.pool[(i * 3 + 1) % ink.pool.length];
            this.skiers[i].paint(suit, i === 0 ? ink.rose : ink.ice, ink.warm);
        }
        for (let i = 0; i < CROWD; i++) this.crowd.setColorAt(i, this.tint.copy(ink.pool[hash32(i, 9) % ink.pool.length]).multiplyScalar(0.6));
        if (this.crowd.instanceColor) this.crowd.instanceColor.needsUpdate = true;
        this.ambient.color.copy(ink.deep).lerp(ink.frost, 0.4);
        this.hemi.color.copy(ink.frost);
        this.hemi.groundColor.copy(ink.deep).multiplyScalar(0.5);
        this.flood.color.copy(ink.warm).lerp(ink.snow, 0.7);
        this.camera.aspect = s.width / Math.max(1, s.height);
        this.camera.updateProjectionMatrix();
        this.field.invalidate();
    }

    update(dt: number, s: VizServices): void {
        const field = this.field;
        field.update(dt, s);
        if (field.restarted) {
            this.flakes.length = 0;
            this.flashes.length = 0;
            this.jumps.length = 0;
            this.lampGlow.fill(0);
            this.kick = 0;
            this.hat = 0;
            this.lastBar = Number.NaN;
        }
        for (const t of field.teams) setRgb(t.color, t.rgb);
        const now = field.cycle;
        const bar = Math.floor(now);
        if (bar !== this.lastBar) {
            // The skier from last bar touches down on this downbeat.
            const prev = this.jumps.find((j) => j.bar === bar - 1);
            if (prev && !field.restarted) this.spraySnow(prev.landX, prev.landY, 70, 1.4, hash32(bar, 3));
            if (!this.jumpOf(bar - 1)) this.planJump(bar - 1);
            this.planJump(bar);
            this.lastBar = bar;
        }
        let beams = 0;
        for (const h of field.haps) {
            const pitched = h.role === 'bass' || h.role === 'mid' || h.role === 'lead';
            if (pitched && isLong(h.begin, h.end) && h.begin <= now && now < h.end) beams += 0.35;
            if (!field.crossed(h)) continue;
            h.done = true;
            h.team.activity = 1;
            switch (h.role) {
                case 'kick':
                    this.kick = 1;
                    this.kickSpray(now, h.seed);
                    break;
                case 'snare':
                case 'crash':
                    this.flash(h.seed);
                    break;
                case 'hat':
                case 'perc':
                    this.hat = 1;
                    break;
                case 'bass':
                case 'mid':
                case 'lead':
                    this.lightLamp(h);
                    break;
                default:
                    break;
            }
        }
        this.beams += (Math.min(1, beams) - this.beams) * (1 - Math.exp(-dt * 6));
        this.kick *= Math.exp(-dt * 6);
        this.hat *= Math.exp(-dt * 5);
        for (let k = 0; k < LAMPS; k++) this.lampGlow[k] *= Math.exp(-dt * 2.5);
        this.stepSpray(dt);
        for (let i = this.flashes.length - 1; i >= 0; i--) {
            this.flashes[i].age += dt;
            if (this.flashes[i].age >= FLASH_LIFE) this.flashes.splice(i, 1);
        }

        this.placeSkiers(now);
        this.placeCamera(now);
        this.placeLights(now);
        this.center(now);
    }

    render(ctx: CanvasRenderingContext2D, s: VizServices): void {
        drawScene(ctx, this.scene, this.camera, s.width, s.height, s.dpr);
    }

    /** Fix this bar's jump from the notes it holds: the highest one sets the distance. */
    private planJump(bar: number): void {
        let top = -Infinity;
        let mark: Team | null = null;
        for (const h of this.field.haps) {
            if (h.begin < bar || h.begin >= bar + 1 || !(h.role === 'mid' || h.role === 'lead')) continue;
            if (h.note > top) {
                top = h.note;
                mark = h.team;
            }
        }
        const u = Number.isFinite(top) ? clamp01((top - 58) / 28) : 0.3 + 0.3 * rand01(hash32(bar, 1));
        const dist = 30 + 38 * u;
        const landX = LIP_X + dist;
        const jump = {bar, dist, landX, landY: landY(landX), mark: (mark ? mark.color : this.ink.ice).clone()};
        this.jumps.push(jump);
        if (this.jumps.length > 3) this.jumps.shift();
    }

    private jumpOf(bar: number): Jump | null {
        for (const j of this.jumps) if (j.bar === bar) return j;
        return null;
    }

    private lightLamp(h: Note): void {
        const u = clamp01((h.note - 30) / 66);
        const k = Math.round((1 - u) * (LAMPS - 1));
        this.lampGlow[k] = 1;
        this.lampTint[k].copy(h.team.color);
    }

    /** Snow from the skis of every skier on the snow. */
    private kickSpray(now: number, seed: number): void {
        const bar = Math.floor(now);
        for (const b of [bar, bar - 1]) {
            const t = now - b;
            const j = this.jumpOf(b);
            if (!j || (t >= 0.5 && t < 1) || t >= 1.5) continue;
            const x = t < 0.5 ? LIP_X * Math.pow(t / 0.5, 1.35) : outrunX(j, t);
            const y = t < 0.5 ? inrunY(x) : landY(x);
            this.spraySnow(x, y, t < 0.5 ? 18 : 40, t < 0.5 ? 0.6 : 1, hash32(seed, b));
        }
    }

    private spraySnow(x: number, y: number, count: number, power: number, seed: number): void {
        for (let i = 0; i < count; i++) {
            if (this.flakes.length >= MAX_SPRAY) this.flakes.shift();
            const r = (k: number) => rand01(hash32(seed + i * 11, k));
            const a = r(1) * TAU;
            const sp = (2 + r(2) * 6) * power;
            this.flakes.push({x, y: y + 0.2, z: (r(3) - 0.5) * 1.2, vx: Math.cos(a) * sp * 0.6 + 3 * power,
                vy: (3 + r(4) * 6) * power, vz: Math.sin(a) * sp, age: r(5) * 0.2});
        }
    }

    private stepSpray(dt: number): void {
        const {flakes} = this;
        for (let i = flakes.length - 1; i >= 0; i--) {
            const f = flakes[i];
            f.age += dt;
            if (f.age >= SPRAY_LIFE) {
                flakes.splice(i, 1);
                continue;
            }
            f.vy -= 14 * dt;
            f.vx *= Math.exp(-dt * 1.5);
            f.vz *= Math.exp(-dt * 1.5);
            f.x += f.vx * dt;
            f.y += f.vy * dt;
            f.z += f.vz * dt;
        }
    }

    private flash(seed: number): void {
        for (let k = 0; k < 3; k++) {
            if (this.flashes.length >= FLASHES) this.flashes.shift();
            this.flashes.push({i: hash32(seed, k) % CROWD, age: 0});
        }
    }

    private placeSkiers(now: number): void {
        const bar = Math.floor(now);
        for (let i = 0; i < 2; i++) {
            const sk = this.skiers[i];
            // Skier i takes the even or odd bars; the other one is still in the outrun.
            const b = (bar & 1) === i ? bar : bar - 1;
            const j = this.jumpOf(b);
            const t = now - b;
            sk.root.visible = j !== null && t < 1.5;
            if (!j || t >= 1.5) continue;
            const {root} = sk;
            if (t < 0.5) {
                const x = LIP_X * Math.pow(t / 0.5, 1.35);
                root.position.set(x, inrunY(x), 0);
                root.rotation.set(0, 0, Math.atan(slope(inrunY, x)));
                sk.pose(...INRUN[stance(0, windup(now, b + 0.5))]);
            } else if (t < 1) {
                const p = (t - 0.5) / 0.5;
                const x = LIP_X + j.dist * p;
                const arc = 2 + j.dist * 0.05;
                const y = Math.max(landY(x) + 0.15, LIP_Y + (j.landY - LIP_Y) * p + arc * 4 * p * (1 - p));
                root.position.set(x, y, 0);
                const dy = (j.landY - LIP_Y) / j.dist + arc * 4 * (1 - 2 * p) / j.dist;
                root.rotation.set(0, 0, Math.atan(dy) * 0.6 + 0.12);
                sk.pose(...FLIGHT[stance(strike(now, b + 0.5, POSE_HALF), windup(now, b + 1))]);
            } else {
                const x = outrunX(j, t);
                root.position.set(x, landY(x), 0);
                root.rotation.set(0, 0, Math.atan(slope(landY, x)));
                sk.pose(...OUTRUN[stance(strike(now, b + 1, POSE_HALF), 0)]);
            }
        }
    }

    /** Broadcast cuts: landing, in-run, flight, landing. */
    private placeCamera(now: number): void {
        const bar = Math.floor(now);
        const phase = now - bar;
        const {camera, at, look} = this;
        const landing = phase < 0.15 ? bar - 1 : phase >= 0.85 ? bar : -1;
        const side = (hash32(bar + (phase < 0.15 ? -1 : 0), 21) & 1) === 0 ? 1 : -1;
        const focus = this.skiers[((phase < 0.15 ? bar - 1 : bar) & 1) === 0 ? 0 : 1].root.position;
        const j = landing >= 0 ? this.jumpOf(landing) : null;
        if (j) {
            at.set(j.landX + 5, j.landY + 2.5, 14);
            look.set(j.landX - 4, j.landY + 1, 0);
        } else if (phase < 0.5) {
            const x = LIP_X * 0.6;
            at.set(x, inrunY(x) + 1.5, side * 15);
            look.set(focus.x, focus.y + 0.5, 0);
        } else {
            at.set(focus.x - 3, focus.y + 1.6, side * 11);
            look.set(focus.x + 4, focus.y - 1.2, 0);
        }
        at.y = Math.max(at.y, terrainY(at.x, at.z) + 1.8) - this.kick * 0.15;
        camera.position.copy(at);
        camera.lookAt(look);
    }

    private placeLights(now: number): void {
        const {ink, tint} = this;
        for (let k = 0; k < LAMPS; k++) {
            const g = this.lampGlow[k];
            tint.copy(ink.warm).multiplyScalar(0.3).lerp(this.lampTint[k], Math.min(1, g)).multiplyScalar(0.4 + 1.6 * g);
            tint.toArray(this.lampCol, k * 6);
            tint.toArray(this.lampCol, k * 6 + 3);
        }
        this.lamps.geometry.attributes.color.needsUpdate = true;

        const n = this.flakes.length;
        for (let i = 0; i < n; i++) {
            const f = this.flakes[i];
            const a = 1 - f.age / SPRAY_LIFE;
            this.sprayPos[i * 3] = f.x;
            this.sprayPos[i * 3 + 1] = f.y;
            this.sprayPos[i * 3 + 2] = f.z;
            tint.copy(ink.snow).multiplyScalar(a).toArray(this.sprayCol, i * 3);
        }
        flushPoints(this.spray, n);

        let m = 0;
        for (const fl of this.flashes) {
            const seat = this.crowdSeats[fl.i];
            const a = 1 - fl.age / FLASH_LIFE;
            this.flashPos[m * 3] = seat.x;
            this.flashPos[m * 3 + 1] = seat.y + 1.3;
            this.flashPos[m * 3 + 2] = seat.z;
            this.flashCol.fill(a, m * 3, m * 3 + 3);
            m++;
        }
        flushPoints(this.flashPts, m);

        const {dummy} = this;
        for (let i = 0; i < CROWD; i++) {
            const seat = this.crowdSeats[i];
            const hop = this.kick * (0.3 + 0.3 * rand01(hash32(i, 77)));
            dummy.position.set(seat.x, seat.y + hop, seat.z);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            this.crowd.setMatrixAt(i, dummy.matrix);
        }
        this.crowd.instanceMatrix.needsUpdate = true;

        const bar = Math.floor(now);
        const j = this.jumpOf(now - bar < 0.15 ? bar - 1 : bar);
        this.mark.visible = j !== null;
        if (j) {
            this.mark.position.set(j.landX, j.landY + 0.1, 0);
            this.mark.rotation.set(0, 0, Math.atan(slope(landY, j.landX)));
            this.markMat.color.copy(j.mark).multiplyScalar(0.6 + 0.4 * Math.sin(now * TAU * 4) ** 2);
        }
        this.beamMat.color.copy(ink.warm).lerp(ink.snow, 0.5).multiplyScalar(0.012 + 0.05 * this.beams);
    }

    private center(now: number): void {
        const p = this.camera.position;
        this.sky.update(now, 0.25, p);
        this.snow.update(now, 2, 0.8, p.x, p.y, p.z);
        this.snow.paint(this.ink.snow, 0.45 + 0.5 * this.hat);
    }

    private buildStructure(): void {
        const {scene} = this;
        for (const x of [3, 10, 17, 24, 31]) {
            const top = inrunY(x);
            const foot = groundY(x);
            for (const z of [-1.2, 1.2]) {
                const leg = new Mesh(new BoxGeometry(0.35, top - foot, 0.35), this.steelMat);
                leg.position.set(x, (top + foot) / 2, z);
                scene.add(leg);
            }
        }
        const tower = new Mesh(new BoxGeometry(4, 5, 4), this.deckMat);
        tower.position.set(-1.5, inrunY(0) + 1, 0);
        scene.add(tower);
        const beamGeo = new ConeGeometry(4.5, 28, 14, 1, true).translate(0, -14, 0);
        const poleGeo = new CylinderGeometry(0.25, 0.35, 1, 6).translate(0, 0.5, 0);
        for (const [x, z] of [[22, -16], [22, 16], [72, -20], [72, 20], [112, -18], [112, 18]]) {
            const foot = terrainY(x, z);
            const h = 26;
            const pole = new Mesh(poleGeo, this.steelMat);
            pole.position.set(x, foot, z);
            pole.scale.set(1, h, 1);
            const head = new Mesh(new BoxGeometry(1.6, 0.8, 1.6), this.headMat);
            head.position.set(x, foot + h, z);
            const beam = new Mesh(beamGeo, this.beamMat);
            beam.position.copy(head.position);
            const target = new Vector3(x + 10, groundY(x + 10), 0);
            beam.lookAt(target);
            beam.rotateX(-Math.PI / 2);
            beam.renderOrder = 3;
            scene.add(pole, head, beam);
        }
    }

    private plantPines(): void {
        const {pines} = this;
        pines.begin();
        for (let i = 0; i < 160; i++) {
            const r = (k: number) => rand01(hash32(i, 900 + k));
            const x = -20 + r(1) * 190;
            const side = r(2) < 0.5 ? -1 : 1;
            const off = 9 + r(3) * 45;
            const z = side * (HILL_W / 2 + off);
            const y = terrainY(x, z);
            pines.add(x, y - 0.2, z, 1.6 + r(4) * 2.2, r(5) * TAU, r(6));
        }
        pines.end();
    }
}

function outrunX(j: Jump, t: number): number {
    const q = clamp01((t - 1) / 0.5);
    // Out of the landing at the speed of the flight, slowing to a stop.
    return j.landX + j.dist * 0.5 * (1 - (1 - q) * (1 - q));
}

function slope(profile: (x: number) => number, x: number): number {
    return (profile(x + 0.25) - profile(x - 0.25)) / 0.5;
}

function points(pos: Float32Array, col: Float32Array, size: number, map: PointsMaterial['map']): Points {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('color', new BufferAttribute(col, 3));
    const p = new Points(g, new PointsMaterial({size, map, vertexColors: true, blending: AdditiveBlending, transparent: true, depthWrite: false}));
    p.frustumCulled = false;
    p.renderOrder = 4;
    return p;
}

function flushPoints(p: Points, n: number): void {
    p.geometry.setDrawRange(0, n);
    p.geometry.attributes.position.needsUpdate = true;
    p.geometry.attributes.color.needsUpdate = true;
}

export const skiJumpDef: VizModeDef = {
    id: 'ski-jump',
    name: 'SKI JUMP',
    create: () => new SkiJumpMode(),
};
