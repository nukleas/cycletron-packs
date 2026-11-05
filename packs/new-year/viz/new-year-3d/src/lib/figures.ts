/**
 * Party guests as instanced blocks: legs, a torso, a head in a party hat and
 * two arms that swing from the shoulder. A mode stands each figure, then
 * swings its arms to a pose; `hand` is where the last arm placed ends, for
 * the prop it holds.
 *
 * An arm swings in the figure's side plane, so a figure facing the camera
 * reads: 0 hangs straight down, π/2 points out to the side, π straight up.
 * `fwd` tips it toward the way the figure faces.
 */

import {
    BoxGeometry, Color, ConeGeometry, CylinderGeometry, Euler, Group, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion,
    SphereGeometry, Vector3,
} from 'three';

const HIP = 0.85;
const SHOULDER = 1.5;
const SHOULDER_W = 0.36;
const ARM = 0.7;
const HEAD = 1.82;

const ZERO = new Matrix4().makeScale(0, 0, 0);
const UP = new Vector3(0, 1, 0);

export class Figures {
    readonly group = new Group();
    /** The hand of the arm `arm` last placed, and the arm's direction from shoulder to hand. */
    readonly hand = new Vector3();
    readonly reach = new Vector3();
    private readonly legs: InstancedMesh;
    private readonly torsos: InstancedMesh;
    private readonly heads: InstancedMesh;
    private readonly hats: InstancedMesh;
    private readonly arms: InstancedMesh;
    private readonly eyes: InstancedMesh;
    private readonly pos: Vector3[] = [];
    private readonly yaw: number[] = [];
    private readonly drop: number[] = [];
    private readonly m = new Matrix4();
    private readonly q = new Quaternion();
    private readonly qYaw = new Quaternion();
    private readonly e = new Euler();
    private readonly v = new Vector3();
    private readonly one = new Vector3(1, 1, 1);

    constructor(count: number, private readonly size: number) {
        const s = size;
        const mat = new MeshLambertMaterial({flatShading: true});
        const legGeo = new BoxGeometry(0.2 * s, HIP * s, 0.22 * s);
        legGeo.translate(0, (-HIP / 2) * s, 0);
        this.legs = new InstancedMesh(legGeo, mat, count * 2);
        this.torsos = new InstancedMesh(new CylinderGeometry(0.3 * s, 0.36 * s, 0.75 * s, 8), mat, count);
        this.heads = new InstancedMesh(new SphereGeometry(0.21 * s, 10, 8), mat, count);
        this.hats = new InstancedMesh(new ConeGeometry(0.14 * s, 0.42 * s, 8), mat, count);
        const armGeo = new BoxGeometry(0.15 * s, ARM * s, 0.15 * s);
        armGeo.translate(0, (-ARM / 2) * s, 0);
        this.arms = new InstancedMesh(armGeo, mat, count * 2);
        this.eyes = new InstancedMesh(new SphereGeometry(0.045 * s, 6, 4), mat, count * 2);
        const black = new Color(0, 0, 0);
        for (const mesh of [this.legs, this.torsos, this.heads, this.hats, this.arms, this.eyes]) {
            for (let i = 0; i < mesh.count; i++) mesh.setColorAt(i, black);
            mesh.frustumCulled = false;
            this.group.add(mesh);
        }
        for (let i = 0; i < count; i++) {
            this.pos.push(new Vector3());
            this.yaw.push(0);
            this.drop.push(0);
        }
    }

    /** Figure `i`'s clothes, skin and party hat. */
    dress(i: number, body: Color, skin: Color, hat: Color): void {
        this.legs.setColorAt(i * 2, body);
        this.legs.setColorAt(i * 2 + 1, body);
        this.torsos.setColorAt(i, body);
        this.arms.setColorAt(i * 2, body);
        this.arms.setColorAt(i * 2 + 1, body);
        this.heads.setColorAt(i, skin);
        this.hats.setColorAt(i, hat);
    }

    /** Stand figure `i` with its feet at (x, y, z), facing `yaw` (0 faces +z), crouched by `crouch` (0..1). */
    stand(i: number, x: number, y: number, z: number, yaw: number, crouch: number): void {
        const dip = crouch * 0.35;
        this.pos[i].set(x, y, z);
        this.yaw[i] = yaw;
        this.drop[i] = dip;
        this.qYaw.setFromAxisAngle(UP, yaw);
        for (const side of [-1, 1]) {
            this.local(i, side * 0.13, HIP - dip, 0);
            this.e.set(0, 0, -side * crouch * 0.35);
            this.q.setFromEuler(this.e).premultiply(this.qYaw);
            this.m.compose(this.v, this.q, this.one);
            this.legs.setMatrixAt(i * 2 + (side < 0 ? 0 : 1), this.m);
        }
        this.local(i, 0, HIP + 0.37 - dip, 0);
        this.m.compose(this.v, this.qYaw, this.one);
        this.torsos.setMatrixAt(i, this.m);
        this.local(i, 0, HEAD - dip, 0);
        this.m.compose(this.v, this.qYaw, this.one);
        this.heads.setMatrixAt(i, this.m);
        this.local(i, 0, HEAD + 0.36 - dip, 0);
        this.m.compose(this.v, this.qYaw, this.one);
        this.hats.setMatrixAt(i, this.m);
        // Eyes on the front of the head, so which way a guest faces reads.
        for (const side of [-1, 1]) {
            this.local(i, side * 0.08, HEAD + 0.03 - dip, 0.19);
            this.m.compose(this.v, this.qYaw, this.one);
            this.eyes.setMatrixAt(i * 2 + (side < 0 ? 0 : 1), this.m);
        }
    }

    /** Swing figure `i`'s `side` arm (-1 its left, 1 its right) to `angle`, tipped forward by `fwd`. */
    arm(i: number, side: number, angle: number, fwd: number): void {
        this.local(i, side * SHOULDER_W, SHOULDER - this.drop[i], 0);
        this.e.set(-fwd, 0, side * angle, 'ZYX');
        this.q.setFromEuler(this.e).premultiply(this.qYaw.setFromAxisAngle(UP, this.yaw[i]));
        this.m.compose(this.v, this.q, this.one);
        this.arms.setMatrixAt(i * 2 + (side < 0 ? 0 : 1), this.m);
        this.reach.set(0, -1, 0).applyQuaternion(this.q);
        this.hand.copy(this.v).addScaledVector(this.reach, ARM * this.size);
    }

    /** A point in figure `i`'s frame, scaled, into `v`. */
    private local(i: number, x: number, y: number, z: number): void {
        this.v.set(x * this.size, y * this.size, z * this.size).applyAxisAngle(UP, this.yaw[i]).add(this.pos[i]);
    }

    hide(i: number): void {
        for (const k of [0, 1]) {
            this.legs.setMatrixAt(i * 2 + k, ZERO);
            this.arms.setMatrixAt(i * 2 + k, ZERO);
            this.eyes.setMatrixAt(i * 2 + k, ZERO);
        }
        for (const mesh of [this.torsos, this.heads, this.hats]) mesh.setMatrixAt(i, ZERO);
    }

    commit(): void {
        for (const mesh of [this.legs, this.torsos, this.heads, this.hats, this.arms, this.eyes]) {
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
    }
}
