/**
 * ICE ORGAN: a pipe organ of ice in the cavern, with the yeti at the console.
 * Notes below C3 sound on the pedal rank, twelve tall pipes at the back, one
 * per pitch class; the rest on the manual rank in front, twenty-four pipes,
 * two chromatic octaves. A semitone is the next pipe over, so a bass rocking
 * between two notes a half step apart flickers between neighbours. A pipe
 * lights in its track's colour on the onset and glows while the note holds.
 * The yeti plays a two-keyboard console: a key goes down and lights with its
 * pipe, and the yeti's hands land on it on the onset (the left on the upper
 * keyboard for the pedal rank, the right on the lower for the manual). Its
 * foot comes down on the kick, shaking the icicles. The bass lights the crystal pillars, a penguin works
 * the bellows on the snares, and the hats flash the crown over the pipes.
 * Bar-line cuts go front, down onto the keys, along the ranks, then wide
 * for the phrase's last bar. Stutters loop the picture; chokes crack the lens.
 */

import {clamp01, type FieldHap, type FieldTeam, HapField, type VizMode, type VizModeDef, type VizServices} from '@cycletron/viz-sdk';
import {drawScene, setRgb} from '@naderlabs/kit/gl';
import type {Role} from '@naderlabs/kit/roles';
import {held, lastOnset, nextOnset, stance, strike, windup} from '@naderlabs/kit/timing';
import {BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, PointLight, Scene, Vector3} from 'three';
import {Cave} from '../../lib/cave.js';
import {ARM, Penguin, Yeti} from '../../lib/figures.js';
import {GlitchFx} from '../../lib/glitch-fx.js';
import {GLITCH_KEEP, loopTime} from '../../lib/glitch.js';
import {Ink} from '../../lib/ink.js';
import {isChime, isKick, isSnare, winterRole} from '../../lib/roles.js';
import {Console} from './console.js';
import {MANUALS, Organ, PEDALS} from './organ.js';

const PHRASE = 4;
/** The lowest note on the manual rank: C3. */
const SPLIT = 48;
const YETI = new Vector3(-4.3, 0, -2.4);
const PENGUIN = new Vector3(5.2, 0, -0.4);

interface Team extends FieldTeam {
    color: Color;
}

interface Note extends FieldHap<Team> {
    role: Role;
    /** The pedal pipe, or -1. */
    pedal: number;
    /** The manual pipe, or -1. */
    manual: number;
}

class IceOrganMode implements VizMode {
    private readonly ink = new Ink();
    private readonly scene = new Scene();
    private readonly camera = new PerspectiveCamera(50, 16 / 9, 0.1, 200);
    private readonly field = new HapField<Team, Note>({
        lookahead: 2,
        maxHaps: 1500,
        maxPerTrack: 160,
        idleRate: 0.25,
        team: (base) => ({...base, color: new Color()}),
        hap: (base) => ({...base, role: winterRole(base.team.name, base.note), ...pipeOf(base.note)}),
        cap: (_team, note) => (Number.isFinite(note) ? Infinity : 160),
        keep: (h, cycle) => h.end + GLITCH_KEEP >= cycle,
    });
    private readonly cave = new Cave(this.scene, new Vector3(0, 3, -6.5));
    private readonly organ = new Organ(this.scene);
    private readonly glitch = new GlitchFx(this.scene);
    private readonly yeti = new Yeti();
    private readonly penguin = new Penguin();
    private readonly bellowsMat = new MeshStandardMaterial({flatShading: true, roughness: 0.6});
    private readonly lid = new Group();
    private readonly glow = new PointLight(0xffffff, 0, 0, 1.5);
    private readonly pedalLevel = new Float32Array(PEDALS);
    private readonly manualLevel = new Float32Array(MANUALS);
    private readonly pedalColor = Array.from({length: PEDALS}, () => new Color());
    private readonly manualColor = Array.from({length: MANUALS}, () => new Color());
    private readonly tint = new Color();
    private readonly aimAt = new Vector3();
    private readonly console = new Console(this.yeti.root);

    constructor() {
        const {scene} = this;
        // The yeti stands side-on at the console, its face to the camera's right.
        this.yeti.emptyHanded();
        this.yeti.root.position.copy(YETI);
        this.yeti.root.rotation.y = 1.25;
        scene.add(this.yeti.root);

        this.penguin.root.position.copy(PENGUIN);
        this.penguin.root.rotation.y = -0.9;
        const box = new Mesh(new BoxGeometry(1.4, 0.7, 1), this.bellowsMat);
        box.position.set(0, 0.35, 1.1);
        const lidPlate = new Mesh(new BoxGeometry(1.4, 0.12, 1), this.bellowsMat);
        lidPlate.position.set(0.7, 0, 0);
        this.lid.position.set(-0.7, 0.75, 1.1);
        this.lid.add(lidPlate);
        this.penguin.root.add(box, this.lid);
        scene.add(this.penguin.root);

        this.glow.position.set(0, 3, -3.5);
        scene.add(this.glow);
    }

    layout(s: VizServices): void {
        const {ink} = this;
        ink.bake(s.theme);
        this.cave.paint(ink);
        this.organ.paint(ink);
        this.yeti.paint(ink);
        this.penguin.paint(ink);
        this.glitch.paint(ink);
        this.console.paint(ink);
        this.bellowsMat.color.copy(ink.warm).multiplyScalar(0.45);
        this.camera.aspect = s.width / Math.max(1, s.height);
        this.camera.updateProjectionMatrix();
        this.field.invalidate();
    }

    update(dt: number, s: VizServices): void {
        const field = this.field;
        field.update(dt, s);
        for (const t of field.teams) setRgb(t.color, t.rgb);
        const haps = field.haps;
        const now = loopTime(haps, field.cycle);
        const drums = field.locked ? haps : [];

        this.lightPipes(now);
        this.play(now);

        const kick = strike(now, lastOnset(drums, now, isKick), 1 / 24);
        const kickNext = windup(now, nextOnset(drums, now, isKick));
        this.yeti.stomp(stance(kick, kickNext) === 'ready' && kickNext > 0 ? 1 : 0);
        this.cave.shake(now, kick);
        this.cave.pulse(this.ink, this.bassLevel(now));

        const snare = stance(strike(now, lastOnset(drums, now, isSnare), 1 / 20), windup(now, nextOnset(drums, now, isSnare)));
        this.penguin.pose(snare, snare);
        this.lid.rotation.z = snare === 'ready' ? 0.35 : snare === 'hit' ? 0 : 0.12;
        this.organ.crown(this.ink, strike(now, lastOnset(drums, now, isChime), 1 / 32));

        this.placeCamera(now);
        this.glitch.update(field.cycle, haps, this.camera);
    }

    render(ctx: CanvasRenderingContext2D, s: VizServices): void {
        drawScene(ctx, this.scene, this.camera, s.width, s.height, s.dpr);
    }

    /** Each pipe: bright on the onset of a note at its pitch, lit while the note holds. */
    private lightPipes(now: number): void {
        const {ink} = this;
        this.pedalLevel.fill(0);
        this.manualLevel.fill(0);
        for (const c of this.pedalColor) c.copy(ink.ice);
        for (const c of this.manualColor) c.copy(ink.ice);
        let peak = 0;
        for (const h of this.field.haps) {
            if (h.pedal < 0 && h.manual < 0) continue;
            const hit = strike(now, h.begin, 1 / 24);
            const v = Math.max(hit, 0.45 * held(now, h.begin, h.end)) * clamp01(h.fade);
            const [levels, colors, i] = h.pedal >= 0
                ? [this.pedalLevel, this.pedalColor, h.pedal]
                : [this.manualLevel, this.manualColor, h.manual];
            if (v > levels[i]) {
                levels[i] = v;
                colors[i].copy(h.team.color);
            }
            if (hit > peak) {
                peak = hit;
                this.glow.color.copy(h.team.color);
            }
        }
        this.organ.light(this.organ.pedal, this.pedalLevel, this.pedalColor, ink, this.tint);
        this.organ.light(this.organ.manual, this.manualLevel, this.manualColor, ink, this.tint);
        this.console.light(this.console.upper, this.pedalLevel, this.pedalColor);
        this.console.light(this.console.lower, this.manualLevel, this.manualColor);
        this.glow.intensity = 30 * peak;
    }

    /** The yeti's hands on the keys: the left on the upper keyboard (the pedal rank), the right on the lower. */
    private play(now: number): void {
        const haps = this.field.haps;
        for (let hand = 0; hand < 2; hand++) {
            const pick = hand === 0 ? (h: Note) => h.pedal >= 0 : (h: Note) => h.manual >= 0;
            const last = lastOnset(haps, now, pick);
            const next = nextOnset(haps, now, pick);
            const pose = stance(strike(now, last, 1 / 32), windup(now, next, 1 / 16));
            const at = pose === 'hit' ? last : next;
            const note = pose === 'rest' ? undefined : haps.find((h) => h.begin === at && pick(h));
            const {aimAt} = this;
            if (note) {
                aimAt.copy(note.pedal >= 0 ? this.console.upper[note.pedal].top : this.console.lower[note.manual].top);
                if (pose === 'ready') aimAt.y += 0.9;
            } else {
                aimAt.set(hand === 0 ? -1.1 : 1.1, 2.6, 1.3);
            }
            const d = aimAt.distanceTo(this.yeti.shoulders[hand]);
            this.yeti.aim(hand, aimAt, pose === 'hit' ? Math.min(1.4, d / ARM) : 0.85);
        }
        this.yeti.nod(0.12 * strike(now, lastOnset(haps, now, (h) => h.pedal >= 0 || h.manual >= 0), 1 / 16));
    }

    private bassLevel(now: number): number {
        let v = 0;
        for (const h of this.field.haps) {
            if (h.role !== 'bass') continue;
            v = Math.max(v, strike(now, h.begin, 1 / 24), 0.3 * held(now, h.begin, h.end));
        }
        return v;
    }

    private placeCamera(now: number): void {
        const bar = ((Math.floor(now) % PHRASE) + PHRASE) % PHRASE;
        const cam = this.camera;
        switch (bar) {
            case 0:
                cam.position.set(0, 3.4, 7.5);
                cam.lookAt(0, 3.4, -6.5);
                break;
            case 1:
                cam.position.set(-1.4, 5, 2.4);
                cam.lookAt(-3.4, 2.4, -2.2);
                break;
            case 2:
                cam.position.set(5, 3, -2.6);
                cam.lookAt(-4, 3.2, -7.2);
                break;
            default:
                cam.position.set(0.6, 5.8, 13);
                cam.lookAt(0, 3.2, -4.5);
                break;
        }
    }
}

/** The pipe a note sounds on: below the split, the pedal rank by pitch class; above, the manual rank over two octaves. */
function pipeOf(note: number): Pick<Note, 'pedal' | 'manual'> {
    if (!Number.isFinite(note)) return {pedal: -1, manual: -1};
    const n = Math.round(note);
    if (n < SPLIT) return {pedal: ((n % 12) + 12) % 12, manual: -1};
    return {pedal: -1, manual: (n - SPLIT) % MANUALS};
}

export const iceOrganDef: VizModeDef = {
    id: 'ice-organ',
    name: 'ICE ORGAN',
    create: () => new IceOrganMode(),
};
