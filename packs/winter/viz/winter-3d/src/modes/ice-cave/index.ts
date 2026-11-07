/**
 * ICE CAVE: a band in an ice cavern, every voice with a player you can
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
import {clamp01} from '@cycletron/viz-sdk';
import {drawScene, setRgb} from '@naderlabs/kit/gl';
import {type Role} from '@naderlabs/kit/roles';
import {beatIndex, beatPhase, held, lastOnset, nextOnset, type Stance, stance, strike, windup} from '@naderlabs/kit/timing';
import {
    AdditiveBlending, BoxGeometry, CircleGeometry, Color, ConeGeometry, InstancedMesh, LatheGeometry,
    Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, PointLight,
    RingGeometry, Scene, SphereGeometry, Vector2, Vector3,
} from 'three';
import {Cave} from '../../lib/cave.js';
import {Penguin, REACH, Yeti} from '../../lib/figures.js';
import {Ink} from '../../lib/ink.js';
import {isChime, isKick, isSnare, winterRole} from '../../lib/roles.js';

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
const PHRASE = 4;
const DRIP = new Vector3(-2.6, 6.2, 1.6);
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
    private readonly rackMat = new MeshLambertMaterial({flatShading: true});
    private readonly drumMat = new MeshStandardMaterial({flatShading: true, roughness: 0.3});
    private readonly chimeMat = new MeshStandardMaterial({flatShading: true, roughness: 0.2});
    private readonly yeti = new Yeti();
    private readonly penguin = new Penguin();
    private readonly chimes: Mesh[] = [];

    private readonly drop: Mesh;
    private readonly dropMat = new MeshStandardMaterial({flatShading: true, roughness: 0.1});
    private readonly ripple: Mesh;
    private readonly rippleMat = new MeshBasicMaterial({blending: AdditiveBlending, transparent: true, depthWrite: false});

    private readonly glow = new PointLight(0xffffff, 0, 0, 1.5);
    private readonly splash = new PointLight(0xffffff, 0, 0, 1.5);
    private readonly dummy = new Object3D();
    private readonly tint = new Color();
    private readonly aimAt = new Vector3();

    private readonly cave = new Cave(this.scene, new Vector3(0, 2, YETI_Z));

    constructor() {
        const {scene} = this;

        const crystal = new LatheGeometry([new Vector2(0, 0), new Vector2(0.2, 0), new Vector2(0.22, 0.82), new Vector2(0, 1)], 6);
        this.keys = new InstancedMesh(crystal, this.keyMat, KEYS);
        this.shells = new InstancedMesh(crystal, this.shellMat, KEYS);
        this.keys.frustumCulled = false;
        this.shells.frustumCulled = false;
        this.shells.renderOrder = 2;
        for (let k = 0; k < KEYS; k++) {
            const a = -1.3 + 2.6 * (k / (KEYS - 1));
            const h = 2.2 - 0.9 * (k / (KEYS - 1));
            const p = new Vector3(Math.sin(a) * ARC, 0, YETI_Z + Math.cos(a) * ARC);
            this.keyPos.push(p);
            this.keyH.push(h);
            this.keyTop.push(new Vector3(p.x, p.y + h, p.z));
            this.keyColor.push(new Color());
            this.keys.setColorAt(k, this.tint.setRGB(1, 1, 1));
            this.shells.setColorAt(k, this.tint.setRGB(0, 0, 0));
        }
        scene.add(this.keys, this.shells);

        this.yeti.root.position.set(0, 0, YETI_Z);
        scene.add(this.yeti.root);

        this.penguin.root.position.copy(PENGUIN);
        this.penguin.root.rotation.y = -0.6;
        const drum = new Mesh(new BoxGeometry(0.9, 0.9, 0.9), this.drumMat);
        drum.position.set(-1.35, 0.45, 0.25);
        const rack = new Mesh(new BoxGeometry(1.3, 0.1, 0.2), this.rackMat);
        rack.position.set(1.4, 2.5, 0.2);
        this.penguin.root.add(drum, rack);
        for (let i = 0; i < 5; i++) {
            const c = new Mesh(new ConeGeometry(0.08, 0.5 + i * 0.12, 5).rotateX(Math.PI).translate(0, -(0.25 + i * 0.06), 0), this.chimeMat);
            c.position.set(0.9 + i * 0.25, 2.45, 0.2);
            this.chimes.push(c);
            this.penguin.root.add(c);
        }
        scene.add(this.penguin.root);

        const stalactite = new Mesh(new ConeGeometry(0.35, 1.6, 6).rotateX(Math.PI), this.cave.iceMat);
        stalactite.position.set(DRIP.x, DRIP.y + 0.8, DRIP.z);
        this.drop = new Mesh(new SphereGeometry(0.22, 8, 6), this.dropMat);
        const pool = new Mesh(new CircleGeometry(1.2, 18).rotateX(-Math.PI / 2), this.ledgeMat);
        pool.position.set(DRIP.x, 0.02, DRIP.z);
        this.ripple = new Mesh(new RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2), this.rippleMat);
        this.ripple.position.set(DRIP.x, 0.04, DRIP.z);
        scene.add(stalactite, this.drop, pool, this.ripple);

        this.glow.position.set(0, 1.4, YETI_Z + 4);
        this.splash.position.set(DRIP.x, 1.2, DRIP.z);
        scene.add(this.glow, this.splash);
    }

    layout(s: VizServices): void {
        const {ink} = this;
        ink.bake(s.theme);
        this.cave.paint(ink);
        this.ledgeMat.color.copy(ink.deep).lerp(ink.ice, 0.25);
        this.keyMat.emissive.copy(ink.deep).multiplyScalar(0.3);
        this.yeti.paint(ink);
        this.penguin.paint(ink);
        this.rackMat.color.copy(ink.warm).multiplyScalar(0.45);
        this.drumMat.color.copy(ink.ice).lerp(ink.snow, 0.4);
        this.chimeMat.color.copy(ink.frost);
        this.dropMat.color.copy(ink.ice);
        this.dropMat.emissive.copy(ink.ice).multiplyScalar(0.4);
        this.rippleMat.color.copy(ink.ice);
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
        this.cave.shake(now, kick);

        const bass = this.bassLevel(now);
        this.cave.pulse(this.ink, bass);

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

function isMelody(h: Note): boolean {
    return h.role === 'mid' || h.role === 'lead';
}

export const iceCaveDef: VizModeDef = {
    id: 'ice-cave',
    name: 'ICE CAVE',
    create: () => new IceCaveMode(),
};
