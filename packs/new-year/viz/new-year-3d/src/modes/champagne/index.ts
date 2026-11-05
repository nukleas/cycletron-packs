/**
 * CHAMPAGNE — a tower of coupes, fourteen glasses on three tiers, and a
 * bottle above it. Every downbeat pours: the bottle tips for the first beat
 * of the bar and the top glass fills; a full glass spills into the glasses
 * under it, so the tower fills from the top over the first bars and then
 * cascades steadily onto the table.
 *
 * Pitched notes clink a glass (low notes on the bottom tier, high on top):
 * its rim flashes in the track's colour and its surface sloshes. Hats and
 * the highs send up bubbles in the filled glasses, kicks light the
 * champagne from inside, snares and crashes splash the top glass.
 */

import type {VizMode, VizModeDef, VizServices} from '@cycletron/viz-sdk';
import {type FieldHap, type FieldTeam, HapField, hash32, rand01, TAU} from '@cycletron/viz-sdk';
import {drawScene, setRgb} from '@naderlabs/kit/gl';
import {
    AdditiveBlending, CircleGeometry, Color, CylinderGeometry, DoubleSide, LatheGeometry, Mesh, NormalBlending,
    PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2,
} from 'three';
import {Glow} from '../../lib/glow.js';
import {Ink} from '../../lib/ink.js';
import {pitchPos, roleOf, secondsPerCycle} from '../../lib/roles.js';

const LOOKAHEAD = 1;
const MAX_HAPS = 160;
const MAX_PER_TRACK = 48;
const IDLE_RATE = 0.35;
const FOV = 42;
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
const MAX_SPLASH = 48;
const BOKEH = 40;

interface Team extends FieldTeam {}

interface Glass {
    x: number;
    y: number;
    z: number;
    tier: number;
    /** Glasses this one spills into. */
    below: number[];
    level: number;
    spill: number;
    clink: number;
    slosh: number;
    rim: Color;
    liquid: ShaderMaterial;
    surface: Mesh;
}

interface Bubble {
    t0: number;
    glass: number;
    seed: number;
}

class ChampagneMode implements VizMode {
    private readonly scene = new Scene();
    private readonly camera = new PerspectiveCamera(FOV, 16 / 9, 0.3, 500);
    private readonly ink = new Ink();
    private readonly field = new HapField<Team, FieldHap<Team>>({
        lookahead: LOOKAHEAD,
        maxHaps: MAX_HAPS,
        maxPerTrack: MAX_PER_TRACK,
        idleRate: IDLE_RATE,
        team: (base) => base,
        hap: (base) => base,
        keep: (h, cycle) => h.begin + 0.5 >= cycle,
    });
    private readonly glasses: Glass[] = [];
    private readonly glassMat: ShaderMaterial;
    private readonly liquidColor = new Color();
    private readonly liquidDeep = new Color();
    private readonly surfaceMat: ShaderMaterial;
    private readonly bottle: Mesh;
    private readonly bottleMat: ShaderMaterial;
    private readonly stream: Mesh;
    private readonly streamMat: ShaderMaterial;
    private readonly tableMat: ShaderMaterial;
    private readonly glow = new Glow(MAX_BUBBLES + 900);
    private readonly bubbles: Bubble[] = [];
    private nextBubble = 0;
    private readonly splash: Bubble[] = [];
    private nextSplash = 0;
    private time = 0;
    private spc = 2;
    private inner = 0;
    private fizz = 0;
    private puddle = 0;
    private readonly tmp = new Color();
    private readonly white = new Color(1, 1, 1);

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
                        uniforms: {uColor: {value: this.liquidColor}, uDeep: {value: this.liquidDeep}, uLevel: {value: 0}, uInner: {value: 0}},
                        vertexShader: LIQUID_VERT,
                        fragmentShader: LIQUID_FRAG,
                        transparent: true,
                        side: DoubleSide,
                    });
                    const surface = new Mesh(discGeo, this.surfaceMat);
                    this.glasses.push({x, y: tier * RIM, z, tier, below: [], level: 0, spill: 0, clink: 0, slosh: 0,
                        rim: new Color(), liquid, surface});
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
        this.bottle = new Mesh(new LatheGeometry(bottleProfile(), 32), this.bottleMat);
        this.streamMat = new ShaderMaterial({
            uniforms: {uColor: {value: this.liquidColor}, uFlow: {value: 0}, uTime: {value: 0}},
            vertexShader: STREAM_VERT,
            fragmentShader: STREAM_FRAG,
            transparent: true,
            depthWrite: false,
            blending: AdditiveBlending,
        });
        const streamGeo = new CylinderGeometry(0.22, 0.16, 1, 10, 8, true);
        streamGeo.translate(0, -0.5, 0);
        this.stream = new Mesh(streamGeo, this.streamMat);
        this.stream.renderOrder = 4;

        this.tableMat = new ShaderMaterial({
            uniforms: {uColor: {value: new Color()}, uGlow: {value: new Color()}, uPuddle: {value: 0}, uInner: {value: 0}},
            vertexShader: TABLE_VERT,
            fragmentShader: TABLE_FRAG,
        });
        const table = new Mesh(new PlaneGeometry(160, 100), this.tableMat);
        table.rotation.x = -Math.PI / 2;
        this.glow.group.renderOrder = 5;
        this.scene.add(table, this.bottle, this.stream, this.glow.group);

        for (let i = 0; i < MAX_BUBBLES; i++) this.bubbles.push({t0: -1e9, glass: 0, seed: 0});
        for (let i = 0; i < MAX_SPLASH; i++) this.splash.push({t0: -1e9, glass: 0, seed: 0});
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
        table.copy(ink.bg).lerp(ink.violet, 0.3);
        const glow: Color = this.tableMat.uniforms.uGlow.value;
        glow.copy(this.liquidColor);
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
            for (const g of this.glasses) {
                g.level = 0;
                g.spill = 0;
                g.clink = 0;
                g.slosh = 0;
            }
            for (const b of this.bubbles) b.t0 = -1e9;
            for (const b of this.splash) b.t0 = -1e9;
            this.inner = 0;
            this.puddle = 0;
        }
        this.time = field.cycle * this.spc;
        for (const h of field.haps) {
            if (!field.crossed(h)) continue;
            h.done = true;
            h.team.activity = 1;
            this.hit(h);
        }
        this.flow(dt, field.cycle);
        // The fizz: the highs keep a steady stream of bubbles going.
        this.fizz += dt * (2 + s.high * 40);
        while (this.fizz >= 1) {
            this.fizz -= 1;
            this.bubble(hash32(Math.floor(this.time * 997), this.nextBubble));
        }
        const k = Math.exp(-dt * 3);
        for (const g of this.glasses) {
            g.clink *= k;
            g.slosh *= Math.exp(-dt * 1.8);
        }
        this.inner *= Math.exp(-dt * 5);
        this.puddle *= Math.exp(-dt * 0.4);
    }

    private hit(h: FieldHap<Team>): void {
        if (Number.isFinite(h.note)) {
            const g = this.glasses[glassForPitch(pitchPos(h.note), h.seed)];
            g.clink = 1;
            g.slosh = Math.min(1.5, g.slosh + 0.6);
            setRgb(g.rim, h.team.rgb);
            return;
        }
        switch (roleOf(h.team.name, h.note)) {
            case 'kick':
                this.inner = 1;
                break;
            case 'hat':
            case 'perc':
                for (let n = 0; n < 4; n++) this.bubble(hash32(h.seed, n + 1));
                break;
            case 'snare':
            case 'crash':
                this.splashTop(h.seed, roleOf(h.team.name, h.note) === 'crash' ? 18 : 8);
                break;
            default:
                break;
        }
    }

    /** The pour, then each tier's overflow into the next, top down. */
    private flow(dt: number, cycle: number): void {
        const inBar = cycle - Math.floor(cycle);
        const top = this.glasses[this.glasses.length - 1];
        const rate = POUR_VOLUME / (POUR * this.spc);
        const pouring = inBar < POUR;
        const order = this.glasses;
        for (const g of order) g.spill = 0;
        if (pouring) top.level += rate * dt;
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

    private splashTop(seed: number, count: number): void {
        for (let n = 0; n < count; n++) {
            const b = this.splash[this.nextSplash];
            this.nextSplash = (this.nextSplash + 1) % MAX_SPLASH;
            b.t0 = this.time;
            b.glass = this.glasses.length - 1;
            b.seed = hash32(seed, n + 1);
        }
    }

    render(ctx: CanvasRenderingContext2D, s: VizServices): void {
        const cycle = this.field.cycle;
        const cam = this.camera;
        const orbit = Math.sin(cycle * 0.05) * 0.5 + 0.35;
        cam.position.set(Math.sin(orbit) * 44, 13 + Math.sin(cycle * 0.04) * 1.5, Math.cos(orbit) * 44);
        cam.lookAt(2.5, 11.5, 0);

        for (const g of this.glasses) {
            const level = g.level;
            const surfaceY = STEM + DEPTH * level;
            g.liquid.uniforms.uLevel.value = surfaceY;
            g.liquid.uniforms.uInner.value = this.inner * 0.6 + g.clink * 0.3;
            g.surface.visible = level > 0.02;
            const r = RADIUS * Math.sqrt(level) * 0.98;
            g.surface.position.set(g.x, g.y + surfaceY, g.z);
            g.surface.scale.set(r, 1, r);
            const wob = g.slosh * 0.12;
            g.surface.rotation.set(Math.sin(this.time * 9 + g.x) * wob, 0, Math.cos(this.time * 8 + g.z) * wob);
        }
        this.surfaceMat.uniforms.uInner.value = this.inner;
        this.tableMat.uniforms.uPuddle.value = this.puddle;
        this.tableMat.uniforms.uInner.value = this.inner;
        this.placeBottle(cycle);
        this.drawGlints();
        drawScene(ctx, this.scene, cam, s.width, s.height, s.dpr);
    }

    /** The bottle tips in for the pour and back out, the stream falling from its mouth. */
    private placeBottle(cycle: number): void {
        const inBar = cycle - Math.floor(cycle);
        const top = this.glasses[this.glasses.length - 1];
        const pour = pourCurve(inBar);
        const tilt = 0.85 + pour * 0.75;
        const bx = top.x + 10.9;
        const by = top.y + RIM + 3.3;
        this.bottle.position.set(bx, by, top.z);
        this.bottle.rotation.set(0, 0, tilt);
        // The mouth is the top of the neck, 9.4 up the bottle's axis.
        const mx = bx - Math.sin(tilt) * 9.4;
        const my = by + Math.cos(tilt) * 9.4;
        const flow = pour > 0.6 ? (pour - 0.6) / 0.4 : 0;
        this.stream.visible = flow > 0.01;
        const targetY = top.y + STEM + DEPTH * Math.max(0.2, top.level);
        this.stream.position.set(mx, my, top.z);
        const dx = top.x + 0.3 - mx;
        const dy = my - targetY;
        this.stream.scale.set(flow, Math.max(0.01, Math.hypot(dx, dy)), flow);
        this.stream.rotation.set(0, 0, Math.atan2(dx, dy));
        this.streamMat.uniforms.uFlow.value = flow;
        this.streamMat.uniforms.uTime.value = this.time;
    }

    private drawGlints(): void {
        const gl = this.glow;
        const ink = this.ink;
        gl.begin();
        // Party lights out of focus far behind the table, brighter on the kicks.
        for (let i = 0; i < BOKEH; i++) {
            const a = rand01(hash32(i, 41)) * TAU;
            const d = 70 + rand01(hash32(i, 42)) * 30;
            gl.add(Math.cos(a) * d, 6 + rand01(hash32(i, 43)) * 34, Math.sin(a) * d, ink.accent(i), 0.1 + this.inner * 0.08, 16);
        }
        for (const g of this.glasses) {
            // A glint on the rim; a clink flashes it in the note's colour.
            const c = g.clink > 0.05 ? this.tmp.copy(ink.active).lerp(g.rim, Math.min(1, g.clink * 1.4)) : ink.active;
            gl.add(g.x - RADIUS * 0.55, g.y + RIM, g.z + RADIUS * 0.8, c, 0.18 + g.clink * 1.2, 0.9 + g.clink * 2.2);
            if (g.spill > 0.01) this.drawSpill(g);
        }
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
            gl.add(g.x + Math.cos(a) * rad + Math.sin(t * 9 + a) * 0.06, g.y + y, g.z + Math.sin(a) * rad, this.white, 0.45, 0.32);
        }
        for (const b of this.splash) {
            const t = this.time - b.t0;
            if (t < 0 || t > 1.2) continue;
            const g = this.glasses[b.glass];
            const a = rand01(hash32(b.seed, 1)) * TAU;
            const v = 3 + rand01(hash32(b.seed, 2)) * 5;
            const up = 5 + rand01(hash32(b.seed, 3)) * 6;
            gl.add(g.x + Math.cos(a) * (RADIUS * 0.5 + v * t), g.y + RIM + up * t - 9 * t * t, g.z + Math.sin(a) * (RADIUS * 0.5 + v * t),
                this.liquidColor, (1 - t / 1.2) * 0.9, 0.5);
        }
        gl.commit();
    }

    /** Droplets sheeting over the rim toward each glass below, or to the table. */
    private drawSpill(g: Glass): void {
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
                const u = (this.time * 1.8 + j / 7 + n * 0.13) % 1;
                gl.add(ex + (dx / len) * u * 0.6, g.y + RIM - drop * u * u, ez + (dz / len) * u * 0.6, this.liquidColor, k * 0.5, 0.45);
            }
        }
    }
}

/** 0 → 1 → 0 over the bar: tip in, hold while pouring, tip back. */
function pourCurve(inBar: number): number {
    if (inBar < POUR) return Math.min(1, inBar / 0.06);
    const back = (inBar - POUR) / 0.12;
    return back >= 1 ? 0 : 1 - back;
}

/** A glass for a pitch: low notes on the bottom tier, high on top; the seed picks among a tier's glasses. */
function glassForPitch(p: number, seed: number): number {
    if (p > 0.72) return 13;
    if (p > 0.45) return 9 + (seed % 4);
    return seed % 9;
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
