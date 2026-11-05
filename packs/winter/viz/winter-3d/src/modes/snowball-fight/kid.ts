/**
 * A kid behind a snow fort: a puffy jacket, a head in a bobble hat, a
 * throwing arm with a snowball in its mitten and an arm to aim with. Built
 * facing +x; the right-hand fort's kids are turned around. Posed from a
 * stance table, so it snaps between rest, cocked and thrown.
 */

import {BoxGeometry, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, Mesh, type MeshLambertMaterial} from 'three';
import type {Stance} from '@naderlabs/kit/timing';

const BODY = new CylinderGeometry(0.42, 0.56, 1.15, 7).translate(0, 0.575, 0);
const HEAD = new IcosahedronGeometry(0.34, 1);
const HAT = new ConeGeometry(0.34, 0.42, 7).translate(0, 0.21, 0);
const BOBBLE = new IcosahedronGeometry(0.13, 0);
const ARM = new BoxGeometry(0.28, 0.95, 0.28).translate(0, -0.47, 0);
const MITTEN = new IcosahedronGeometry(0.2, 0);
const BALL = new IcosahedronGeometry(0.2, 1);

/** Arm angles about the kid's side axis: 0 hangs down, positive swings toward the other fort. */
interface Grip {
    arm: number;
    aim: number;
    lean: number;
}

const GRIP: Record<Stance, Grip> = {
    rest: {arm: 0.35, aim: 0.25, lean: 0},
    ready: {arm: -2.7, aim: 1.5, lean: -0.3},
    hit: {arm: 2.1, aim: -0.6, lean: 0.4},
};

export class Kid {
    readonly root = new Group();
    private readonly body = new Group();
    private readonly arm = new Group();
    private readonly aim = new Group();
    private readonly ball: Mesh;

    constructor(jacket: MeshLambertMaterial, skin: MeshLambertMaterial, wool: MeshLambertMaterial, snow: MeshLambertMaterial) {
        const torso = new Mesh(BODY, jacket);
        const head = new Mesh(HEAD, skin);
        head.position.y = 1.45;
        const hat = new Mesh(HAT, wool);
        hat.position.y = 1.62;
        const bobble = new Mesh(BOBBLE, snow);
        bobble.position.y = 2.05;
        this.arm.position.set(0, 1.05, 0.5);
        this.arm.add(new Mesh(ARM, jacket));
        const mitten = new Mesh(MITTEN, wool);
        mitten.position.y = -0.98;
        this.ball = new Mesh(BALL, snow);
        this.ball.position.y = -1.2;
        this.arm.add(mitten, this.ball);
        this.aim.position.set(0, 1.05, -0.5);
        this.aim.add(new Mesh(ARM, jacket));
        const mitten2 = new Mesh(MITTEN, wool);
        mitten2.position.y = -0.98;
        this.aim.add(mitten2);
        this.body.add(torso, head, hat, bobble, this.arm, this.aim);
        this.root.add(this.body);
    }

    /** `duck` 0..1 is how hard a snowball just hit the wall in front; `cheer` throws both arms up. */
    pose(s: Stance, duck: number, cheer: boolean): void {
        const g = GRIP[s];
        const up = cheer && s === 'rest';
        this.arm.rotation.z = up ? 2.9 : g.arm;
        this.aim.rotation.z = up ? 2.9 : g.aim;
        this.body.rotation.z = -g.lean - duck * 0.3;
        this.body.position.y = -duck * 0.45;
        this.ball.visible = s !== 'hit';
    }
}
