/**
 * CHAMPAGNE — a tower of fourteen coupes on a round table, the guests around
 * it each playing one voice, every hit landing on the frame its note sounds:
 *
 * - The downbeat: the sommelier behind the tower. The bottle comes up an
 *   eighth of a bar before each bar line and pours from the downbeat for a
 *   quarter of the bar; a full glass spills into the four under it, so the
 *   tower fills from the top and then cascades onto the table.
 * - Kicks: the cork popper. Bottle raised and thumbs on the cork before the
 *   kick; the cork flies on it.
 * - Snares and claps: two toasters, splitting the hits by where in the bar
 *   they fall. Glass forward before, raised high (a flash) on the hit.
 * - Hats and other percussion: the guest tapping a coupe with a spoon,
 *   spoon up between taps, on the glass on each one, sending up bubbles.
 * - Crashes: the sabreur. Sabre overhead a quarter bar before, swept along
 *   the neck on the crash; the neck flies and the bottle sprays.
 * - Pitched notes: the tower's glasses are the keyboard (low notes on the
 *   bottom tier, high on top): a note flashes its glass in the track colour.
 * - The phrase: the clock on the wall shows the last sixteen minutes before
 *   midnight, a minute a beat, through each four-bar phrase, and strikes
 *   twelve on the downbeat. The camera cuts every two bars, wide for each
 *   phrase's last two so the clock is seen.
 *
 * Poses are a few fixed stances switched by `stance()`.
 */

import type {VizMode, VizModeDef, VizServices} from '@cycletron/viz-sdk';
import {type FieldHap, type FieldTeam, HapField, hash32, rand01, TAU} from '@cycletron/viz-sdk';
import {drawScene, setRgb} from '@naderlabs/kit/gl';
import {type Role} from '@naderlabs/kit/roles';
import {beatsLeft, BIG_HIT, HIT, lastOnset, LEAD, nextOnset, stance, type Stance, strike, windup} from '@naderlabs/kit/timing';
import {
    AdditiveBlending, BoxGeometry, CircleGeometry, Color, CylinderGeometry, DirectionalLight, DoubleSide, HemisphereLight,
    InstancedMesh, LatheGeometry, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, NormalBlending, PerspectiveCamera,
    PlaneGeometry, RingGeometry, Scene, ShaderMaterial, Vector2, Vector3,
} from 'three';
import {Figures} from '../../lib/figures.js';
import {Glow} from '../../lib/glow.js';
import {Ink} from '../../lib/ink.js';
import {pitchPos, roleOf, secondsPerCycle} from '../../lib/roles.js';

const LOOKAHEAD = 2;
const MAX_HAPS = 480;
const MAX_PER_TRACK = 64;
const IDLE_RATE = 0.35;
const FOV = 42;
/** Bars per phrase (the clock's count) and per camera shot. */
const PHRASE = 4;
const SHOT = 2;
const CRASH_LEAD = 0.25;
/** Coupe profile: stem top, bowl depth and radius. */
const STEM = 3.3;
const DEPTH = 2.0;
const RADIUS = 2.9;
const RIM = STEM + DEPTH;
const PITCH = 6.3;
/** Fraction of the bar the pour lasts, and the volume it pours (in glasses). */
const POUR = 0.25;
const POUR_VOLUME = 1.6;
/** Level each glass loses per second, so the tower keeps moving. */
const SIP = 0.02;
const MAX_BUBBLES = 900;
const BUBBLE_LIFE = 1.4;
const BOKEH = 40;
/** The table: its top at y = 0, the floor below it. */
const TABLE_R = 13;
const FLOOR = -8;
/** Guests are oversized against the tower, and stand around the table. */
const SIZE = 13;
const RING = 24;
const POURER = 0;
const CORK = 1;
const SPOON = 2;
const TOAST_A = 3;
const TOAST_B = 4;
const SABRE = 5;
const GUESTS = 6;
/** Where each guest stands around the far side of the table, by angle (the camera looks from +z): toasters outside. */
const AT = [Math.PI * 1.5, Math.PI * 0.9, Math.PI * 1.3, Math.PI * 1.1, Math.PI * 1.9, Math.PI * 1.7];
const POURER_Z = -15;
const CLOCK = new Vector3(0, 41, -48);
const CLOCK_R = 8;
const HELD_COUPE = 0.8;
const CORK_LIFE = 0.9;

/** An arm: swing out from the side, and tip toward the table. */
interface Swing {
    angle: number;
    fwd: number;
}

/** The sommelier's bottle arm, and where the bottle points (null: upright). */
const POUR_ARM: Record<Stance, Swing> = {rest: {angle: 0.3, fwd: 0.35}, ready: {angle: 0.25, fwd: 1.55}, hit: {angle: 0.25, fwd: 1.55}};
const POUR_AIM: Record<Stance, Vector3 | null> = {rest: null, ready: new Vector3(0.5, 27, 0), hit: new Vector3(0.5, 18, 0)};
/** The cork popper: the bottle arm and the thumb arm. */
const CORK_HOLD: Record<Stance, Swing> = {rest: {angle: -0.3, fwd: 0.9}, ready: {angle: -0.35, fwd: 1.7}, hit: {angle: -0.3, fwd: 2.2}};
const CORK_THUMB: Record<Stance, Swing> = {rest: {angle: 0.3, fwd: 0.3}, ready: {angle: -0.5, fwd: 1.85}, hit: {angle: 1.7, fwd: 0.7}};
/** A toaster's glass arm. */
const TOAST: Record<Stance, Swing> = {rest: {angle: 0.25, fwd: 0.6}, ready: {angle: 0.15, fwd: 1.35}, hit: {angle: 0.35, fwd: 2.6}};
/** The spoon arm; the glass arm stays put. */
const SPOON_ARM: Record<Stance, Swing> = {rest: {angle: 0.35, fwd: 0.4}, ready: {angle: -0.3, fwd: 1.85}, hit: {angle: -0.55, fwd: 1.3}};
const SPOON_GLASS: Swing = {angle: -0.55, fwd: 1.3};
/** The sabre arm; the bottle arm stays put. */
const SABRE_ARM: Record<Stance, Swing> = {rest: {angle: 0.3, fwd: 0.25}, ready: {angle: 2.9, fwd: 0.35}, hit: {angle: 0.75, fwd: 1.45}};
const SABRE_BOTTLE: Swing = {angle: -0.25, fwd: 1.2};

interface Shot {
    pos: Vector3;
    look: Vector3;
}

/** The tower close, wide, the guests on the left, wide from the right: the wide shots carry each phrase's count. */
const SHOTS: Shot[] = [
    {pos: new Vector3(10, 20, 42), look: new Vector3(0, 14, -8)},
    {pos: new Vector3(3, 21, 68), look: new Vector3(0, 16, -10)},
    {pos: new Vector3(-20, 17, 36), look: new Vector3(-14, 11, -8)},
    {pos: new Vector3(26, 24, 62), look: new Vector3(0, 16, -10)},
];

interface Team extends FieldTeam {}

interface Note extends FieldHap<Team> {
    role: Role;
}

interface Glass {
    x: number;
    y: number;
    z: number;
    tier: number;
    /** Glasses this one spills into. */
    below: number[];
    level: number;
    spill: number;
    liquid: ShaderMaterial;
    surface: Mesh;
}

interface Bubble {
    t0: number;
    glass: number;
    seed: number;
}

/** A voice's pose this frame, and how hard its last hit still rings. */
interface Play {
    stance: Stance;
    ring: number;
}

const REST: Play = {stance: 'rest', ring: 0};
const UP = new Vector3(0, 1, 0);
const isPitched = (r: Role): boolean => r === 'bass' || r === 'mid' || r === 'lead';
const isCrash = (h: Note): boolean => h.role === 'crash';
const isHat = (r: Role): boolean => r === 'hat' || r === 'perc' || r === 'tom';
/** Which toaster takes a snare: by where in the bar it falls, so a note always goes to the same guest. */
const toasterOf = (h: Note): number => Math.round(h.begin * 16) % 2;

class ChampagneMode implements VizMode {
    private readonly scene = new Scene();
    private readonly camera = new PerspectiveCamera(FOV, 16 / 9, 0.3, 500);
    private readonly ink = new Ink();
    private readonly field = new HapField<Team, Note>({
        lookahead: LOOKAHEAD,
        maxHaps: MAX_HAPS,
        maxPerTrack: MAX_PER_TRACK,
        idleRate: IDLE_RATE,
        team: (base) => base,
        hap: (base) => ({...base, role: roleOf(base.team.name, base.note)}),
        keep: (h, cycle) => h.begin + 0.5 >= cycle,
    });
    private readonly glasses: Glass[] = [];
    private readonly glassMat: ShaderMaterial;
    private readonly liquidColor = new Color();
    private readonly liquidDeep = new Color();
    private readonly surfaceMat: ShaderMaterial;
    private readonly bottleMat: ShaderMaterial;
    private readonly bottles: Mesh[] = [];
    private readonly stream: Mesh;
    private readonly streamMat: ShaderMaterial;
    private readonly tableMat: ShaderMaterial;
    private readonly glow = new Glow(MAX_BUBBLES + 900);
    private readonly bubbles: Bubble[] = [];
    private nextBubble = 0;
    private readonly guests = new Figures(GUESTS, SIZE);
    private readonly hemi = new HemisphereLight();
    private readonly key = new DirectionalLight();
    private readonly coupeMat = new MeshLambertMaterial({flatShading: true});
    private readonly coupes: Mesh[] = [];
    private readonly metalMat = new MeshLambertMaterial({flatShading: true});
    private readonly spoon: Mesh;
    private readonly sabre: Mesh;
    private readonly cork: Mesh;
    private readonly neck: Mesh;
    private readonly clothMat = new MeshLambertMaterial();
    private readonly floorMat = new MeshLambertMaterial();
    private readonly faceMat = new MeshBasicMaterial();
    private readonly rimMat = new MeshBasicMaterial({side: DoubleSide});
    private readonly ticks: InstancedMesh;
    private readonly minute: Mesh;
    private readonly hour: Mesh;
    private time = 0;
    private spc = 2;
    private puddle = 0;

    // This frame's poses, and where the props' business ends are.
    private pour: Stance = 'rest';
    private kick: Play = REST;
    private crash: Play = REST;
    private hat: Play = REST;
    private readonly toast: Play[] = [REST, REST];
    private readonly mouth = new Vector3();
    private readonly corkMouth = new Vector3();
    private readonly corkDir = new Vector3();
    private readonly corkFrom = new Vector3();
    private readonly corkVel = new Vector3();
    private corkAt = -1e9;
    private readonly sabreMouth = new Vector3();
    private readonly neckFrom = new Vector3();
    private readonly neckVel = new Vector3();
    private neckAt = -1e9;
    private readonly toastAt = [new Vector3(), new Vector3()];
    private readonly tapAt = new Vector3();
    private readonly tmp = new Color();
    private readonly white = new Color(1, 1, 1);
    private readonly skin = new Color();
    private readonly v = new Vector3();
    private readonly dir = new Vector3();
    private readonly facing = new Vector3();
    private readonly m = new Matrix4();

    constructor() {
        this.glassMat = new ShaderMaterial({
            uniforms: {uTint: {value: new Color()}},
            vertexShader: FRESNEL_VERT,
            fragmentShader: GLASS_FRAG,
            transparent: true,
            depthWrite: false,
            side: DoubleSide,
            blending: AdditiveBlending,
        });
        this.surfaceMat = new ShaderMaterial({
            uniforms: {uColor: {value: this.liquidColor}, uInner: {value: 0}},
            vertexShader: FRESNEL_VERT,
            fragmentShader: SURFACE_FRAG,
            transparent: true,
            blending: NormalBlending,
        });
        const glassGeo = new LatheGeometry(glassProfile(), 40);
        const liquidGeo = new LatheGeometry(bowlProfile(), 40);
        const discGeo = new CircleGeometry(1, 40);
        discGeo.rotateX(-Math.PI / 2);

        // Three tiers: 3×3, 2×2, 1; each glass stands where four rims meet.
        const index = new Map<string, number>();
        for (let tier = 0; tier < 3; tier++) {
            const n = 3 - tier;
            for (let i = 0; i < n; i++) {
                for (let j = 0; j < n; j++) {
                    const x = (i - (n - 1) / 2) * PITCH;
                    const z = (j - (n - 1) / 2) * PITCH;
                    index.set(`${tier}:${i}:${j}`, this.glasses.length);
                    const liquid = new ShaderMaterial({
                        uniforms: {uColor: {value: new Color()}, uDeep: {value: this.liquidDeep}, uLevel: {value: 0}, uInner: {value: 0}},
                        vertexShader: LIQUID_VERT,
                        fragmentShader: LIQUID_FRAG,
                        transparent: true,
                        side: DoubleSide,
                    });
                    const surface = new Mesh(discGeo, this.surfaceMat);
                    this.glasses.push({x, y: tier * RIM, z, tier, below: [], level: 0, spill: 0, liquid, surface});
                }
            }
        }
        for (let tier = 1; tier < 3; tier++) {
            const n = 3 - tier;
            for (let i = 0; i < n; i++) {
                for (let j = 0; j < n; j++) {
                    const g = this.glasses[index.get(`${tier}:${i}:${j}`) ?? 0];
                    for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
                        g.below.push(index.get(`${tier - 1}:${i + di}:${j + dj}`) ?? 0);
                    }
                }
            }
        }
        for (const g of this.glasses) {
            const liquid = new Mesh(liquidGeo, g.liquid);
            liquid.position.set(g.x, g.y, g.z);
            liquid.renderOrder = 1;
            g.surface.renderOrder = 2;
            const glass = new Mesh(glassGeo, this.glassMat);
            glass.position.set(g.x, g.y, g.z);
            glass.renderOrder = 3;
            this.scene.add(liquid, g.surface, glass);
        }

        this.bottleMat = new ShaderMaterial({
            uniforms: {uTint: {value: new Color()}, uLabel: {value: new Color()}},
            vertexShader: FRESNEL_VERT,
            fragmentShader: BOTTLE_FRAG,
        });
        const bottleGeo = new LatheGeometry(bottleProfile(), 32);
        // The sommelier's, the cork popper's and the sabreur's.
        for (let i = 0; i < 3; i++) this.bottles.push(new Mesh(bottleGeo, this.bottleMat));
        this.streamMat = new ShaderMaterial({
            uniforms: {uColor: {value: this.liquidColor}, uFlow: {value: 0}, uTime: {value: 0}},
            vertexShader: STREAM_VERT,
            fragmentShader: STREAM_FRAG,
            transparent: true,
            depthWrite: false,
            blending: AdditiveBlending,
        });
        const streamGeo = new CylinderGeometry(0.26, 0.18, 1, 10, 8, true);
        streamGeo.translate(0, -0.5, 0);
        this.stream = new Mesh(streamGeo, this.streamMat);
        this.stream.renderOrder = 4;

        // Coupes in the guests' hands: two toasters and the spoon tapper.
        for (let i = 0; i < 3; i++) {
            const coupe = new Mesh(glassGeo, this.coupeMat);
            coupe.scale.setScalar(HELD_COUPE);
            this.coupes.push(coupe);
        }
        const spoonGeo = new BoxGeometry(0.35, 3.2, 0.35);
        spoonGeo.translate(0, 1.6, 0);
        this.spoon = new Mesh(spoonGeo, this.metalMat);
        const sabreGeo = new BoxGeometry(0.3, 8.5, 0.9);
        sabreGeo.translate(0, 4.25, 0);
        this.sabre = new Mesh(sabreGeo, this.metalMat);
        this.cork = new Mesh(new CylinderGeometry(0.55, 0.5, 1.1, 10), this.coupeMat);
        this.neck = new Mesh(new CylinderGeometry(0.5, 0.55, 2.2, 10), this.bottleMat);

        this.tableMat = new ShaderMaterial({
            uniforms: {uColor: {value: new Color()}, uGlow: {value: new Color()}, uPuddle: {value: 0}, uInner: {value: 0}},
            vertexShader: TABLE_VERT,
            fragmentShader: TABLE_FRAG,
        });
        const top = new Mesh(new CircleGeometry(TABLE_R, 48), this.tableMat);
        top.rotation.x = -Math.PI / 2;
        const skirt = new Mesh(new CylinderGeometry(TABLE_R, TABLE_R + 0.6, -FLOOR, 48, 1, true), this.clothMat);
        skirt.position.y = FLOOR / 2;
        const floor = new Mesh(new PlaneGeometry(400, 300), this.floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = FLOOR;
        // The sommelier's step, behind the table.
        const step = new Mesh(new BoxGeometry(10, -FLOOR, 8), this.clothMat);
        step.position.set(0, FLOOR / 2, POURER_Z);

        // The clock on the back wall.
        const face = new Mesh(new CircleGeometry(CLOCK_R, 48), this.faceMat);
        face.position.copy(CLOCK);
        const rim = new Mesh(new RingGeometry(CLOCK_R, CLOCK_R + 0.9, 48), this.rimMat);
        rim.position.copy(CLOCK);
        this.ticks = new InstancedMesh(new BoxGeometry(0.5, 1.6, 0.2), this.rimMat, 12);
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * TAU;
            this.m.makeRotationZ(-a).setPosition(CLOCK.x + Math.sin(a) * (CLOCK_R - 1.3), CLOCK.y + Math.cos(a) * (CLOCK_R - 1.3), CLOCK.z + 0.1);
            this.ticks.setMatrixAt(i, this.m);
        }
        this.minute = new Mesh(handGeo(CLOCK_R - 1.2, 0.55), this.rimMat);
        this.hour = new Mesh(handGeo(CLOCK_R * 0.55, 0.9), this.rimMat);
        this.minute.position.set(CLOCK.x, CLOCK.y, CLOCK.z + 0.3);
        this.hour.position.set(CLOCK.x, CLOCK.y, CLOCK.z + 0.2);

        this.key.position.set(20, 40, 50);
        this.glow.group.renderOrder = 5;
        this.scene.add(top, skirt, floor, step, face, rim, this.ticks, this.minute, this.hour, ...this.bottles, this.stream,
            ...this.coupes, this.spoon, this.sabre, this.cork, this.neck, this.guests.group, this.glow.group, this.hemi, this.key);

        for (let i = 0; i < MAX_BUBBLES; i++) this.bubbles.push({t0: -1e9, glass: 0, seed: 0});
    }

    layout(s: VizServices): void {
        const ink = this.ink;
        ink.bake(s.theme);
        this.scene.background = ink.bg;
        this.liquidColor.copy(ink.neon).lerp(ink.active, 0.25).multiplyScalar(0.85);
        this.liquidDeep.copy(ink.neon).lerp(ink.red, 0.2).multiplyScalar(0.18);
        const tint: Color = this.glassMat.uniforms.uTint.value;
        tint.copy(ink.active).lerp(ink.second, 0.35);
        const bottle: Color = this.bottleMat.uniforms.uTint.value;
        bottle.copy(ink.bg).lerp(ink.violet, 0.7).lerp(ink.second, 0.1);
        const label: Color = this.bottleMat.uniforms.uLabel.value;
        label.copy(ink.neon);
        const table: Color = this.tableMat.uniforms.uColor.value;
        table.copy(ink.active).lerp(ink.violet, 0.5).multiplyScalar(0.5);
        const glow: Color = this.tableMat.uniforms.uGlow.value;
        glow.copy(this.liquidColor);
        this.clothMat.color.copy(ink.active).lerp(ink.violet, 0.55).multiplyScalar(0.55);
        this.floorMat.color.copy(ink.bg).lerp(ink.violet, 0.3);
        this.faceMat.color.copy(ink.bg).lerp(ink.violet, 0.5);
        this.rimMat.color.copy(ink.neon);
        this.coupeMat.color.copy(this.liquidColor);
        this.metalMat.color.copy(ink.active).lerp(ink.second, 0.2);
        this.hemi.color.copy(ink.violet).lerp(this.white, 0.45);
        this.hemi.groundColor.copy(ink.bg);
        this.hemi.intensity = 1.6;
        this.key.color.copy(ink.active);
        this.key.intensity = 1.5;
        this.skin.copy(ink.active).lerp(ink.red, 0.25);
        for (let i = 0; i < GUESTS; i++) {
            this.tmp.copy(ink.accent(i + 1)).lerp(ink.active, 0.15).lerp(ink.bg, 0.3);
            this.guests.dress(i, this.tmp, this.skin, ink.accent(i + 3));
        }
        this.camera.aspect = s.width / Math.max(1, s.height);
        this.camera.updateProjectionMatrix();
        this.glow.view(s.height * s.dpr, FOV);
        this.field.invalidate();
    }

    update(dt: number, s: VizServices): void {
        const field = this.field;
        field.update(dt, s);
        const cycle = field.cycle;
        this.spc = secondsPerCycle(s.bpm);
        if (field.restarted) {
            for (const g of this.glasses) {
                g.level = 0;
                g.spill = 0;
            }
            for (const b of this.bubbles) b.t0 = -1e9;
            this.puddle = 0;
            this.corkAt = -1e9;
            this.neckAt = -1e9;
        }
        this.time = cycle * this.spc;

        // The pour: from each downbeat for a quarter bar, the bottle up an eighth before.
        const inBar = cycle - Math.floor(cycle);
        this.pour = inBar < POUR ? 'hit' : windup(cycle, Math.ceil(cycle)) > 0 ? 'ready' : 'rest';
        this.kick = this.play(cycle, (h) => h.role === 'kick', LEAD);
        const crashRing = strike(cycle, lastOnset(field.haps, cycle, isCrash), BIG_HIT);
        this.crash = {stance: stance(crashRing, windup(cycle, nextOnset(field.haps, cycle, isCrash), CRASH_LEAD)), ring: crashRing};
        this.hat = this.play(cycle, (h) => isHat(h.role), LEAD);
        for (let k = 0; k < 2; k++) this.toast[k] = this.play(cycle, (h) => h.role === 'snare' && toasterOf(h) === k, LEAD);
        this.pose();

        for (const h of field.haps) {
            if (!field.crossed(h)) continue;
            h.done = true;
            h.team.activity = 1;
            if (h.role === 'kick') {
                this.corkAt = this.time;
                this.corkFrom.copy(this.corkMouth);
                this.corkVel.copy(this.corkDir).multiplyScalar(26);
            } else if (h.role === 'crash') {
                this.neckAt = this.time;
                this.neckFrom.copy(this.sabreMouth);
                this.neckVel.copy(this.facing).multiplyScalar(-6).add(this.v.set(0, 16, 0));
            } else if (isHat(h.role)) {
                for (let n = 0; n < 4; n++) this.bubble(hash32(h.seed, n + 1));
            }
        }
        if (!field.restarted && Math.floor(field.prevCycle * 4) !== Math.floor(cycle * 4)) {
            this.bubble(hash32(Math.floor(cycle * 4), 991));
        }
        this.flow(dt, cycle);
        this.puddle *= Math.exp(-dt * 0.4);
    }

    /** The pose of the voice `pick` selects, from its last hit and its next. */
    private play(cycle: number, pick: (h: Note) => boolean, lead: number): Play {
        const ring = strike(cycle, lastOnset(this.field.haps, cycle, pick));
        return {stance: stance(ring, windup(cycle, nextOnset(this.field.haps, cycle, pick), lead)), ring};
    }

    /** Stands every guest and puts each prop in its hand. */
    private pose(): void {
        const g = this.guests;
        g.stand(POURER, 0, 0, POURER_Z, 0, 0);
        for (let i = 1; i < GUESTS; i++) {
            const a = AT[i];
            const x = Math.cos(a) * RING;
            const z = Math.sin(a) * RING;
            g.stand(i, x, FLOOR, z, Math.atan2(-x, -z), 0);
        }

        // The sommelier.
        g.arm(POURER, -1, 0.3, 0.2);
        const pa = POUR_ARM[this.pour];
        g.arm(POURER, 1, pa.angle, pa.fwd);
        const aim = POUR_AIM[this.pour];
        if (aim) this.dir.copy(aim).sub(g.hand).normalize();
        else this.dir.copy(UP);
        this.hold(this.bottles[0], g.hand, this.dir, 3);
        this.mouth.copy(g.hand).addScaledVector(this.dir, 6.4);

        // The cork popper.
        this.face(CORK);
        const hold = CORK_HOLD[this.kick.stance];
        g.arm(CORK, 1, hold.angle, hold.fwd);
        this.dir.copy(UP).addScaledVector(this.facing, this.kick.stance === 'rest' ? 0.15 : 0.55).normalize();
        this.hold(this.bottles[1], g.hand, this.dir, 3);
        this.corkMouth.copy(g.hand).addScaledVector(this.dir, 6.4);
        this.corkDir.copy(this.dir);
        const thumb = CORK_THUMB[this.kick.stance];
        g.arm(CORK, -1, thumb.angle, thumb.fwd);

        // The spoon tapper: glass steady, spoon up between taps and on the glass on each.
        g.arm(SPOON, -1, SPOON_GLASS.angle, SPOON_GLASS.fwd);
        this.holdCoupe(this.coupes[2], g.hand);
        this.tapAt.copy(g.hand).add(this.v.set(0, (STEM + DEPTH * 0.6) * HELD_COUPE, 0));
        const sp = SPOON_ARM[this.hat.stance];
        g.arm(SPOON, 1, sp.angle, sp.fwd);
        this.hold(this.spoon, g.hand, this.v.copy(g.reach).negate().lerp(UP, 0.5).normalize(), 0);

        // The toasters.
        for (let k = 0; k < 2; k++) {
            const who = k === 0 ? TOAST_A : TOAST_B;
            const t = TOAST[this.toast[k].stance];
            g.arm(who, -1, 0.3, 0.3);
            g.arm(who, 1, t.angle, t.fwd);
            this.holdCoupe(this.coupes[k], g.hand);
            this.toastAt[k].copy(g.hand).add(this.v.set(0, RIM * HELD_COUPE, 0));
        }

        // The sabreur: bottle out at arm's length, the sabre overhead and then along the neck.
        this.face(SABRE);
        g.arm(SABRE, -1, SABRE_BOTTLE.angle, SABRE_BOTTLE.fwd);
        this.dir.copy(UP).addScaledVector(this.facing, 0.8).normalize();
        this.hold(this.bottles[2], g.hand, this.dir, 3);
        this.sabreMouth.copy(g.hand).addScaledVector(this.dir, 6.4);
        const sa = SABRE_ARM[this.crash.stance];
        g.arm(SABRE, 1, sa.angle, sa.fwd);
        this.hold(this.sabre, g.hand, this.v.copy(g.reach), 0);
        g.commit();
    }

    /** The way guest `i` faces, into `facing`. */
    private face(i: number): void {
        const a = AT[i];
        this.facing.set(-Math.cos(a), 0, -Math.sin(a));
    }

    /** `mesh` (modelled along +y) held at `hand` pointing along `dir`, gripped `grip` up from its base. */
    private hold(mesh: Mesh, hand: Vector3, dir: Vector3, grip: number): void {
        mesh.quaternion.setFromUnitVectors(UP, dir);
        mesh.position.copy(hand).addScaledVector(dir, -grip);
    }

    /** A coupe held upright by the stem. */
    private holdCoupe(mesh: Mesh, hand: Vector3): void {
        mesh.quaternion.identity();
        mesh.position.copy(hand).add(this.v.set(0, -STEM * 0.5 * HELD_COUPE, 0));
    }

    /** The pour, then each tier's overflow into the next, top down. */
    private flow(dt: number, cycle: number): void {
        const inBar = cycle - Math.floor(cycle);
        const top = this.glasses[this.glasses.length - 1];
        const rate = POUR_VOLUME / (POUR * this.spc);
        const order = this.glasses;
        for (const g of order) g.spill = 0;
        if (inBar < POUR) top.level += rate * dt;
        for (let n = order.length - 1; n >= 0; n--) {
            const g = order[n];
            g.level = Math.max(0, g.level - SIP * dt);
            if (g.level <= 1) continue;
            const extra = g.level - 1;
            g.level = 1;
            g.spill = extra / dt;
            if (g.below.length === 0) {
                this.puddle = Math.min(1, this.puddle + extra * 0.5);
                continue;
            }
            for (const b of g.below) this.glasses[b].level += extra / g.below.length;
        }
    }

    private bubble(seed: number): void {
        // Only glasses with something in them fizz.
        const g = Math.floor(rand01(hash32(seed, 3)) * this.glasses.length);
        if (this.glasses[g].level < 0.2) return;
        const b = this.bubbles[this.nextBubble];
        this.nextBubble = (this.nextBubble + 1) % MAX_BUBBLES;
        b.t0 = this.time;
        b.glass = g;
        b.seed = seed;
    }

    render(ctx: CanvasRenderingContext2D, s: VizServices): void {
        const cycle = this.field.cycle;
        const cam = this.camera;
        const shot = SHOTS[Math.floor(cycle / SHOT) % SHOTS.length];
        cam.position.copy(shot.pos);
        cam.lookAt(shot.look);

        const inner = this.kick.ring;
        for (const g of this.glasses) {
            const level = g.level;
            const surfaceY = STEM + DEPTH * level;
            g.liquid.uniforms.uLevel.value = surfaceY;
            g.liquid.uniforms.uInner.value = inner * 0.4;
            const c: Color = g.liquid.uniforms.uColor.value;
            c.copy(this.liquidColor);
            g.surface.visible = level > 0.02;
            const r = RADIUS * Math.sqrt(level) * 0.98;
            g.surface.position.set(g.x, g.y + surfaceY, g.z);
            g.surface.scale.set(r, 1, r);
        }
        // A note lights its glass in the track's colour.
        for (const h of this.field.haps) {
            if (!isPitched(h.role)) continue;
            const k = strike(cycle, h.begin, 1 / 16) * h.fade;
            if (k < 0.05) continue;
            const g = this.glasses[glassForPitch(pitchPos(h.note))];
            const c: Color = g.liquid.uniforms.uColor.value;
            c.lerp(setRgb(this.tmp, h.team.rgb), Math.min(1, k));
            g.liquid.uniforms.uInner.value = Math.max(g.liquid.uniforms.uInner.value, k * 1.2);
        }
        this.surfaceMat.uniforms.uInner.value = inner;
        this.tableMat.uniforms.uPuddle.value = this.puddle;
        this.tableMat.uniforms.uInner.value = inner;
        this.coupeMat.emissive.copy(this.liquidColor).multiplyScalar(0.25);
        this.placeStream();
        this.placeFlying();
        this.setClock(cycle);
        this.drawGlints(cycle);
        drawScene(ctx, this.scene, cam, s.width, s.height, s.dpr);
    }

    /** The stream from the sommelier's bottle to the top glass, while pouring. */
    private placeStream(): void {
        const top = this.glasses[this.glasses.length - 1];
        const pouring = this.pour === 'hit';
        this.stream.visible = pouring;
        if (!pouring) return;
        const m = this.mouth;
        const targetY = top.y + STEM + DEPTH * Math.max(0.2, top.level);
        this.dir.set(top.x - m.x, targetY - m.y, top.z - m.z);
        const len = Math.max(0.01, this.dir.length());
        this.stream.position.copy(m);
        // The stream geometry hangs down -y from its origin.
        this.stream.quaternion.setFromUnitVectors(this.v.set(0, -1, 0), this.dir.normalize());
        this.stream.scale.set(1, len, 1);
        this.streamMat.uniforms.uFlow.value = 1;
        this.streamMat.uniforms.uTime.value = this.time;
    }

    /** The cork off the last kick and the neck off the last crash, in flight. */
    private placeFlying(): void {
        const fly = (mesh: Mesh, from: Vector3, vel: Vector3, t: number): void => {
            mesh.visible = t >= 0 && t < CORK_LIFE;
            if (!mesh.visible) return;
            mesh.position.copy(from).addScaledVector(vel, t).add(this.v.set(0, -14 * t * t, 0));
            mesh.rotation.set(t * 14, 0, t * 9);
        };
        fly(this.cork, this.corkFrom, this.corkVel, this.time - this.corkAt);
        fly(this.neck, this.neckFrom, this.neckVel, this.time - this.neckAt);
    }

    /** The last sixteen minutes to midnight, a minute a beat; twelve on the phrase's downbeat. */
    private setClock(cycle: number): void {
        const down = strike(cycle, Math.floor(cycle / PHRASE) * PHRASE, 1 / 16);
        const minutes = down > HIT ? 60 : 60 - beatsLeft(cycle, PHRASE);
        this.minute.rotation.z = -(minutes / 60) * TAU;
        this.hour.rotation.z = -((11 + minutes / 60) / 12) * TAU;
        this.faceMat.color.copy(this.ink.bg).lerp(this.ink.violet, 0.5).lerp(this.white, down > HIT ? 0.6 : 0);
    }

    private drawGlints(cycle: number): void {
        const gl = this.glow;
        const ink = this.ink;
        gl.begin();
        // Party lights out of focus far behind the table.
        for (let i = 0; i < BOKEH; i++) {
            const a = rand01(hash32(i, 41)) * TAU;
            const d = 80 + rand01(hash32(i, 42)) * 30;
            gl.add(Math.cos(a) * d, 6 + rand01(hash32(i, 43)) * 34, Math.sin(a) * d, ink.accent(i), 0.1, 16);
        }
        const down = strike(cycle, Math.floor(cycle / PHRASE) * PHRASE, 1 / 16);
        if (down > 0.1) gl.add(CLOCK.x, CLOCK.y, CLOCK.z + 1, ink.active, down * 1.4, 26);
        for (const g of this.glasses) {
            gl.add(g.x - RADIUS * 0.55, g.y + RIM, g.z + RADIUS * 0.8, ink.active, 0.18, 0.9);
            if (g.spill > 0.01) this.drawSpill(g, cycle);
        }
        // The hits: a toast's flash, the tap on the glass, the cork's foam, the sabre's spray.
        for (let k = 0; k < 2; k++) {
            const ring = this.toast[k].ring;
            if (ring > 0.1) gl.add(this.toastAt[k].x, this.toastAt[k].y, this.toastAt[k].z, ink.active, ring * 1.3, 5);
        }
        if (this.hat.ring > 0.1) gl.add(this.tapAt.x, this.tapAt.y, this.tapAt.z, this.white, this.hat.ring, 2.5);
        this.spray(this.corkFrom, this.corkVel, this.time - this.corkAt, 0.6);
        this.spray(this.neckFrom, this.neckVel, this.time - this.neckAt, 1);
        for (const b of this.bubbles) {
            const t = this.time - b.t0;
            if (t < 0 || t > BUBBLE_LIFE) continue;
            const g = this.glasses[b.glass];
            const top = STEM + DEPTH * g.level;
            const r = rand01(hash32(b.seed, 1));
            const a = rand01(hash32(b.seed, 2)) * TAU;
            const rad = RADIUS * Math.sqrt(g.level) * 0.75 * Math.sqrt(r);
            const y = STEM + 0.15 + t * 1.6 * (0.7 + r * 0.6);
            if (y > top) continue;
            gl.add(g.x + Math.cos(a) * rad, g.y + y, g.z + Math.sin(a) * rad, this.white, 0.45, 0.32);
        }
        gl.commit();
    }

    /** Foam thrown off a bottle mouth along `vel`, for a moment after it opens. */
    private spray(from: Vector3, vel: Vector3, t: number, k: number): void {
        if (t < 0 || t > 0.6) return;
        const seed = Math.floor(from.x * 7 + from.z * 13);
        for (let n = 0; n < 24; n++) {
            const h = hash32(seed, n);
            const s = 0.3 + rand01(h) * 0.7;
            const jx = (rand01(hash32(h, 1)) - 0.5) * 8;
            const jz = (rand01(hash32(h, 2)) - 0.5) * 8;
            this.glow.add(from.x + (vel.x * 0.5 + jx) * t * s, from.y + vel.y * 0.5 * t * s - 10 * t * t, from.z + (vel.z * 0.5 + jz) * t * s,
                this.liquidColor, (1 - t / 0.6) * k, 0.8);
        }
    }

    /** Droplets sheeting over the rim toward each glass below, or to the table; a sheet a beat. */
    private drawSpill(g: Glass, cycle: number): void {
        const gl = this.glow;
        const k = Math.min(1, g.spill * 0.8);
        const targets = g.below.length > 0 ? g.below.length : 4;
        for (let n = 0; n < targets; n++) {
            const below = g.below.length > 0 ? this.glasses[g.below[n]] : null;
            const dx = below ? below.x - g.x : (n % 2 === 0 ? -1 : 1) * 2;
            const dz = below ? below.z - g.z : (n < 2 ? -1 : 1) * 2;
            const len = Math.hypot(dx, dz);
            const ex = g.x + (dx / len) * RADIUS;
            const ez = g.z + (dz / len) * RADIUS;
            const drop = below ? RIM - (below.y + STEM + DEPTH * below.level - g.y) : RIM + g.y;
            for (let j = 0; j < 7; j++) {
                const u = (cycle * 4 + j / 7 + n * 0.13) % 1;
                gl.add(ex + (dx / len) * u * 0.6, g.y + RIM - drop * u * u, ez + (dz / len) * u * 0.6, this.liquidColor, k * 0.5, 0.45);
            }
        }
    }
}

/** A clock hand of length `len` and width `w`, pivoting near its foot. */
function handGeo(len: number, w: number): BoxGeometry {
    const g = new BoxGeometry(w, len, 0.3);
    g.translate(0, len / 2 - 0.6, 0);
    return g;
}

/** A glass for a pitch, always the same one: low notes on the bottom tier, high on top. */
function glassForPitch(p: number): number {
    if (p > 0.72) return 13;
    if (p > 0.45) return 9 + Math.min(3, Math.floor(((p - 0.45) / 0.27) * 4));
    return Math.min(8, Math.floor((p / 0.45) * 9));
}

function glassProfile(): Vector2[] {
    const pts = [new Vector2(0, 0), new Vector2(1.7, 0), new Vector2(1.6, 0.1), new Vector2(0.3, 0.35), new Vector2(0.17, 1.2),
        new Vector2(0.17, STEM - 0.3), new Vector2(0.35, STEM)];
    for (let i = 1; i <= 10; i++) {
        const t = i / 10;
        pts.push(new Vector2(RADIUS * Math.sqrt(t) + 0.04, STEM + DEPTH * t));
    }
    return pts;
}

function bowlProfile(): Vector2[] {
    const pts = [new Vector2(0, STEM + 0.02)];
    for (let i = 1; i <= 10; i++) {
        const t = i / 10;
        pts.push(new Vector2(RADIUS * Math.sqrt(t) * 0.98, STEM + 0.02 + DEPTH * t * 0.98));
    }
    return pts;
}

function bottleProfile(): Vector2[] {
    return [new Vector2(0, 0), new Vector2(1.25, 0), new Vector2(1.3, 0.3), new Vector2(1.3, 5.2), new Vector2(1.1, 6.2),
        new Vector2(0.55, 7.3), new Vector2(0.45, 8.9), new Vector2(0.55, 9.1), new Vector2(0.5, 9.4), new Vector2(0, 9.4)];
}

const FRESNEL_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vLocal;
void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vLocal = position;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = cameraPosition - w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
}`;

const GLASS_FRAG = /* glsl */ `
uniform vec3 uTint;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vLocal;
void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vView);
    float f = 1.0 - abs(dot(n, v));
    float edge = pow(f, 3.0);
    float spec = pow(max(dot(reflect(-v, n), normalize(vec3(0.4, 0.8, 0.5))), 0.0), 60.0);
    gl_FragColor = vec4(uTint * (0.05 + edge * 0.7) + vec3(spec * 0.9), 1.0);
    #include <colorspace_fragment>
}`;

const LIQUID_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
varying float vY;
void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vY = position.y;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = cameraPosition - w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
}`;

const LIQUID_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uDeep;
uniform float uLevel;
uniform float uInner;
varying vec3 vNormal;
varying vec3 vView;
varying float vY;
void main() {
    if (vY > uLevel) discard;
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vView);
    float f = abs(dot(n, v));
    float depth = clamp((uLevel - vY) / 2.0, 0.0, 1.0);
    vec3 c = mix(uColor, uDeep, 0.35 + depth * 0.6) * (0.4 + 0.6 * f) + uColor * uInner * 0.6;
    gl_FragColor = vec4(c, 0.7);
    #include <colorspace_fragment>
}`;

const SURFACE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uInner;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vLocal;
void main() {
    float r = length(vLocal.xz);
    float foam = smoothstep(0.75, 1.0, r);
    vec3 c = uColor * (0.6 + uInner * 0.6) + vec3(foam * 0.3);
    gl_FragColor = vec4(c, 0.85);
    #include <colorspace_fragment>
}`;

const BOTTLE_FRAG = /* glsl */ `
uniform vec3 uTint;
uniform vec3 uLabel;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vLocal;
void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vView);
    float f = pow(1.0 - abs(dot(n, v)), 2.0);
    float spec = pow(max(dot(reflect(-v, n), normalize(vec3(0.3, 0.6, 0.7))), 0.0), 40.0);
    float label = step(1.6, vLocal.y) * step(vLocal.y, 4.2);
    float foil = step(7.6, vLocal.y);
    vec3 c = uTint * (0.5 + f) + vec3(spec);
    c = mix(c, uLabel * (0.35 + 0.4 * f) + vec3(spec * 0.5), max(label * 0.85, foil));
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
}`;

const STREAM_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const STREAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uFlow;
uniform float uTime;
varying vec2 vUv;
void main() {
    float ripple = 0.7 + 0.3 * sin(vUv.y * 40.0 + uTime * 30.0);
    gl_FragColor = vec4(uColor * ripple * uFlow * 0.9, 1.0);
    #include <colorspace_fragment>
}`;

const TABLE_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
}`;

const TABLE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uGlow;
uniform float uPuddle;
uniform float uInner;
varying vec3 vWorld;
void main() {
    float d = length(vWorld.xz);
    float pool = exp(-d * d / 220.0);
    float puddle = smoothstep(12.0 + uPuddle * 4.0, 8.0, d) * uPuddle;
    float far = exp(-d * d / 2600.0);
    vec3 c = uColor * (0.25 + 0.6 * pool) * far + uGlow * (pool * (0.06 + uInner * 0.22) + puddle * 0.2);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
}`;

export const champagneDef: VizModeDef = {
    id: 'champagne',
    name: 'CHAMPAGNE',
    create: () => new ChampagneMode(),
};
