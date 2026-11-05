/**
 * The cave's two players: a yeti with a mallet in each fist, and a penguin
 * with an ice-block drum on one side and a rack of icicle chimes on the
 * other. Both are posed per frame: the yeti by pointing each arm at a spot,
 * the penguin from a stance table per flipper.
 */

import {
    BoxGeometry, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, Mesh, type MeshLambertMaterial,
    Vector3,
} from 'three';
import type {Stance} from '@naderlabs/kit/timing';

const DOWN = new Vector3(0, -1, 0);
/** Shoulder to mallet head. */
export const REACH = 2.9;

export class Yeti {
    readonly root = new Group();
    /** Shoulders in the yeti's own frame, left (-x) then right. */
    readonly shoulders = [new Vector3(-1.25, 3.05, 0.2), new Vector3(1.25, 3.05, 0.2)];
    private readonly arms: Group[] = [];
    private readonly stompLeg = new Group();
    private readonly dir = new Vector3();

    constructor(fur: MeshLambertMaterial, face: MeshLambertMaterial, eye: MeshLambertMaterial, mallet: MeshLambertMaterial, stick: MeshLambertMaterial) {
        const body = new Mesh(new IcosahedronGeometry(1.35, 1), fur);
        body.scale.set(1, 1.3, 0.85);
        body.position.y = 2.2;
        const head = new Mesh(new IcosahedronGeometry(0.75, 1), fur);
        head.position.y = 3.95;
        const muzzle = new Mesh(new IcosahedronGeometry(0.45, 1), face);
        muzzle.scale.set(1, 0.75, 0.6);
        muzzle.position.set(0, 3.8, 0.5);
        const eyes = [-0.27, 0.27].map((x) => {
            const e = new Mesh(new IcosahedronGeometry(0.1, 0), eye);
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
        this.root.add(body, head, muzzle, ...eyes, ...horns, leg, this.stompLeg);

        const armGeo = new CylinderGeometry(0.3, 0.26, 1.6, 7).translate(0, -0.8, 0);
        const stickGeo = new CylinderGeometry(0.06, 0.06, 1.15, 5).translate(0, -2.1, 0);
        const headGeo = new IcosahedronGeometry(0.26, 1);
        for (const s of this.shoulders) {
            const arm = new Group();
            arm.position.copy(s);
            const knob = new Mesh(headGeo, mallet);
            knob.position.y = -REACH;
            arm.add(new Mesh(armGeo, fur), new Mesh(stickGeo, stick), knob);
            this.arms.push(arm);
            this.root.add(arm);
        }
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

export class Penguin {
    readonly root = new Group();
    private readonly flippers: Group[] = [];
    private readonly body = new Group();

    constructor(coat: MeshLambertMaterial, belly: MeshLambertMaterial, beak: MeshLambertMaterial, eye: MeshLambertMaterial) {
        const torso = new Mesh(new IcosahedronGeometry(0.8, 1), coat);
        torso.scale.set(0.85, 1.35, 0.75);
        torso.position.y = 1.15;
        const front = new Mesh(new IcosahedronGeometry(0.7, 1), belly);
        front.scale.set(0.75, 1.15, 0.5);
        front.position.set(0, 1.05, 0.28);
        const head = new Mesh(new IcosahedronGeometry(0.5, 1), coat);
        head.position.y = 2.35;
        const bill = new Mesh(new ConeGeometry(0.13, 0.45, 5).rotateX(Math.PI / 2), beak);
        bill.position.set(0, 2.3, 0.55);
        const eyes = [-0.18, 0.18].map((x) => {
            const e = new Mesh(new IcosahedronGeometry(0.08, 0), eye);
            e.position.set(x, 2.45, 0.42);
            return e;
        });
        const feet = [-0.3, 0.3].map((x) => {
            const f = new Mesh(new BoxGeometry(0.3, 0.1, 0.45), beak);
            f.position.set(x, 0.05, 0.2);
            return f;
        });
        this.body.add(torso, front, head, bill, ...eyes, ...feet);
        const flipGeo = new BoxGeometry(0.16, 1.1, 0.42).translate(0, -0.55, 0);
        for (const side of [-1, 1]) {
            const f = new Group();
            f.position.set(side * 0.62, 1.75, 0);
            f.add(new Mesh(flipGeo, coat));
            this.flippers.push(f);
            this.body.add(f);
        }
        this.root.add(this.body);
    }

    /** Left flipper (the drum) and right flipper (the chimes). */
    pose(left: Stance, right: Stance): void {
        this.flippers[0].rotation.z = -FLAP[left];
        this.flippers[1].rotation.z = FLAP[right];
        this.body.rotation.x = left === 'hit' || right === 'hit' ? 0.12 : 0;
    }
}
