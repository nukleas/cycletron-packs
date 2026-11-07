/**
 * BALL DROP: a mirror ball on the mast of a tower, counting down every
 * eight-bar phrase. The ball slides down the mast across the phrase and the
 * tower's display counts the beats left (32 to 01); on the downbeat of the
 * next phrase it lands, the display reads 00, the ball goes white and throws
 * a shower of sparks, then it climbs back up over the first beat.
 *
 * The ball's facets are LED panels: a pitched note lights the ring of facets
 * at its pitch's latitude in its track's colour, decaying. Kicks flash the
 * ball and the searchlights, snares and hats twinkle random facets, crashes
 * flood it. The billboards on the tower each follow one track and light
 * with its notes.
 */

import type {VizMode, VizModeDef, VizServices} from '@cycletron/viz-sdk';
import {type FieldHap, type FieldTeam, HapField, hash32, rand01, TAU} from '@cycletron/viz-sdk';
import {drawScene, setRgb} from '@naderlabs/kit/gl';
import {
    AdditiveBlending, BoxGeometry, BufferAttribute, Color, CylinderGeometry, DirectionalLight, DoubleSide, Group,
    HemisphereLight, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial,
    PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial,
} from 'three';
import {Glow} from '../../lib/glow.js';
import {Ink} from '../../lib/ink.js';
import {pitchPos, roleOf, secondsPerCycle} from '../../lib/roles.js';
import {Skyline} from '../../lib/skyline.js';
import {Sky} from '../../lib/sky.js';
import {DIGIT_SEGMENTS, segmentMatrix} from './digits.js';

const LOOKAHEAD = 1;
const MAX_HAPS = 160;
const MAX_PER_TRACK = 48;
const IDLE_RATE = 0.35;
const FOV = 50;
/** Bars in one countdown. */
const PHRASE = 8;
const BANDS = 16;
const TOWER_W = 18;
const TOWER_H = 64;
const TOWER_D = 14;
const MAST_TOP = 102;
const MAST_LOW = 77;
const BALL_R = 7;
const BOARDS = 6;
const SPARKS = 160;
const SPARK_LIFE = 2.6;
const BEAMS = 4;

interface Team extends FieldTeam {}

interface Note extends FieldHap<Team> {
    band: number;
    pitched: boolean;
}

class BallDropMode implements VizMode {
    private readonly scene = new Scene();
    private readonly camera = new PerspectiveCamera(FOV, 16 / 9, 0.5, 1400);
    private readonly ink = new Ink();
    private readonly sky = new Sky(700);
    private readonly city = new Skyline(44, 120, -22, 40, 0.85, 4242);
    private readonly glow = new Glow(SPARKS * 3 + 64);
    private readonly field = new HapField<Team, Note>({
        lookahead: LOOKAHEAD,
        maxHaps: MAX_HAPS,
        maxPerTrack: MAX_PER_TRACK,
        idleRate: IDLE_RATE,
        team: (base) => base,
        hap: (base) => makeNote(base),
        keep: (h, cycle) => h.begin + 0.5 >= cycle,
    });
    private readonly ball: Mesh;
    private readonly ballMat: ShaderMaterial;
    private readonly bands: Color[] = [];
    private readonly bandLevel = new Float32Array(BANDS);
    private readonly bandColor: Color[] = [];
    private readonly digits: InstancedMesh;
    private readonly boards: ShaderMaterial[] = [];
    private readonly boardLevel = new Float32Array(BOARDS);
    private readonly boardColor: Color[] = [];
    private readonly beams: Mesh[] = [];
    private readonly beamMat: ShaderMaterial;
    private readonly towerMat = new MeshLambertMaterial();
    private readonly mastMat = new MeshLambertMaterial();
    private readonly hemi = new HemisphereLight();
    private readonly key = new DirectionalLight();
    private readonly tmp = new Color();
    private readonly white = new Color(1, 1, 1);
    private readonly segOn = new Color();
    private readonly segOff = new Color();
    private flash = 0;
    private twinkle = 0;
    private beam = 0;
    private tick = 0;
    private spc = 2;

    constructor() {
        for (let i = 0; i < BANDS; i++) {
            this.bands.push(new Color());
            this.bandColor.push(new Color());
        }
        for (let i = 0; i < BOARDS; i++) this.boardColor.push(new Color());

        this.ballMat = new ShaderMaterial({
            uniforms: {
                uBands: {value: this.bands},
                uBase: {value: new Color()},
                uKey1: {value: new Color()},
                uKey2: {value: new Color()},
                uFlash: {value: 0},
                uTwinkle: {value: 0},
                uTick: {value: 0},
            },
            vertexShader: BALL_VERT,
            fragmentShader: BALL_FRAG,
        });
        this.ball = new Mesh(facetedBall(), this.ballMat);
        this.ball.scale.setScalar(BALL_R);

        const tower = new Mesh(new BoxGeometry(TOWER_W, TOWER_H, TOWER_D), this.towerMat);
        tower.position.y = TOWER_H / 2;
        const crown = new Mesh(new BoxGeometry(TOWER_W * 0.7, 4, TOWER_D * 0.7), this.towerMat);
        crown.position.y = TOWER_H + 2;
        const mast = new Mesh(new CylinderGeometry(0.6, 0.9, MAST_TOP - TOWER_H + 4, 10), this.mastMat);
        mast.position.y = (MAST_TOP + TOWER_H) / 2;

        const boards: Mesh[] = [];
        for (let i = 0; i < BOARDS; i++) {
            const mat = new ShaderMaterial({
                uniforms: {uColor: {value: this.boardColor[i]}, uLevel: {value: 0}, uSeed: {value: i * 1.37}},
                vertexShader: BOARD_VERT,
                fragmentShader: BOARD_FRAG,
            });
            const w = i % 2 === 0 ? TOWER_W - 2 : TOWER_D - 2;
            const board = new Mesh(new PlaneGeometry(w, 7 + (i % 3) * 2), mat);
            const front = i % 2 === 0;
            const y = 8 + i * 7.4;
            if (front) board.position.set(0, y, TOWER_D / 2 + 0.05);
            else {
                board.position.set(TOWER_W / 2 + 0.05, y, 0);
                board.rotation.y = Math.PI / 2;
            }
            this.boards.push(mat);
            boards.push(board);
        }

        this.digits = new InstancedMesh(new BoxGeometry(1, 1, 0.4), new MeshBasicMaterial(), DIGIT_SEGMENTS * 2);
        const m = new Matrix4();
        for (let d = 0; d < 2; d++) {
            for (let k = 0; k < DIGIT_SEGMENTS; k++) {
                segmentMatrix(m, k, (d - 0.5) * 7.4, TOWER_H - 8, TOWER_D / 2 + 0.3);
                this.digits.setMatrixAt(d * DIGIT_SEGMENTS + k, m);
                this.digits.setColorAt(d * DIGIT_SEGMENTS + k, this.segOff);
            }
        }

        this.beamMat = new ShaderMaterial({
            uniforms: {uColor: {value: new Color()}, uLevel: {value: 0.4}},
            vertexShader: BEAM_VERT,
            fragmentShader: BEAM_FRAG,
            blending: AdditiveBlending,
            transparent: true,
            depthWrite: false,
            side: DoubleSide,
        });
        const beamGeo = new CylinderGeometry(9, 0.8, 160, 20, 1, true);
        beamGeo.translate(0, 80, 0);
        for (let i = 0; i < BEAMS; i++) {
            const beam = new Mesh(beamGeo, this.beamMat);
            beam.position.set((i - 1.5) * 34, 18 + (i % 2) * 10, -30);
            beam.renderOrder = 4;
            this.beams.push(beam);
        }

        this.key.position.set(40, 80, 90);
        const rig = new Group();
        rig.add(tower, crown, mast, this.ball, this.digits, ...boards);
        this.glow.group.renderOrder = 5;
        this.scene.add(this.sky.mesh, this.sky.stars.group, this.city.group, rig, ...this.beams, this.glow.group, this.hemi, this.key);
    }

    layout(s: VizServices): void {
        const ink = this.ink;
        ink.bake(s.theme);
        this.sky.bake(ink);
        this.city.bake(ink);
        this.scene.background = ink.bg;
        this.towerMat.color.copy(ink.bg).lerp(ink.violet, 0.5);
        this.mastMat.color.copy(ink.active).multiplyScalar(0.5);
        this.hemi.color.copy(ink.violet).lerp(this.white, 0.3);
        this.hemi.groundColor.copy(ink.bg);
        this.hemi.intensity = 1.4;
        this.key.color.copy(ink.neon);
        this.key.intensity = 0.8;
        const u = this.ballMat.uniforms;
        const base: Color = u.uBase.value;
        base.copy(ink.active).lerp(ink.violet, 0.35);
        const key1: Color = u.uKey1.value;
        key1.copy(ink.neon);
        const key2: Color = u.uKey2.value;
        key2.copy(ink.second);
        const beam: Color = this.beamMat.uniforms.uColor.value;
        beam.copy(ink.second).lerp(ink.active, 0.3);
        this.segOn.copy(ink.neon).multiplyScalar(1.3);
        this.segOff.copy(ink.bg).lerp(ink.neon, 0.012);
        this.camera.aspect = s.width / Math.max(1, s.height);
        this.camera.updateProjectionMatrix();
        this.glow.view(s.height * s.dpr, FOV);
        this.field.invalidate();
    }

    update(dt: number, s: VizServices): void {
        const field = this.field;
        field.update(dt, s);
        this.spc = secondsPerCycle(s.bpm);
        if (field.restarted) {
            this.bandLevel.fill(0);
            this.boardLevel.fill(0);
            this.flash = 0;
            this.twinkle = 0;
            this.beam = 0;
        }
        for (const h of field.haps) {
            if (!field.crossed(h)) continue;
            h.done = true;
            h.team.activity = 1;
            const board = h.team.slot % BOARDS;
            this.boardLevel[board] = 1;
            setRgb(this.boardColor[board], h.team.rgb);
            if (h.pitched) {
                this.bandLevel[h.band] = 1;
                setRgb(this.bandColor[h.band], h.team.rgb);
                continue;
            }
            switch (roleOf(h.team.name, h.note)) {
                case 'kick':
                    this.flash = Math.max(this.flash, 0.45);
                    this.beam = 1;
                    break;
                case 'snare':
                    this.twinkle = 1;
                    break;
                case 'crash':
                    this.flash = 1;
                    this.bandLevel.fill(0.8);
                    break;
                default:
                    this.twinkle = Math.max(this.twinkle, 0.5);
                    break;
            }
        }
        // The landing: the ball goes white on the phrase's downbeat.
        const phrase = Math.floor(field.cycle / PHRASE);
        const landed = Math.floor(field.prevCycle / PHRASE) !== phrase && !field.restarted;
        if (landed) {
            this.flash = 1.4;
            this.beam = 1.4;
        }
        const k = Math.exp(-dt * 3.2);
        for (let i = 0; i < BANDS; i++) this.bandLevel[i] *= k;
        const kb = Math.exp(-dt * 2.4);
        for (let i = 0; i < BOARDS; i++) this.boardLevel[i] *= kb;
        this.flash *= Math.exp(-dt * 3);
        this.twinkle *= Math.exp(-dt * 5);
        this.beam *= Math.exp(-dt * 2);
        this.tick = Math.floor(field.cycle * 16);
    }

    render(ctx: CanvasRenderingContext2D, s: VizServices): void {
        const cycle = this.field.cycle;
        const inPhrase = cycle - Math.floor(cycle / PHRASE) * PHRASE;
        const beatsLeft = PHRASE * 4 - Math.floor(inPhrase * 4);
        // Back up the mast over the first beat, then down across the phrase.
        const climb = Math.min(1, inPhrase * 4);
        const fall = (inPhrase - 0.25) / (PHRASE - 0.25);
        const ballY = inPhrase < 0.25 ? MAST_LOW + (MAST_TOP - MAST_LOW) * easeInOut(climb) : MAST_TOP - (MAST_TOP - MAST_LOW) * Math.max(0, fall);
        this.ball.position.set(0, ballY, 0);
        this.ball.rotation.y = Math.floor(cycle * 4) * 0.4;

        const cam = this.camera;
        cam.position.set(0, 34, 96);
        cam.lookAt(0, 62 + (ballY - 90) * 0.3, 0);

        const u = this.ballMat.uniforms;
        u.uFlash.value = this.flash;
        u.uTwinkle.value = this.twinkle;
        u.uTick.value = this.tick;
        for (let i = 0; i < BANDS; i++) this.bands[i].copy(this.bandColor[i]).multiplyScalar(this.bandLevel[i] * 1.6);
        for (let i = 0; i < BOARDS; i++) this.boards[i].uniforms.uLevel.value = 0.18 + this.boardLevel[i];

        // The display: beats left, or 00 for the first beat after landing.
        const shown = inPhrase < 0.25 && cycle >= PHRASE ? 0 : beatsLeft;
        this.showDigits(Math.floor(shown / 10), shown % 10, inPhrase < 0.25 ? 0.5 + 0.5 * Math.cos(inPhrase * 4 * TAU * 2) : 1);

        this.beamMat.uniforms.uLevel.value = 0.08 + this.beam * 0.22;
        for (let i = 0; i < BEAMS; i++) {
            const b = this.beams[i];
            const a = Math.floor(cycle * 4) * (0.6 + i * 0.13) + i * 1.9;
            b.rotation.set(Math.sin(a) * 0.38, 0, Math.cos(a * 1.3) * 0.4 + (i - 1.5) * 0.12);
        }

        this.city.uniforms.uFlash.value.copy(this.ink.neon).multiplyScalar(this.flash * 0.18);
        this.city.uniforms.uLitFrac.value = 0.26;
        this.city.uniforms.uTick.value = Math.floor(cycle * 4);
        this.sky.glow.copy(this.ink.violet).multiplyScalar(0.35 + this.beam * 0.25);

        this.drawSparks(cycle);
        drawScene(ctx, this.scene, cam, s.width, s.height, s.dpr);
    }

    private showDigits(tens: number, ones: number, level: number): void {
        for (let d = 0; d < 2; d++) {
            const mask = SEGMENTS_OF[d === 0 ? tens : ones];
            for (let k = 0; k < DIGIT_SEGMENTS; k++) {
                const on = ((mask >> k) & 1) === 1;
                this.tmp.copy(on ? this.segOn : this.segOff);
                if (on) this.tmp.multiplyScalar(level);
                this.digits.setColorAt(d * DIGIT_SEGMENTS + k, this.tmp);
            }
        }
        if (this.digits.instanceColor) this.digits.instanceColor.needsUpdate = true;
    }

    /** The shower from the landing, and the glints that ride the ball down. */
    private drawSparks(cycle: number): void {
        const g = this.glow;
        g.begin();
        const phrase = Math.floor(cycle / PHRASE);
        const t = (cycle - phrase * PHRASE) * this.spc;
        if (phrase > 0 && t < SPARK_LIFE) {
            const ink = this.ink;
            for (let i = 0; i < SPARKS; i++) {
                const seed = hash32(phrase, i + 1);
                const a = rand01(seed) * TAU;
                const up = rand01(hash32(seed, 2));
                const v = 18 + 26 * rand01(hash32(seed, 3));
                const e = 1 - Math.exp(-1.6 * t);
                const reach = (v * e) / 1.6;
                const fall = (9 / 1.6) * (t - e / 1.6);
                const life = SPARK_LIFE * (0.6 + 0.4 * rand01(hash32(seed, 4)));
                if (t > life) continue;
                const k = Math.pow(1 - t / life, 1.3) * 1.1;
                const c = ink.accent(seed % 4);
                const dx = Math.cos(a) * Math.sqrt(1 - up * up);
                const dz = Math.sin(a) * Math.sqrt(1 - up * up);
                for (let j = 0; j < 3; j++) {
                    const s = Math.max(0, 1 - j * 0.08);
                    g.add(dx * reach * s, MAST_LOW + up * reach * s - fall * s, dz * reach * s, c, k * (j === 0 ? 1 : 0.4), j === 0 ? 1.4 : 1);
                }
            }
        }
        // A halo on the ball itself.
        g.add(this.ball.position.x, this.ball.position.y, this.ball.position.z + 1, this.ink.neon, 0.08 + this.flash * 0.5, BALL_R * 4.5);
        g.commit();
    }
}

/** Seven-segment masks for 0..9, bit k = segment k (a b c d e f g). */
const SEGMENTS_OF = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];

function easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
}

function makeNote(base: FieldHap<Team>): Note {
    const pitched = Number.isFinite(base.note);
    return {
        ...base,
        pitched,
        band: pitched ? Math.min(BANDS - 1, Math.floor(pitchPos(base.note) * BANDS)) : 0,
    };
}

/** An icosphere whose triangles carry their facet direction, a per-facet hash and barycentrics for the seams. */
function facetedBall(): IcosahedronGeometry {
    const geo = new IcosahedronGeometry(1, 3);
    const pos = geo.getAttribute('position');
    const n = pos.count;
    const facet = new Float32Array(n * 3);
    const bary = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let f = 0; f < n / 3; f++) {
        let x = 0;
        let y = 0;
        let z = 0;
        for (let v = 0; v < 3; v++) {
            x += pos.getX(f * 3 + v);
            y += pos.getY(f * 3 + v);
            z += pos.getZ(f * 3 + v);
        }
        const len = Math.hypot(x, y, z);
        const r = rand01(hash32(f, 17));
        for (let v = 0; v < 3; v++) {
            const i = f * 3 + v;
            facet[i * 3] = x / len;
            facet[i * 3 + 1] = y / len;
            facet[i * 3 + 2] = z / len;
            bary[i * 3 + v] = 1;
            seed[i] = r;
        }
    }
    geo.setAttribute('aFacet', new BufferAttribute(facet, 3));
    geo.setAttribute('aBary', new BufferAttribute(bary, 3));
    geo.setAttribute('aSeed', new BufferAttribute(seed, 1));
    return geo;
}

const BALL_VERT = /* glsl */ `
attribute vec3 aFacet;
attribute vec3 aBary;
attribute float aSeed;
varying vec3 vFacet;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vBary;
varying float vSeed;
void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vFacet = aFacet;
    vNormal = normalize(mat3(modelMatrix) * aFacet);
    vView = cameraPosition - w.xyz;
    vBary = aBary;
    vSeed = aSeed;
    gl_Position = projectionMatrix * viewMatrix * w;
}`;

const BALL_FRAG = /* glsl */ `
uniform vec3 uBands[${BANDS}];
uniform vec3 uBase;
uniform vec3 uKey1;
uniform vec3 uKey2;
uniform float uFlash;
uniform float uTwinkle;
uniform float uTick;
varying vec3 vFacet;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vBary;
varying float vSeed;
void main() {
    int b = int(clamp((vFacet.y * 0.5 + 0.5) * ${BANDS}.0, 0.0, ${BANDS - 1}.0));
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vView);
    vec3 r = reflect(-v, n);
    float g1 = pow(max(dot(r, normalize(vec3(0.6, 0.55, 0.6))), 0.0), 18.0);
    float g2 = pow(max(dot(r, normalize(vec3(-0.7, 0.25, 0.55))), 0.0), 18.0);
    float lambert = 0.35 + 0.65 * max(dot(n, normalize(vec3(0.2, 0.5, 0.85))), 0.0);
    vec3 c = uBase * (0.2 + 0.8 * vSeed) * lambert * 0.38;
    c += uBands[b] * (0.5 + 0.7 * vSeed);
    c += uKey1 * g1 * 1.4 + uKey2 * g2 * 1.2;
    float tw = step(1.0 - uTwinkle * 0.22, fract(sin(vSeed * 91.7 + uTick * 13.1) * 4375.85));
    c += vec3(tw) + vec3(uFlash);
    float edge = min(min(vBary.x, vBary.y), vBary.z);
    c *= 0.25 + 0.75 * smoothstep(0.0, 0.07, edge);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
}`;

const BOARD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const BOARD_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uLevel;
uniform float uSeed;
varying vec2 vUv;
void main() {
    vec2 g = vUv * vec2(48.0, 20.0);
    vec2 f = fract(g) - 0.5;
    float dotMask = smoothstep(0.42, 0.22, length(f));
    float sweep = 0.55 + 0.45 * sin(floor(g.x) * 0.35 + uSeed * 4.0 + floor(g.y) * 0.8);
    vec3 c = uColor * uLevel * sweep * dotMask + uColor * 0.04;
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
}`;

const BEAM_VERT = /* glsl */ `
varying float vH;
varying vec3 vN;
varying vec3 vView;
void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vH = position.y / 160.0;
    vN = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - w.xyz);
    gl_Position = projectionMatrix * viewMatrix * w;
}`;

const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uLevel;
varying float vH;
varying vec3 vN;
varying vec3 vView;
void main() {
    float face = abs(dot(normalize(vN), normalize(vView)));
    float a = pow(1.0 - vH, 1.6) * face * uLevel;
    gl_FragColor = vec4(uColor * a, 1.0);
    #include <colorspace_fragment>
}`;

export const ballDropDef: VizModeDef = {
    id: 'ball-drop',
    name: 'BALL DROP',
    create: () => new BallDropMode(),
};
