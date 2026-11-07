/**
 * YETI DJ: the ice cave after hours. The yeti, in sunglasses, plays a set
 * from an ice-block booth with two turntables, the penguin dances beside it,
 * and a laser rig over the decks lights the cave. Every hit lands on the
 * frame its note sounds:
 *
 * - The lasers are the pitched notes. Each pitch has its own beam (see
 *   `lasers.ts`): a note fires it in the track's colour on the onset, a held
 *   note keeps it lit, and the yeti's lenses catch the brightest.
 * - The kicks: the yeti nods (head back an eighth of a bar before, down on
 *   the kick), the booth lights from inside, the icicles shake.
 * - The snares: the yeti scratches the left deck, the record pulled back
 *   before the hit and thrown forward on it, and the penguin throws its
 *   flippers up.
 * - The leads ride the mixer: the right hand lifts before each lead note
 *   and presses on it. Hats blink the mixer's lights and the penguin hops.
 * - The bass lights the two crystal pillars.
 * - Each four-bar phrase builds to a drop: through the last bar the yeti's
 *   right arm climbs a step a beat, and on the downbeat it punches up and
 *   every beam fires white.
 * - The show (see `stage.ts`): the yeti is on a riser whose lip flashes on
 *   the kick, in front of a video wall with a column per pitch class lit to
 *   how loud that pitch is, under a truss of four spots that step to new
 *   marks on each beat and flare on the kick. Cryo jets fire on the drop.
 * - A crowd of penguins in front of the stage (see `crowd.ts`) hops on the
 *   kick and throws its flippers up for the snares and the drop.
 * - The camera cuts on every bar line: front, the yeti, the penguin, and
 *   wide for the last bar so the drop is seen.
 */

import type {VizMode, VizModeDef, VizServices} from '@cycletron/viz-sdk';
import {type FieldHap, type FieldTeam, HapField} from '@cycletron/viz-sdk';
import {clamp01} from '@cycletron/viz-sdk';
import {drawScene, setRgb} from '@naderlabs/kit/gl';
import {type Role} from '@naderlabs/kit/roles';
import {beatIndex, beatsLeft, held, HIT, lastOnset, nextOnset, type Stance, stance, strike, windup} from '@naderlabs/kit/timing';
import {
    BoxGeometry, Color, CylinderGeometry, Group, Mesh, MeshLambertMaterial, MeshStandardMaterial, PerspectiveCamera,
    PointLight, Scene, Vector3,
} from 'three';
import {Cave} from '../../lib/cave.js';
import {ARM, Penguin, Yeti} from '../../lib/figures.js';
import {Ink} from '../../lib/ink.js';
import {isChime, isKick, isSnare, winterRole} from '../../lib/roles.js';
import {Crowd} from './crowd.js';
import {BEAMS, beamOf, Lasers, PITCHES} from './lasers.js';
import {Show, STAGE_H} from './stage.js';

const LOOKAHEAD = 2;
const MAX_HAPS = 600;
const MAX_PER_TRACK = 64;
const DRUM_CAP = 48;
const IDLE_RATE = 0.25;
const KEEP = 0.4;
const PHRASE = 4;
const YETI_Z = -3.6;
const PENGUIN = new Vector3(3.4, STAGE_H, -1.8);
/** The booth: an ice block in front of the yeti, its top at the yeti's waist. */
const BOOTH = new Vector3(0, STAGE_H + 0.95, YETI_Z + 1.9);
const BOOTH_SIZE = new Vector3(3.4, 1.9, 1.2);
const DECK_Y = BOOTH.y + BOOTH_SIZE.y / 2 + 0.06;
const DECKS = [new Vector3(-0.95, DECK_Y, BOOTH.z - 0.1), new Vector3(0.95, DECK_Y, BOOTH.z - 0.1)];
const MIXER = new Vector3(0, DECK_Y + 0.08, BOOTH.z - 0.1);
/** The laser rig, hung over and behind the yeti. */
const RIG = new Vector3(0, 6.1, YETI_Z - 1.2);
/** Register of each pitched role, for the beams. */
const REGISTER: Partial<Record<Role, number>> = {bass: 0, mid: 1, lead: 2};
/** The nod: head back to wind up, down on the kick. */
const NOD: Record<Stance, number> = {rest: 0, ready: -0.18, hit: 0.32};
/** The scratch: the record pulled back, then thrown forward. */
const SCRATCH: Record<Stance, number> = {rest: 0, ready: -0.9, hit: 0.7};

interface Team extends FieldTeam {
    color: Color;
}

interface Note extends FieldHap<Team> {
    role: Role;
    beam: number;
}

class YetiDjMode implements VizMode {
    private readonly ink = new Ink();
    private readonly scene = new Scene();
    private readonly camera = new PerspectiveCamera(50, 16 / 9, 0.1, 200);
    private readonly cave = new Cave(this.scene, new Vector3(0, 2.5, YETI_Z));
    private readonly field = new HapField<Team, Note>({
        lookahead: LOOKAHEAD,
        maxHaps: MAX_HAPS,
        maxPerTrack: MAX_PER_TRACK,
        idleRate: IDLE_RATE,
        team: (base) => ({...base, color: new Color()}),
        hap: (base) => {
            const role = winterRole(base.team.name, base.note);
            const register = REGISTER[role];
            return {...base, role, beam: register === undefined ? -1 : beamOf(base.note, register)};
        },
        cap: (_team, note) => (Number.isFinite(note) ? Infinity : DRUM_CAP),
        keep: (h, cycle) => h.end + KEEP >= cycle,
    });

    private readonly yeti = new Yeti();
    private readonly penguin = new Penguin();
    private readonly lasers = new Lasers(RIG);
    private readonly show = new Show(this.scene);
    private readonly crowd = new Crowd(this.scene);
    /** Per pitch class, for the wall: how loud, and in whose colour. */
    private readonly pitchLevel = new Float32Array(PITCHES);
    private readonly pitchColor: Color[] = Array.from({length: PITCHES}, () => new Color());
    private readonly beamLevel = new Float32Array(BEAMS);
    private readonly beamPunch = new Float32Array(BEAMS);
    private readonly beamColor: Color[] = Array.from({length: BEAMS}, () => new Color());
    private readonly boothMat = new MeshStandardMaterial({flatShading: true, roughness: 0.25, transparent: true, opacity: 0.92});
    private readonly vinylMat = new MeshLambertMaterial({flatShading: true});
    private readonly labelMat = new MeshLambertMaterial({flatShading: true});
    private readonly mixerMat = new MeshLambertMaterial({flatShading: true});
    private readonly rigMat = new MeshLambertMaterial({flatShading: true});
    private readonly platters: Group[] = [];
    private readonly glow = new PointLight(0xffffff, 0, 0, 1.5);
    private readonly white = new Color();
    private readonly aimAt = new Vector3();

    constructor() {
        const {scene} = this;
        this.yeti.emptyHanded();
        this.yeti.wearShades();
        this.yeti.root.position.set(0, STAGE_H, YETI_Z);
        scene.add(this.yeti.root);

        const booth = new Mesh(new BoxGeometry(BOOTH_SIZE.x, BOOTH_SIZE.y, BOOTH_SIZE.z), this.boothMat);
        booth.position.copy(BOOTH);
        scene.add(booth);
        for (const at of DECKS) {
            // A platter: the record, its label, and a mark at the rim so the spin reads.
            const p = new Group();
            p.position.copy(at);
            const record = new Mesh(new CylinderGeometry(0.5, 0.5, 0.06, 18), this.vinylMat);
            const label = new Mesh(new CylinderGeometry(0.17, 0.17, 0.08, 12), this.labelMat);
            const mark = new Mesh(new BoxGeometry(0.08, 0.09, 0.3), this.labelMat);
            mark.position.set(0, 0, 0.33);
            p.add(record, label, mark);
            this.platters.push(p);
            scene.add(p);
        }
        const mixer = new Mesh(new BoxGeometry(0.6, 0.16, 0.7), this.mixerMat);
        mixer.position.copy(MIXER);
        scene.add(mixer);

        const rig = new Mesh(new BoxGeometry(1.4, 0.35, 0.5), this.rigMat);
        rig.position.copy(RIG);
        const hanger = new Mesh(new CylinderGeometry(0.04, 0.04, 6, 4), this.rigMat);
        hanger.position.set(RIG.x, RIG.y + 3.15, RIG.z);
        scene.add(rig, hanger, this.lasers.mesh);

        this.penguin.root.position.copy(PENGUIN);
        this.penguin.root.rotation.y = -0.7;
        scene.add(this.penguin.root);

        this.glow.position.set(0, 2.6, BOOTH.z + 1.2);
        scene.add(this.glow);
    }

    layout(s: VizServices): void {
        const {ink, cave} = this;
        ink.bake(s.theme);
        cave.paint(ink);
        // After hours: the room down, so the lasers carry it.
        cave.air.multiplyScalar(0.5);
        cave.fog.color.copy(cave.air);
        cave.ambient.intensity = 0.3;
        cave.hemi.intensity = 0.45;
        cave.key.intensity = 0.7;
        this.yeti.paint(ink);
        this.penguin.paint(ink);
        this.boothMat.color.copy(ink.ice).lerp(ink.snow, 0.3);
        this.vinylMat.color.copy(ink.bg);
        this.labelMat.color.copy(ink.rose);
        this.mixerMat.color.copy(ink.deep).lerp(ink.bg, 0.5);
        this.rigMat.color.copy(ink.bg).lerp(ink.deep, 0.3);
        this.glow.color.copy(ink.glow);
        this.white.copy(ink.snow);
        this.show.paint(ink);
        this.crowd.paint(ink);
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
        const {ink, yeti, penguin} = this;

        const drop = strike(now, Math.floor(now / PHRASE) * PHRASE, 1 / 16);
        this.fireLasers(now, drop);

        const kick = drums ? strike(now, lastOnset(drums, now, isKick), 1 / 24) : 0;
        const kickPose = drums ? stance(kick, windup(now, nextOnset(drums, now, isKick))) : 'rest';
        yeti.nod(NOD[kickPose]);
        this.cave.shake(now, kick);
        this.boothMat.emissive.copy(ink.ice).multiplyScalar(0.12 + 0.7 * kick);
        this.show.lip(kick);
        this.show.spots(beatIndex(now), kick);
        this.show.cryo(drop, this.white);
        this.glow.intensity = 20 * kick;
        this.cave.pulse(ink, this.bassLevel(now));

        const snare = drums ? this.voice(now, drums, isSnare) : 'rest';
        const hat = drums ? strike(now, lastOnset(drums, now, isChime), 1 / 24) : 0;
        this.mixerMat.emissive.copy(ink.ice).multiplyScalar(0.6 * hat);
        this.spin(now, snare);
        this.playHands(now, snare);

        penguin.pose(snare === 'hit' ? 'ready' : 'rest', snare === 'hit' ? 'ready' : hat > HIT ? 'hit' : 'rest');
        penguin.hop(kick > HIT ? 1 : 0);
        this.crowd.pose(kick > HIT ? 1 : 0, drop > HIT || snare === 'hit');

        this.placeCamera(now);
    }

    render(ctx: CanvasRenderingContext2D, s: VizServices): void {
        drawScene(ctx, this.scene, this.camera, s.width, s.height, s.dpr);
    }

    private voice(now: number, haps: readonly Note[], pick: (h: Note) => boolean): Stance {
        return stance(strike(now, lastOnset(haps, now, pick)), windup(now, nextOnset(haps, now, pick)));
    }

    /** Each beam: full on its note's onset, half while held, and white for the drop. */
    private fireLasers(now: number, drop: number): void {
        const {beamLevel, beamPunch, beamColor, pitchLevel, pitchColor} = this;
        beamLevel.fill(0);
        beamPunch.fill(0);
        pitchLevel.fill(0);
        let peak = 0;
        let peakColor: Color | null = null;
        for (const h of this.field.haps) {
            if (h.beam < 0) continue;
            const hit = strike(now, h.begin, 1 / 24);
            const v = Math.max(hit, 0.5 * held(now, h.begin, h.end)) * clamp01(h.fade);
            if (v <= beamLevel[h.beam]) continue;
            beamLevel[h.beam] = v;
            beamPunch[h.beam] = hit;
            beamColor[h.beam].copy(h.team.color);
            const pc = h.beam % PITCHES;
            if (v > pitchLevel[pc]) {
                pitchLevel[pc] = v;
                pitchColor[pc].copy(h.team.color);
            }
            if (v > peak) {
                peak = v;
                peakColor = h.team.color;
            }
        }
        for (let b = 0; b < BEAMS; b++) {
            if (drop > beamLevel[b]) {
                beamColor[b].lerp(this.white, drop);
                beamLevel[b] = Math.max(beamLevel[b], drop);
                beamPunch[b] = Math.max(beamPunch[b], drop);
            }
            this.lasers.set(b, beamLevel[b], beamColor[b], beamPunch[b]);
        }
        this.lasers.commit();
        this.show.wall(pitchLevel, pitchColor, drop, this.white);
        this.yeti.shine(drop > peak ? this.white : (peakColor ?? this.white), 0.8 * Math.max(peak, drop));
    }

    /** The decks turn a bar a revolution; a snare scratches the left one. */
    private spin(now: number, snare: Stance): void {
        const turn = -now * Math.PI * 2;
        this.platters[0].rotation.y = turn + SCRATCH[snare];
        this.platters[1].rotation.y = turn;
    }

    /**
     * The left hand works the left deck with the snares. The right rides the
     * mixer with the leads, but through the last bar of a phrase it climbs a
     * step a beat, and punches up on the drop.
     */
    private playHands(now: number, snare: Stance): void {
        const {aimAt, yeti} = this;
        const root = yeti.root.position;
        const deck = DECKS[0];
        aimAt.set(deck.x + (snare === 'hit' ? 0.2 : snare === 'ready' ? -0.2 : 0), deck.y + (snare === 'ready' ? 0.25 : 0), deck.z + 0.15).sub(root);
        yeti.aim(0, aimAt, aimAt.distanceTo(yeti.shoulders[0]) / ARM);

        const left = beatsLeft(now, PHRASE);
        const drop = strike(now, Math.floor(now / PHRASE) * PHRASE, 1 / 16);
        if (drop > HIT) {
            aimAt.set(1.6, 6.5, YETI_Z + 0.6).sub(root);
            yeti.aim(1, aimAt, 1);
            return;
        }
        if (left <= 4) {
            // The count: up a step on each beat of the last bar.
            const step = beatIndex(now) + 1;
            aimAt.set(1.5 + 0.1 * step, 2.6 + 0.75 * step, YETI_Z + 1.2).sub(root);
            yeti.aim(1, aimAt, 1);
            return;
        }
        const lead = this.voice(now, this.field.haps, (h) => h.role === 'lead');
        aimAt.set(MIXER.x + 0.15, MIXER.y + (lead === 'ready' ? 0.45 : lead === 'hit' ? 0 : 0.15), MIXER.z + 0.1).sub(root);
        yeti.aim(1, aimAt, aimAt.distanceTo(yeti.shoulders[1]) / ARM);
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
                cam.position.set(0, 3.6, 8);
                cam.lookAt(0, 3.7, YETI_Z);
                break;
            case 1:
                cam.position.set(-2.4, 4.6, 2.4);
                cam.lookAt(0.2, 4.0, YETI_Z);
                break;
            case 2:
                // From over the crowd's heads, so they frame the bottom of the shot.
                cam.position.set(1.2, 3.4, 3.4);
                cam.lookAt(PENGUIN.x - 0.4, PENGUIN.y + 1.3, PENGUIN.z);
                break;
            default:
                cam.position.set(0.8, 4.8, 11.5);
                cam.lookAt(0, 3.8, -2);
                break;
        }
    }
}

export const yetiDjDef: VizModeDef = {
    id: 'yeti-dj',
    name: 'YETI DJ',
    create: () => new YetiDjMode(),
};
