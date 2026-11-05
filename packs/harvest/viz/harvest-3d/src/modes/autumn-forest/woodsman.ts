/**
 * A woodsman built from boxes: legs, a body that leans at the hips, and both
 * arms on one shoulder pivot holding a tool, so the tool continues the line
 * of the arms. He faces +x; turn `group` to face him elsewhere.
 *
 * Arm angles hang from the shoulder: 0 is straight down, π/2 straight out in
 * front, π overhead, taken in the body's frame, so a lean (which tips the
 * body forward from the hips) lowers the arms' angle in the world by as much.
 */

import {BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, type MeshLambertMaterial, SphereGeometry} from 'three';

export interface WoodsmanMats {
    shirt: MeshLambertMaterial;
    pants: MeshLambertMaterial;
    skin: MeshLambertMaterial;
    cap: MeshLambertMaterial;
    beard: MeshLambertMaterial;
}

export const HIP = 0.95;
export const SHOULDER = 0.78;
export const ARM = 0.66;

export class Woodsman {
    readonly group = new Group();
    private readonly body = new Group();
    private readonly arms = new Group();
    /** The tool's mount, at the hands, pointing on along the arms (-y). */
    readonly hands = new Group();

    constructor(m: WoodsmanMats, scale: number) {
        const g = this.group;
        for (const z of [-0.14, 0.14]) {
            const leg = box(0.24, HIP, 0.24, m.pants);
            leg.position.set(0, HIP / 2, z);
            g.add(leg);
        }
        this.body.position.y = HIP;
        g.add(this.body);
        const torso = box(0.46, 0.86, 0.6, m.shirt);
        torso.position.y = 0.43;
        const head = new Mesh(new SphereGeometry(0.22, 8, 6), m.skin);
        head.position.y = 1.08;
        const beard = box(0.14, 0.26, 0.32, m.beard);
        beard.position.set(0.15, 0.95, 0);
        const brim = new Mesh(new CylinderGeometry(0.26, 0.26, 0.05, 9), m.cap);
        brim.position.y = 1.24;
        const crown = new Mesh(new ConeGeometry(0.2, 0.26, 8), m.cap);
        crown.position.y = 1.38;
        this.body.add(torso, head, beard, brim, crown);

        this.arms.position.y = SHOULDER;
        this.body.add(this.arms);
        for (const z of [-0.2, 0.2]) {
            const arm = box(0.17, ARM, 0.17, m.shirt);
            arm.position.set(0, -ARM / 2, z);
            this.arms.add(arm);
        }
        this.hands.position.y = -ARM;
        this.arms.add(this.hands);
        g.scale.setScalar(scale);
    }

    pose(arm: number, lean: number): void {
        this.arms.rotation.z = arm;
        this.body.rotation.z = -lean;
    }
}

function box(w: number, h: number, d: number, mat: MeshLambertMaterial): Mesh {
    return new Mesh(new BoxGeometry(w, h, d), mat);
}

/** An axe along -y from the hands: a handle and a head at its end, blade forward. */
export function axe(handle: MeshLambertMaterial, steel: MeshLambertMaterial, length: number): Group {
    const g = new Group();
    const shaft = new Mesh(new BoxGeometry(0.07, length, 0.07), handle);
    shaft.position.y = -length / 2;
    const head = new Mesh(new BoxGeometry(0.34, 0.2, 0.08), steel);
    head.position.set(-0.1, -length + 0.06, 0);
    g.add(shaft, head);
    return g;
}
