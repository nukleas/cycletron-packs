/**
 * The parade's three balloon floats, built from a few low-poly parts each and
 * facing +x, the way the parade travels: a turkey with a fanned tail, a
 * pumpkin and an acorn. Each is a Group with its origin at the balloon's
 * centre; `ropeY` is how far below the centre the tethers attach.
 */

import {ConeGeometry, CylinderGeometry, Group, Mesh, type MeshLambertMaterial, SphereGeometry} from 'three';
import {pumpkinGeometry} from '../../lib/shapes.js';

export interface BalloonMats {
    body: MeshLambertMaterial;
    tail: MeshLambertMaterial[];
    beak: MeshLambertMaterial;
    wattle: MeshLambertMaterial;
    pumpkin: MeshLambertMaterial;
    stem: MeshLambertMaterial;
    nut: MeshLambertMaterial;
    cap: MeshLambertMaterial;
}

export interface Balloon {
    group: Group;
    ropeY: number;
    /** Turned toward the kerb by this much, so its face reads from the crowd. */
    yaw: number;
}

function blob(mat: MeshLambertMaterial, r: number, x: number, y: number, z: number): Mesh {
    const mesh = new Mesh(new SphereGeometry(r, 9, 6), mat);
    mesh.position.set(x, y, z);
    return mesh;
}

export function turkey(m: BalloonMats): Balloon {
    const g = new Group();
    const body = blob(m.body, 2.2, 0, 0, 0);
    body.scale.set(1.1, 0.95, 1);
    g.add(body);
    // The tail: seven feathers fanned up behind.
    for (let i = 0; i < 7; i++) {
        const a = (i / 6 - 0.5) * 2.4;
        const f = blob(m.tail[i % m.tail.length], 1, -1.6 - Math.cos(a) * 0.4, 1.4 + Math.cos(a) * 1.4, Math.sin(a) * 2.2);
        f.scale.set(0.25, 2.3, 0.75);
        f.rotation.x = -a;
        f.rotation.z = 0.35;
        g.add(f);
    }
    const head = blob(m.body, 0.85, 2.2, 1.6, 0);
    const beak = new Mesh(new ConeGeometry(0.28, 0.7, 5), m.beak);
    beak.position.set(3.15, 1.6, 0);
    beak.rotation.z = -Math.PI / 2;
    const wattle = blob(m.wattle, 0.28, 2.85, 1.05, 0);
    wattle.scale.set(0.8, 1.6, 0.8);
    const eyeL = blob(m.beak, 0.12, 2.85, 1.95, 0.45);
    const eyeR = blob(m.beak, 0.12, 2.85, 1.95, -0.45);
    g.add(head, beak, wattle, eyeL, eyeR);
    return {group: g, ropeY: -2, yaw: -0.95};
}

export function pumpkinFloat(m: BalloonMats): Balloon {
    const g = new Group();
    const body = new Mesh(pumpkinGeometry(8), m.pumpkin);
    body.scale.set(2.6, 2.6, 2.6);
    body.position.y = -1.6;
    const stem = new Mesh(new CylinderGeometry(0.22, 0.38, 1.1, 6), m.stem);
    stem.position.set(0, 2.1, 0);
    stem.rotation.z = 0.3;
    const leaf = blob(m.stem, 0.6, 0.6, 1.75, 0.3);
    leaf.scale.set(1.3, 0.25, 0.8);
    g.add(body, stem, leaf);
    return {group: g, ropeY: -1.6, yaw: 0};
}

export function acorn(m: BalloonMats): Balloon {
    const g = new Group();
    const nut = blob(m.nut, 2, 0, -0.4, 0);
    nut.scale.set(1, 1.25, 1);
    const cap = new Mesh(new SphereGeometry(2.25, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), m.cap);
    cap.position.y = 0.6;
    cap.scale.set(1, 0.7, 1);
    const tip = new Mesh(new CylinderGeometry(0.15, 0.25, 0.8, 5), m.cap);
    tip.position.y = 2.2;
    g.add(nut, cap, tip);
    return {group: g, ropeY: -2.8, yaw: 0};
}
