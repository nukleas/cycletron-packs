/**
 * The cave's two players: a yeti (with a mallet in each fist at the
 * marimba, or empty-handed and in sunglasses at the decks) and a penguin.
 * Both are posed per frame: the yeti by pointing each arm at a spot and
 * nodding its head, the penguin from a stance table per flipper. Each owns
 * its materials and takes its colours from the theme in `paint`.
 */

import {
    BoxGeometry, type Color, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, Mesh,
    MeshLambertMaterial, TorusGeometry, Vector3,
} from 'three';
import type {Stance} from '@naderlabs/kit/timing';
import type {Ink} from './ink.js';

const DOWN = new Vector3(0, -1, 0);
/** Shoulder to mallet head. */
export const REACH = 2.9;
/** Shoulder to fist, without a mallet. */
export const ARM = 1.6;
/** The neck: the head nods about it. */
const NECK = new Vector3(0, 3.45, 0);

function ball(mat: MeshLambertMaterial, r: number, at: Vector3, scale: Vector3): Mesh {
    const m = new Mesh(new IcosahedronGeometry(r, 1), mat);
    m.position.copy(at);
    m.scale.copy(scale);
    return m;
}

const v = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);
/** A point given in the yeti's frame, in its head's. */
const onHead = (x: number, y: number, z: number): Vector3 => v(x, y, z).sub(NECK);

/** The yeti: round, with a flat blue face and two dot eyes. That plain face is its charm; keep it plain. */
export class Yeti {
    readonly root = new Group();
    /** Shoulders in the yeti's own frame, left (-x) then right. */
    readonly shoulders = [v(-1.25, 3.05, 0.2), v(1.25, 3.05, 0.2)];
    private readonly fur = new MeshLambertMaterial({flatShading: true});
    private readonly face = new MeshLambertMaterial({flatShading: true});
    private readonly eye = new MeshLambertMaterial();
    private readonly mallet = new MeshLambertMaterial({flatShading: true});
    private readonly stick = new MeshLambertMaterial({flatShading: true});
    private readonly lens = new MeshLambertMaterial({flatShading: true});
    private readonly arms: Group[] = [];
    private readonly mallets: Mesh[] = [];
    private readonly head = new Group();
    private readonly stompLeg = new Group();
    private readonly dir = new Vector3();

    constructor() {
        const {fur, face} = this;
        const body = ball(fur, 1.35, v(0, 2.2, 0), v(1, 1.3, 0.85));
        const head = ball(fur, 0.75, v(0, 3.95, 0), v(1, 1, 1));
        const muzzle = ball(face, 0.45, v(0, 3.8, 0.5), v(1, 0.75, 0.6));
        const eyes = [-0.27, 0.27].map((x) => {
            const e = new Mesh(new IcosahedronGeometry(0.1, 0), this.eye);
            e.position.set(x, 4.1, 0.62);
            return e;
        });
        const horns = [-1, 1].map((side) => {
            const h = new Mesh(new ConeGeometry(0.14, 0.55, 5), face);
            h.position.set(side * 0.5, 4.55, 0);
            h.rotation.z = -side * 0.5;
            return h;
        });
        const legGeo = new CylinderGeometry(0.42, 0.5, 1.3, 7).translate(0, -0.65, 0);
        const leg = new Mesh(legGeo, fur);
        leg.position.set(-0.65, 1.3, 0);
        this.stompLeg.position.set(0.65, 1.3, 0);
        this.stompLeg.add(new Mesh(legGeo, fur));
        this.head.position.copy(NECK);
        for (const m of [head, muzzle, ...eyes, ...horns]) {
            m.position.sub(NECK);
            this.head.add(m);
        }
        this.root.add(body, this.head, leg, this.stompLeg);

        const armGeo = new CylinderGeometry(0.3, 0.26, 1.6, 7).translate(0, -0.8, 0);
        const stickGeo = new CylinderGeometry(0.06, 0.06, 1.15, 5).translate(0, -2.1, 0);
        const knobGeo = new IcosahedronGeometry(0.26, 1);
        for (const s of this.shoulders) {
            const arm = new Group();
            arm.position.copy(s);
            const knob = new Mesh(knobGeo, this.mallet);
            knob.position.y = -REACH;
            const stick = new Mesh(stickGeo, this.stick);
            this.mallets.push(stick, knob);
            arm.add(new Mesh(armGeo, fur), stick, knob);
            this.arms.push(arm);
            this.root.add(arm);
        }
    }

    paint(ink: Ink): void {
        this.fur.color.copy(ink.snow).lerp(ink.frost, 0.25);
        this.face.color.copy(ink.deep).lerp(ink.frost, 0.3);
        this.eye.color.copy(ink.bg);
        this.mallet.color.copy(ink.rose);
        this.stick.color.copy(ink.warm).multiplyScalar(0.45);
        this.lens.color.copy(ink.bg);
    }

    /** Put the mallets down. */
    emptyHanded(): void {
        for (const m of this.mallets) m.visible = false;
    }

    /** Put on sunglasses: two dark lenses over the eyes and a bridge between them. */
    wearShades(): void {
        for (const side of [-1, 1]) {
            const lens = new Mesh(new BoxGeometry(0.4, 0.24, 0.08), this.lens);
            lens.position.copy(onHead(side * 0.27, 4.1, 0.66));
            lens.rotation.y = side * 0.3;
            const arm = new Mesh(new BoxGeometry(0.05, 0.05, 0.5), this.lens);
            arm.position.copy(onHead(side * 0.5, 4.12, 0.4));
            this.head.add(lens, arm);
        }
        const bridge = new Mesh(new BoxGeometry(0.2, 0.05, 0.05), this.lens);
        bridge.position.copy(onHead(0, 4.15, 0.72));
        this.head.add(bridge);
    }

    /** Light the lenses with `color` scaled by `amount`: the show reflected in them. */
    shine(color: Color, amount: number): void {
        this.lens.emissive.copy(color).multiplyScalar(amount);
    }

    /** Tip the head forward by `angle` radians: a nod. */
    nod(angle: number): void {
        this.head.rotation.x = angle;
    }

    /** Point arm `i` at `target`, given in the yeti's own frame, stretched by `reach`. */
    aim(i: number, target: Vector3, reach: number): void {
        const arm = this.arms[i];
        this.dir.copy(target).sub(arm.position).normalize();
        arm.quaternion.setFromUnitVectors(DOWN, this.dir);
        arm.scale.set(1, reach, 1);
    }

    /** The stomping leg: 0 planted, 1 lifted. */
    stomp(lift: number): void {
        this.stompLeg.rotation.x = -0.9 * lift;
        this.stompLeg.position.y = 1.3 + 0.35 * lift;
    }
}

/** A flipper's angle away from the body, by stance: up to strike, down on the hit. */
const FLAP: Record<Stance, number> = {rest: 0.2, ready: 2.5, hit: 0.75};

/** An emperor penguin in a scarf. */
export class Penguin {
    readonly root = new Group();
    private readonly coat = new MeshLambertMaterial({flatShading: true});
    private readonly belly = new MeshLambertMaterial({flatShading: true});
    private readonly beak = new MeshLambertMaterial({flatShading: true});
    /** The gold at the ears and the throat. */
    private readonly gold = new MeshLambertMaterial({flatShading: true});
    private readonly scarf = new MeshLambertMaterial({flatShading: true});
    private readonly eye = new MeshLambertMaterial();
    private readonly flippers: Group[] = [];
    private readonly body = new Group();

    constructor() {
        const {coat, belly, beak, gold, scarf, eye} = this;
        const torso = ball(coat, 0.8, v(0, 1.15, 0), v(0.85, 1.35, 0.75));
        const front = ball(belly, 0.7, v(0, 1.05, 0.28), v(0.75, 1.15, 0.5));
        const head = ball(coat, 0.5, v(0, 2.35, 0), v(1, 1, 1));
        const ears = [-1, 1].map((side) => ball(gold, 0.2, v(side * 0.38, 2.22, 0.12), v(0.45, 1, 0.8)));
        const throat = ball(gold, 0.32, v(0, 1.95, 0.32), v(0.8, 0.5, 0.4));
        const bill = new Mesh(new ConeGeometry(0.12, 0.5, 5).rotateX(Math.PI / 2), beak);
        bill.position.set(0, 2.28, 0.58);
        const eyes = [-0.18, 0.18].map((x) => ball(eye, 0.08, v(x, 2.45, 0.42), v(1, 1, 1)));
        const feet = [-0.3, 0.3].map((x) => {
            const f = new Mesh(new BoxGeometry(0.3, 0.1, 0.45), beak);
            f.position.set(x, 0.05, 0.2);
            return f;
        });
        const tail = new Mesh(new ConeGeometry(0.22, 0.45, 5).rotateX(-2.2), coat);
        tail.position.set(0, 0.3, -0.55);
        const wrap = new Mesh(new TorusGeometry(0.42, 0.11, 5, 12).rotateX(Math.PI / 2), scarf);
        wrap.position.y = 1.92;
        const end = new Mesh(new BoxGeometry(0.2, 0.6, 0.06), scarf);
        end.position.set(0.22, 1.62, 0.42);
        end.rotation.z = 0.15;
        this.body.add(torso, front, head, ...ears, throat, bill, ...eyes, ...feet, tail, wrap, end);
        // A flipper is a paddle: flat, broad at the shoulder, tapering to the tip.
        const flipGeo = new CylinderGeometry(0.11, 0.05, 1.1, 6).scale(1, 1, 2.2).translate(0, -0.55, 0);
        for (const side of [-1, 1]) {
            const f = new Group();
            f.position.set(side * 0.62, 1.75, 0);
            f.add(new Mesh(flipGeo, coat));
            this.flippers.push(f);
            this.body.add(f);
        }
        this.root.add(this.body);
    }

    paint(ink: Ink): void {
        this.coat.color.copy(ink.bg).lerp(ink.deep, 0.55);
        this.belly.color.copy(ink.snow);
        this.beak.color.copy(ink.warm);
        this.gold.color.copy(ink.warm).lerp(ink.snow, 0.2);
        this.scarf.color.copy(ink.rose);
        this.eye.color.copy(ink.bg);
    }

    /** Left flipper (the drum) and right flipper (the chimes). */
    pose(left: Stance, right: Stance): void {
        this.flippers[0].rotation.z = -FLAP[left];
        this.flippers[1].rotation.z = FLAP[right];
        this.body.rotation.x = left === 'hit' || right === 'hit' ? 0.12 : 0;
    }

    /** Off the ground by `lift` (0 to 1): a hop. */
    hop(lift: number): void {
        this.body.position.y = 0.4 * lift;
    }
}
