/**
 * PENGUIN WAREHOUSE: a penguin headliner on a pressure-sensitive ice stage.
 * Pitched notes light hex pads in their track's colour: twelve pitch classes
 * per bank, bass below C4 on the left, treble on the right. Each bank reads
 * left to right, back to front. Flippers ready over the next pad and land on
 * its onset; held notes keep the pad and its raised hex outline lit.
 * Kicks plant a lifted foot, compress the stage, pump the speaker cones and
 * flood the room with a short ice-white strobe. Snares crouch then lift a
 * dark crowd as one; hats chase sixteen lamps around the halo. Bar-line
 * cuts go close, low beside the pads, over the crowd, then wide. Stutters
 * loop the picture; chokes crack the lens and the next onset shatters it.
 */

import {clamp01, type FieldHap, type FieldTeam, HapField, type VizMode, type VizModeDef, type VizServices} from '@cycletron/viz-sdk';
import {drawScene, setRgb} from '@naderlabs/kit/gl';
import type {Role} from '@naderlabs/kit/roles';
import {beatIndex, held, lastOnset, nextOnset, stance, strike, windup} from '@naderlabs/kit/timing';
import {
    BoxGeometry, Color, CylinderGeometry, Mesh, MeshBasicMaterial, MeshLambertMaterial, PerspectiveCamera,
    PointLight, RingGeometry, Scene, Vector3,
} from 'three';
import {Penguin} from '../../lib/figures.js';
import {GlitchFx} from '../../lib/glitch-fx.js';
import {GLITCH_KEEP, loopTime} from '../../lib/glitch.js';
import {Ink} from '../../lib/ink.js';
import {isChime, isKick, isSnare, winterRole} from '../../lib/roles.js';
import {Warehouse} from './stage.js';

const SIZE = 1.7;
const PADS = 24;
const PHRASE = 4;

interface Team extends FieldTeam {
    color: Color;
}

interface Note extends FieldHap<Team> {
    role: Role;
    pad: number;
}

class PenguinWarehouseMode implements VizMode {
    private readonly scene = new Scene();
    private readonly camera = new PerspectiveCamera(48, 16 / 9, 0.1, 80);
    private readonly ink = new Ink();
    private readonly penguin = new Penguin();
    private readonly stage = new Warehouse(this.scene);
    private readonly glitch = new GlitchFx(this.scene);
    private readonly field = new HapField<Team, Note>({
        lookahead: 2,
        maxHaps: 1500,
        maxPerTrack: 160,
        idleRate: 0.25,
        team: (base) => ({...base, color: new Color()}),
        hap: (base) => ({...base, role: winterRole(base.team.name, base.note), pad: padOf(base.note)}),
        cap: (_team, note) => Number.isFinite(note) ? Infinity : 160,
        keep: (h, cycle) => h.end + GLITCH_KEEP >= cycle,
    });
    private readonly padMats: MeshLambertMaterial[] = [];
    private readonly ringMats: MeshBasicMaterial[] = [];
    private readonly targets: Vector3[] = [];
    private readonly level = new Float32Array(PADS);
    private readonly sustain = new Float32Array(PADS);
    private readonly colors: Color[] = [];
    private readonly casing = new MeshLambertMaterial({flatShading: true});
    private readonly light = new PointLight(0xffffff, 0, 9, 2);
    private readonly aim = new Vector3();

    constructor() {
        this.penguin.root.scale.setScalar(SIZE);
        this.penguin.root.position.y = 0.35;
        this.scene.add(this.penguin.root);
        const padGeo = new CylinderGeometry(0.43, 0.46, 0.18, 6);
        const baseGeo = new CylinderGeometry(0.5, 0.56, 0.28, 6);
        const ringGeo = new RingGeometry(0.46, 0.5, 6).rotateX(-Math.PI / 2);
        const railGeo = new BoxGeometry(2.9, 0.16, 3.8);
        const legGeo = new BoxGeometry(0.15, 0.65, 0.15);
        for (const x of [-2.75, 2.75]) {
            const rail = new Mesh(railGeo, this.casing);
            rail.position.set(x, 1.02, 0.61);
            this.scene.add(rail);
            for (const z of [-0.65, 1.87]) {
                const leg = new Mesh(legGeo, this.casing);
                leg.position.set(x, 0.67, z);
                this.scene.add(leg);
            }
        }
        for (let i = 0; i < PADS; i++) {
            const pc = i % 12;
            const bank = Math.floor(i / 12);
            const x = (bank === 0 ? -3.7 : 1.8) + (pc % 3) * 0.95;
            const z = -0.8 + Math.floor(pc / 3) * 0.94;
            const pos = new Vector3(x, 1.55, z);
            this.targets.push(pos);
            this.colors.push(new Color());
            const mat = new MeshLambertMaterial({flatShading: true});
            const pad = new Mesh(padGeo, mat);
            pad.position.copy(pos);
            pad.position.y -= 0.09;
            const base = new Mesh(baseGeo, this.casing);
            base.position.set(x, 1.23, z);
            const ringMat = new MeshBasicMaterial({transparent: true, depthWrite: false});
            const ring = new Mesh(ringGeo, ringMat);
            ring.position.copy(pos);
            ring.position.y += 0.18;
            this.padMats.push(mat);
            this.ringMats.push(ringMat);
            this.scene.add(base, pad, ring);
        }
        this.light.position.set(0, 2.5, 2);
        this.scene.add(this.light);
    }

    layout(s: VizServices): void {
        this.ink.bake(s.theme);
        this.stage.paint(this.ink, this.scene);
        this.penguin.paint(this.ink);
        this.glitch.paint(this.ink);
        this.casing.color.copy(this.ink.deep).lerp(this.ink.bg, 0.7);
        this.camera.aspect = s.width / Math.max(1, s.height);
        this.camera.updateProjectionMatrix();
        this.field.invalidate();
    }

    update(dt: number, s: VizServices): void {
        const field = this.field;
        field.update(dt, s);
        for (const team of field.teams) setRgb(team.color, team.rgb);
        const haps = field.haps;
        const now = loopTime(haps, field.cycle);
        const drums = field.locked ? haps : [];
        const kickAt = lastOnset(drums, now, isKick);
        const kick = strike(now, kickAt, 1 / 24);
        const flash = strike(now, kickAt, 1 / 64);
        const kickPose = stance(kick, windup(now, nextOnset(drums, now, isKick)));
        const snare = stance(strike(now, lastOnset(drums, now, isSnare), 1 / 20), windup(now, nextOnset(drums, now, isSnare)));
        const hat = strike(now, lastOnset(drums, now, isChime), 1 / 32);
        this.stage.update(this.ink, kick, flash, kickPose, snare, hat, beatIndex(now, 16));
        this.penguin.root.position.y = 0.35 + this.stage.platform.position.y;
        this.penguin.stomp(beatIndex(now) % 2, kickPose);
        this.lightPads(now);
        this.play(now);
        this.placeCamera(now);
        this.glitch.update(field.cycle, haps, this.camera);
    }

    render(ctx: CanvasRenderingContext2D, s: VizServices): void {
        drawScene(ctx, this.scene, this.camera, s.width, s.height, s.dpr);
    }

    private lightPads(now: number): void {
        this.level.fill(0);
        this.sustain.fill(0);
        for (const color of this.colors) color.copy(this.ink.ice);
        let peak = 0;
        for (const h of this.field.haps) {
            if (h.pad < 0) continue;
            const hit = strike(now, h.begin, 1 / 32);
            const hold = held(now, h.begin, h.end);
            const level = Math.max(hit, 0.5 * hold) * clamp01(h.fade);
            if (level > this.level[h.pad]) {
                this.level[h.pad] = level;
                this.colors[h.pad].copy(h.team.color);
            }
            this.sustain[h.pad] = Math.max(this.sustain[h.pad], hold * clamp01(h.fade));
            if (level > peak) {
                peak = level;
                this.light.color.copy(h.team.color);
            }
        }
        for (let i = 0; i < PADS; i++) {
            const level = this.level[i];
            const mat = this.padMats[i];
            mat.color.copy(this.ink.deep).lerp(this.colors[i], 0.25 + 0.65 * level);
            mat.emissive.copy(this.colors[i]).multiplyScalar(level * 1.6);
            this.ringMats[i].color.copy(this.colors[i]);
            this.ringMats[i].opacity = this.sustain[i] * 0.7;
        }
        this.light.intensity = peak * 6;
    }

    private play(now: number): void {
        for (let hand = 0; hand < 2; hand++) {
            const pick = (h: Note) => h.pad >= hand * 12 && h.pad < (hand + 1) * 12;
            const last = lastOnset(this.field.haps, now, pick);
            const next = nextOnset(this.field.haps, now, pick);
            const pose = stance(strike(now, last, 1 / 32), windup(now, next, 1 / 16));
            const at = pose === 'hit' ? last : next;
            const note = this.field.haps.find((h) => h.begin === at && pick(h));
            if (pose !== 'rest' && note) {
                this.aim.copy(this.targets[note.pad]);
                if (pose === 'ready') this.aim.y += 1.3;
                this.aim.sub(this.penguin.root.position).divideScalar(SIZE);
            } else {
                this.aim.set(hand === 0 ? -1.05 : 1.05, 1.2, 0.6);
            }
            this.penguin.play(hand, this.aim);
        }
    }

    private placeCamera(now: number): void {
        const bar = ((Math.floor(now) % PHRASE) + PHRASE) % PHRASE;
        if (bar === 0) {
            this.camera.position.set(0, 3.6, 7.4);
            this.camera.lookAt(0, 2.8, 0);
        } else if (bar === 1) {
            this.camera.position.set(-5.5, 2.2, 7);
            this.camera.lookAt(0, 2.7, 0);
        } else if (bar === 2) {
            this.camera.position.set(1.6, 2.9, 9.8);
            this.camera.lookAt(0, 2.7, 0);
        } else {
            this.camera.position.set(0, 6.8, 15.8);
            this.camera.lookAt(0, 2.65, 0);
        }
    }
}

function padOf(note: number): number {
    if (!Number.isFinite(note)) return -1;
    const pitch = Math.round(note);
    return ((pitch % 12) + 12) % 12 + (pitch < 60 ? 0 : 12);
}

export const penguinWarehouseDef: VizModeDef = {
    id: 'penguin-warehouse',
    name: 'PENGUIN WAREHOUSE',
    create: () => new PenguinWarehouseMode(),
};
