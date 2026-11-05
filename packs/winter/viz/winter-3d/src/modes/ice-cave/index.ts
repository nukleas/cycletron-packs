/**
 * ICE CAVE — a band in an ice cavern, every voice with a player you can
 * watch, every hit on the frame its note sounds:
 *
 * - A yeti plays a two-octave marimba of crystals, low on the left, one
 *   crystal a semitone (pitch class over two octaves). Every pitched note
 *   lights its crystal in the track's colour on the onset, and a held note
 *   keeps it lit. The yeti's mallets play the mid and lead notes: the left
 *   one the lower octave, the right one the upper. A mallet is raised over
 *   its next crystal an eighth of a bar before the note and is on it on the
 *   onset.
 * - The kicks are the yeti's stomp: the foot lifts before the kick, comes
 *   down on it, and the icicles on the roof shake.
 * - The bass lights the two great crystal pillars at the sides.
 * - A penguin plays the snares on an ice-block drum with one flipper and
 *   the hats and other percussion on a rack of icicle chimes with the other.
 * - A drop of meltwater counts each four-bar phrase: it swells on the
 *   stalactite a step a beat through the last bar, falls through the last
 *   beat and splashes into the pool on the downbeat, lighting the cave.
 * - The camera cuts on every bar line: front, the yeti, the penguin, and
 *   wide for the last bar so the drop is seen.
 */

import type {VizMode, VizModeDef, VizServices} from '@cycletron/viz-sdk';
import {type FieldHap, type FieldTeam, HapField} from '@cycletron/viz-sdk';
import {clamp01, hash32, rand01, TAU} from '@cycletron/viz-sdk';
import {drawScene, setRgb} from '@naderlabs/kit/gl';
import {type Role} from '@naderlabs/kit/roles';
import {beatIndex, beatPhase, held, lastOnset, nextOnset, type Stance, stance, strike, windup} from '@naderlabs/kit/timing';
import {
    AdditiveBlending, AmbientLight, BackSide, BoxGeometry, BufferAttribute, type BufferGeometry, CircleGeometry,
    Color, ConeGeometry, Fog, HemisphereLight, InstancedMesh, LatheGeometry,
    Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, PointLight,
    RingGeometry, Scene, SphereGeometry, Vector2, Vector3,
} from 'three';
import {Ink} from '../../lib/ink.js';
import {winterRole} from '../../lib/roles.js';
import {Penguin, REACH, Yeti} from './figures.js';

const LOOKAHEAD = 2;
const MAX_HAPS = 600;
const MAX_PER_TRACK = 64;
const DRUM_CAP = 48;
const IDLE_RATE = 0.25;
const KEEP = 0.4;
const KEYS = 24;
const ARC = 2.9;
const YETI_Z = -3.6;
const PENGUIN = new Vector3(4.6, 0, -1.4);
const PILLARS = [new Vector3(-6.2, 0, -5.5), new Vector3(6.2, 0, -5.5)];
const DOME = 13;
const PHRASE = 4;
const DRIP = new Vector3(-2.6, 6.2, 1.6);
const ICICLES = 46;
const MALLET_HALF = 1 / 32;

interface Team extends FieldTeam {
    color: Color;
}

interface Note extends FieldHap<Team> {
    role: Role;
    crystal: number;
}

class IceCaveMode implements VizMode {
    private readonly ink = new Ink();
    private readonly scene = new Scene();
    private readonly camera = new PerspectiveCamera(50, 16 / 9, 0.1, 200);
    private readonly air = new Color();
    private readonly fog = new Fog(0x000000, 14, 40);
    private readonly field = new HapField<Team, Note>({
        lookahead: LOOKAHEAD,
        maxHaps: MAX_HAPS,
        maxPerTrack: MAX_PER_TRACK,
        idleRate: IDLE_RATE,
        team: (base) => ({...base, color: new Color()}),
        hap: (base) => ({...base, role: winterRole(base.team.name, base.note), crystal: keyOf(base.note)}),
        cap: (_team, note) => (Number.isFinite(note) ? Infinity : DRUM_CAP),
        keep: (h, cycle) => h.end + KEEP >= cycle,
    });

    private readonly domeMat = new MeshStandardMaterial({flatShading: true, side: BackSide, vertexColors: true, roughness: 0.9});
    private readonly dome: Mesh;
    private readonly floorMat = new MeshLambertMaterial();
    private readonly ledgeMat = new MeshStandardMaterial({flatShading: true, roughness: 0.6});
    private readonly keys: InstancedMesh;
    private readonly keyMat = new MeshStandardMaterial({flatShading: true, roughness: 0.3});
    private readonly shells: InstancedMesh;
    private readonly shellMat = new MeshBasicMaterial({blending: AdditiveBlending, transparent: true, depthWrite: false});
    private readonly keyPos: Vector3[] = [];
    private readonly keyTop: Vector3[] = [];
    private readonly keyH: number[] = [];
    private readonly keyGlow = new Float32Array(KEYS);
    private readonly keyColor: Color[] = [];
    private readonly pillars: Mesh[] = [];
    private readonly pillarMats: MeshStandardMaterial[] = [];
    private readonly icicles: InstancedMesh;
    private readonly icicleMat = new MeshStandardMaterial({flatShading: true, roughness: 0.25});
    private readonly icicleSpots: Vector3[] = [];

    private readonly furMat = new MeshLambertMaterial({flatShading: true});
    private readonly faceMat = new MeshLambertMaterial({flatShading: true});
    private readonly eyeMat = new MeshLambertMaterial();
    private readonly malletMat = new MeshLambertMaterial({flatShading: true});
    private readonly stickMat = new MeshLambertMaterial({flatShading: true});
    private readonly coatMat = new MeshLambertMaterial({flatShading: true});
    private readonly bellyMat = new MeshLambertMaterial({flatShading: true});
    private readonly beakMat = new MeshLambertMaterial({flatShading: true});
    private readonly drumMat = new MeshStandardMaterial({flatShading: true, roughness: 0.3});
    private readonly chimeMat = new MeshStandardMaterial({flatShading: true, roughness: 0.2});
    private readonly yeti: Yeti;
    private readonly penguin: Penguin;
    private readonly chimes: Mesh[] = [];

    private readonly drop: Mesh;
    private readonly dropMat = new MeshStandardMaterial({flatShading: true, roughness: 0.1});
    private readonly ripple: Mesh;
    private readonly rippleMat = new MeshBasicMaterial({blending: AdditiveBlending, transparent: true, depthWrite: false});

    private readonly ambient = new AmbientLight(0xffffff, 0.6);
    private readonly hemi = new HemisphereLight(0xffffff, 0x000000, 0.6);
    private readonly glow = new PointLight(0xffffff, 0, 0, 1.5);
    private readonly splash = new PointLight(0xffffff, 0, 0, 1.5);
    private readonly dummy = new Object3D();
    private readonly tint = new Color();
    private readonly aimAt = new Vector3();

    constructor() {
        const {scene} = this;
        scene.background = this.air;
        scene.fog = this.fog;
        this.dome = new Mesh(domeGeometry(), this.domeMat);
        this.dome.position.z = -2;
        const floor = new Mesh(new CircleGeometry(DOME + 1, 24).rotateX(-Math.PI / 2), this.floorMat);
        scene.add(this.dome, floor);


        const crystal = new LatheGeometry([new Vector2(0, 0), new Vector2(0.2, 0), new Vector2(0.22, 0.82), new Vector2(0, 1)], 6);
        this.keys = new InstancedMesh(crystal, this.keyMat, KEYS);
        this.shells = new InstancedMesh(crystal, this.shellMat, KEYS);
        this.keys.frustumCulled = false;
        this.shells.frustumCulled = false;
        this.shells.renderOrder = 2;
        for (let k = 0; k < KEYS; k++) {
            const a = -1.3 + 2.6 * (k / (KEYS - 1));
            const h = 2.5 - 1 * (k / (KEYS - 1));
            const p = new Vector3(Math.sin(a) * ARC, 0, YETI_Z + Math.cos(a) * ARC);
            this.keyPos.push(p);
            this.keyH.push(h);
            this.keyTop.push(new Vector3(p.x, p.y + h, p.z));
            this.keyColor.push(new Color());
            this.keys.setColorAt(k, this.tint.setRGB(1, 1, 1));
            this.shells.setColorAt(k, this.tint.setRGB(0, 0, 0));
        }
        scene.add(this.keys, this.shells);

        for (let i = 0; i < 2; i++) {
            const mat = new MeshStandardMaterial({flatShading: true, roughness: 0.3});
            const m = new Mesh(new LatheGeometry([new Vector2(0, 0), new Vector2(0.9, 0), new Vector2(1, 4.2), new Vector2(0, 6)], 6), mat);
            m.position.copy(PILLARS[i]);
            m.rotation.z = (i === 0 ? 1 : -1) * 0.12;
            this.pillars.push(m);
            this.pillarMats.push(mat);
            scene.add(m);
        }

        this.icicles = new InstancedMesh(new ConeGeometry(0.22, 1, 5).rotateX(Math.PI), this.icicleMat, ICICLES);
        this.icicles.frustumCulled = false;
        for (let i = 0; i < ICICLES; i++) {
            const r = (n: number) => rand01(hash32(i, 50 + n));
            const a = r(1) * TAU;
            const d = 2 + r(2) * 8;
            const x = Math.cos(a) * d;
            const z = -2 + Math.sin(a) * d * 0.8;
            const y = Math.sqrt(Math.max(0, DOME * DOME - x * x - (z + 2) * (z + 2))) * 0.82;
            this.icicleSpots.push(new Vector3(x, y, z));
        }
        scene.add(this.icicles);

        this.yeti = new Yeti(this.furMat, this.faceMat, this.eyeMat, this.malletMat, this.stickMat);
        this.yeti.root.position.set(0, 0, YETI_Z);
        scene.add(this.yeti.root);

        this.penguin = new Penguin(this.coatMat, this.bellyMat, this.beakMat, this.eyeMat);
        this.penguin.root.position.copy(PENGUIN);
        this.penguin.root.rotation.y = -0.6;
        const drum = new Mesh(new BoxGeometry(0.9, 0.9, 0.9), this.drumMat);
        drum.position.set(-1.35, 0.45, 0.25);
        const rack = new Mesh(new BoxGeometry(1.3, 0.1, 0.2), this.stickMat);
        rack.position.set(1.4, 2.5, 0.2);
        this.penguin.root.add(drum, rack);
        for (let i = 0; i < 5; i++) {
            const c = new Mesh(new ConeGeometry(0.08, 0.5 + i * 0.12, 5).rotateX(Math.PI).translate(0, -(0.25 + i * 0.06), 0), this.chimeMat);
            c.position.set(0.9 + i * 0.25, 2.45, 0.2);
            this.chimes.push(c);
            this.penguin.root.add(c);
        }
        scene.add(this.penguin.root);

        const stalactite = new Mesh(new ConeGeometry(0.35, 1.6, 6).rotateX(Math.PI), this.icicleMat);
        stalactite.position.set(DRIP.x, DRIP.y + 0.8, DRIP.z);
        this.drop = new Mesh(new SphereGeometry(0.22, 8, 6), this.dropMat);
        const pool = new Mesh(new CircleGeometry(1.2, 18).rotateX(-Math.PI / 2), this.ledgeMat);
        pool.position.set(DRIP.x, 0.02, DRIP.z);
        this.ripple = new Mesh(new RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2), this.rippleMat);
        this.ripple.position.set(DRIP.x, 0.04, DRIP.z);
        scene.add(stalactite, this.drop, pool, this.ripple);

        this.glow.position.set(0, 1.4, YETI_Z + 4);
        this.splash.position.set(DRIP.x, 1.2, DRIP.z);
        scene.add(this.ambient, this.hemi, this.glow, this.splash);
    }

    layout(s: VizServices): void {
        const {ink} = this;
        ink.bake(s.theme);
        this.air.copy(ink.bg).lerp(ink.deep, 0.3);
        this.fog.color.copy(this.air);
        paintDome(this.dome.geometry, ink);
        this.floorMat.color.copy(ink.snow).multiplyScalar(0.55);
        this.ledgeMat.color.copy(ink.deep).lerp(ink.ice, 0.25);
        this.keyMat.emissive.copy(ink.deep).multiplyScalar(0.3);
        this.icicleMat.color.copy(ink.frost).lerp(ink.ice, 0.3);
        this.icicleMat.emissive.copy(ink.deep).multiplyScalar(0.25);
        this.furMat.color.copy(ink.snow).lerp(ink.frost, 0.25);
        this.faceMat.color.copy(ink.deep).lerp(ink.frost, 0.3);
        this.eyeMat.color.copy(ink.bg);
        this.malletMat.color.copy(ink.rose);
        this.stickMat.color.copy(ink.warm).multiplyScalar(0.45);
        this.coatMat.color.copy(ink.bg).lerp(ink.deep, 0.5);
        this.bellyMat.color.copy(ink.snow);
        this.beakMat.color.copy(ink.warm);
        this.drumMat.color.copy(ink.ice).lerp(ink.snow, 0.4);
        this.chimeMat.color.copy(ink.frost);
        this.dropMat.color.copy(ink.ice);
        this.dropMat.emissive.copy(ink.ice).multiplyScalar(0.4);
        this.rippleMat.color.copy(ink.ice);
        this.ambient.color.copy(ink.deep).lerp(ink.ice, 0.35);
        this.hemi.color.copy(ink.frost);
        this.hemi.groundColor.copy(ink.deep).multiplyScalar(0.5);
        this.splash.color.copy(ink.ice);
        this.camera.aspect = s.width / Math.max(1, s.height);
        this.camera.updateProjectionMatrix();
        this.field.invalidate();
    }

    update(dt: number, s: VizServices): void {
        const field = this.field;
        field.update(dt, s);
        for (const t of field.teams) setRgb(t.color, t.rgb);
        const now = field.cycle;
        const haps = field.haps;
        const drums = field.locked ? haps : null;

        this.lightKeys(now);
        this.playMallets(now);

        const kick = drums ? strike(now, lastOnset(drums, now, isKick), 1 / 24) : 0;
        const kickNext = drums ? windup(now, nextOnset(drums, now, isKick)) : 0;
        const stompPose = stance(kick, kickNext);
        this.yeti.stomp(stompPose === 'ready' && kickNext > 0 ? 1 : 0);
        this.shakeIcicles(now, kick);

        const bass = this.bassLevel(now);
        for (const m of this.pillarMats) m.emissive.copy(this.ink.glow).multiplyScalar(0.08 + 0.9 * bass);

        const snare = drums ? this.voice(now, drums, isSnare) : 'rest';
        const hat = drums ? this.voice(now, drums, isChime) : 'rest';
        this.penguin.pose(snare, hat);
        const ring = drums ? strike(now, lastOnset(drums, now, isChime), 1 / 24) : 0;
        for (let i = 0; i < this.chimes.length; i++) this.chimes[i].rotation.z = ring * 0.35 * (i % 2 === 0 ? 1 : -1);

        this.countDrop(now);
        this.placeCamera(now);
    }

    render(ctx: CanvasRenderingContext2D, s: VizServices): void {
        drawScene(ctx, this.scene, this.camera, s.width, s.height, s.dpr);
    }

    private voice(now: number, haps: readonly Note[], pick: (h: Note) => boolean): Stance {
        return stance(strike(now, lastOnset(haps, now, pick)), windup(now, nextOnset(haps, now, pick)));
    }

    /** Each crystal: bright on the onset of a note at its pitch, lit while it is held. */
    private lightKeys(now: number): void {
        const {keyGlow, keyColor, ink, dummy, tint} = this;
        keyGlow.fill(0);
        for (const k of keyColor) k.copy(ink.ice);
        let peak = 0;
        for (const h of this.field.haps) {
            if (h.crystal < 0) continue;
            const hit = strike(now, h.begin, 1 / 24);
            const v = Math.max(hit, 0.45 * held(now, h.begin, h.end)) * clamp01(h.fade);
            if (v > keyGlow[h.crystal]) {
                keyGlow[h.crystal] = v;
                keyColor[h.crystal].copy(h.team.color);
            }
            peak = Math.max(peak, hit);
        }
        for (let k = 0; k < KEYS; k++) {
            const g = keyGlow[k];
            const p = this.keyPos[k];
            dummy.position.copy(p);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(1, this.keyH[k], 1);
            dummy.updateMatrix();
            this.keys.setMatrixAt(k, dummy.matrix);
            this.keys.setColorAt(k, tint.copy(ink.deep).lerp(keyColor[k], 0.35 + 0.65 * Math.min(1, g * 1.5)));
            dummy.scale.set(1.25, this.keyH[k] * 1.08, 1.25);
            dummy.updateMatrix();
            this.shells.setMatrixAt(k, dummy.matrix);
            this.shells.setColorAt(k, tint.copy(keyColor[k]).multiplyScalar(0.04 + 0.85 * g));
        }
        this.keys.instanceMatrix.needsUpdate = true;
        this.shells.instanceMatrix.needsUpdate = true;
        if (this.keys.instanceColor) this.keys.instanceColor.needsUpdate = true;
        if (this.shells.instanceColor) this.shells.instanceColor.needsUpdate = true;
        this.glow.intensity = 14 * peak;
        this.glow.color.copy(ink.ice);
    }

    /** The yeti's mallets: the left takes the lower octave, the right the upper. */
    private playMallets(now: number): void {
        const haps = this.field.haps;
        for (let i = 0; i < 2; i++) {
            const pick = (h: Note) => isMelody(h) && (h.crystal < KEYS / 2) === (i === 0);
            const last = lastOnset(haps, now, pick);
            const next = nextOnset(haps, now, pick);
            const pose = stance(strike(now, last, MALLET_HALF), windup(now, next));
            const {aimAt} = this;
            if (pose === 'hit') {
                aimAt.copy(this.keyTop[this.keyAt(last, pick)]);
            } else if (pose === 'ready' && Number.isFinite(next)) {
                aimAt.copy(this.keyTop[this.keyAt(next, pick)]);
                aimAt.y += 1.6;
                aimAt.z -= 0.6;
            } else {
                aimAt.set(i === 0 ? -1.6 : 1.6, 1.9, YETI_Z + 1.2);
            }
            // Into the yeti's frame; on a hit the arm reaches exactly to the crystal.
            aimAt.sub(this.yeti.root.position);
            const d = aimAt.distanceTo(this.yeti.shoulders[i]);
            this.yeti.aim(i, aimAt, pose === 'hit' ? d / REACH : 1);
        }
    }

    /** The crystal of the note `pick` accepts at onset `at`. */
    private keyAt(at: number, pick: (h: Note) => boolean): number {
        for (const h of this.field.haps) if (h.begin === at && pick(h)) return h.crystal;
        return 0;
    }

    private bassLevel(now: number): number {
        let v = 0;
        for (const h of this.field.haps) {
            if (h.role !== 'bass') continue;
            v = Math.max(v, strike(now, h.begin, 1 / 24), 0.3 * held(now, h.begin, h.end));
        }
        return v;
    }

    private shakeIcicles(now: number, kick: number): void {
        const {dummy} = this;
        for (let i = 0; i < ICICLES; i++) {
            const p = this.icicleSpots[i];
            const r = rand01(hash32(i, 9));
            const len = 0.8 + r * 1.6;
            const jig = kick * 0.12 * ((hash32(i, Math.floor(now * 16)) & 1) === 0 ? 1 : -1);
            dummy.position.set(p.x + jig, p.y - len / 2, p.z);
            dummy.rotation.set(0, 0, jig);
            dummy.scale.set(1, len, 1);
            dummy.updateMatrix();
            this.icicles.setMatrixAt(i, dummy.matrix);
        }
        this.icicles.instanceMatrix.needsUpdate = true;
    }

    /** The phrase's drop: a step a beat in the last bar, a fall through its last beat, a splash on the downbeat. */
    private countDrop(now: number): void {
        const start = Math.floor(now / PHRASE) * PHRASE;
        const bar = Math.floor(now) - start;
        const beat = beatIndex(now);
        const last = bar === PHRASE - 1;
        const size = last ? 0.45 + 0.25 * beat : 0.3;
        const fall = last && beat === 3 ? beatPhase(now) : 0;
        this.drop.scale.setScalar(size);
        this.drop.position.set(DRIP.x, DRIP.y - 0.1 - (DRIP.y - 0.2) * fall * fall, DRIP.z);
        const hit = strike(now, start, 1 / 16);
        this.ripple.scale.setScalar(0.3 + 2.4 * (1 - hit));
        this.rippleMat.opacity = hit;
        this.splash.intensity = 60 * hit;
    }

    private placeCamera(now: number): void {
        const bar = ((Math.floor(now) % PHRASE) + PHRASE) % PHRASE;
        const cam = this.camera;
        switch (bar) {
            case 0:
                cam.position.set(0, 3.4, 6.5);
                cam.lookAt(0, 2.2, YETI_Z);
                break;
            case 1:
                cam.position.set(-3.6, 4, 1.8);
                cam.lookAt(0.6, 2.4, YETI_Z - 0.6);
                break;
            case 2:
                cam.position.set(PENGUIN.x - 1.6, 2.4, PENGUIN.z + 4.6);
                cam.lookAt(PENGUIN.x - 0.2, 1.3, PENGUIN.z);
                break;
            default:
                cam.position.set(0.8, 4.6, 10);
                cam.lookAt(-0.6, 2.8, -1.5);
                break;
        }
    }
}

/** Two octaves of crystals, by pitch class and octave parity; -1 for an unpitched hap. */
function keyOf(note: number): number {
    if (!Number.isFinite(note)) return -1;
    const n = Math.round(note);
    return ((n % KEYS) + KEYS) % KEYS;
}

function isKick(h: Note): boolean {
    return h.role === 'kick';
}

function isSnare(h: Note): boolean {
    return h.role === 'snare' || h.role === 'tom';
}

function isChime(h: Note): boolean {
    return h.role === 'hat' || h.role === 'crash' || h.role === 'perc';
}

function isMelody(h: Note): boolean {
    return h.role === 'mid' || h.role === 'lead';
}

/** The cavern: a rough dome, its seam and rim shared so it closes. */
function domeGeometry(): BufferGeometry {
    const g = new SphereGeometry(DOME, 22, 10, 0, TAU, 0, Math.PI / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const key = hash32(Math.round(x * 3) * 977 + Math.round(z * 3), Math.round(y * 3));
        const k = y < 0.01 ? 1 : 1 + (rand01(key) - 0.5) * 0.18;
        pos.setXYZ(i, x * k, y * k * 0.85, z * k);
    }
    g.setAttribute('color', new BufferAttribute(new Float32Array(pos.count * 3), 3));
    g.computeVertexNormals();
    return g;
}

function paintDome(g: BufferGeometry, ink: Ink): void {
    const pos = g.attributes.position;
    const col = g.attributes.color;
    const c = new Color();
    for (let i = 0; i < pos.count; i++) {
        const h = clamp01(pos.getY(i) / DOME);
        c.copy(ink.deep).lerp(ink.frost, 0.12 + 0.3 * h).multiplyScalar(0.6 + 0.2 * rand01(hash32(i, 2)));
        col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
}

export const iceCaveDef: VizModeDef = {
    id: 'ice-cave',
    name: 'ICE CAVE',
    create: () => new IceCaveMode(),
};
