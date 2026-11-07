/**
 * The crowd: rows of penguins in front of the stage, seen from behind as
 * dark shapes against the show. They move as one: a hop on the kick, and
 * flippers up for the drop and the snares. They frame the stage; they are
 * never the subject.
 */

import {hash32, rand01} from '@cycletron/viz-sdk';
import {BoxGeometry, IcosahedronGeometry, InstancedMesh, MeshLambertMaterial, Object3D, type Scene} from 'three';
import type {Ink} from '../../lib/ink.js';

const ROWS = [{z: 1.4, n: 9}, {z: 2.7, n: 10}, {z: 4.0, n: 11}];
const COUNT = ROWS.reduce((n, r) => n + r.n, 0);
const SPAN = 10;
/** A flipper's angle from the body: down, and up overhead. */
const DOWN_ANGLE = 0.25;
const UP_ANGLE = 2.7;

interface Spot {
    x: number;
    z: number;
    size: number;
}

export class Crowd {
    /** One material per mesh, as instanced meshes need for the seam test. */
    private readonly mats = [0, 1, 2].map(() => new MeshLambertMaterial({flatShading: true}));
    private readonly bodies: InstancedMesh;
    private readonly heads: InstancedMesh;
    private readonly flippers: InstancedMesh;
    private readonly spots: Spot[] = [];
    private readonly dummy = new Object3D();

    constructor(scene: Scene) {
        this.bodies = new InstancedMesh(new IcosahedronGeometry(0.5, 1), this.mats[0], COUNT);
        this.heads = new InstancedMesh(new IcosahedronGeometry(0.32, 1), this.mats[1], COUNT);
        this.flippers = new InstancedMesh(new BoxGeometry(0.1, 0.6, 0.25).translate(0, -0.3, 0), this.mats[2], COUNT * 2);
        for (const m of [this.bodies, this.heads, this.flippers]) m.frustumCulled = false;
        let i = 0;
        for (const row of ROWS) {
            for (let k = 0; k < row.n; k++) {
                const r = (n: number) => rand01(hash32(i, n));
                this.spots.push({x: (k / (row.n - 1) - 0.5) * SPAN + (r(1) - 0.5) * 0.5, z: row.z + (r(2) - 0.5) * 0.4, size: 0.85 + r(3) * 0.3});
                i++;
            }
        }
        scene.add(this.bodies, this.heads, this.flippers);
    }

    paint(ink: Ink): void {
        for (const m of this.mats) m.color.copy(ink.bg).lerp(ink.deep, 0.45);
    }

    /** `hop` lifts everyone (0 to 1); `up` puts every flipper in the air. */
    pose(hop: number, up: boolean): void {
        const d = this.dummy;
        for (const [i, s] of this.spots.entries()) {
            const y = 0.4 * hop;
            d.rotation.set(0, 0, 0);
            d.position.set(s.x, s.size * (0.62 + y), s.z);
            d.scale.set(0.8 * s.size, 1.3 * s.size, 0.7 * s.size);
            d.updateMatrix();
            this.bodies.setMatrixAt(i, d.matrix);
            d.position.set(s.x, s.size * (1.45 + y), s.z);
            d.scale.setScalar(s.size);
            d.updateMatrix();
            this.heads.setMatrixAt(i, d.matrix);
            for (const side of [-1, 1]) {
                d.position.set(s.x + side * 0.38 * s.size, s.size * (1.05 + y), s.z);
                d.rotation.set(0, 0, side * (up ? UP_ANGLE : DOWN_ANGLE));
                d.updateMatrix();
                this.flippers.setMatrixAt(i * 2 + (side < 0 ? 0 : 1), d.matrix);
            }
        }
        for (const m of [this.bodies, this.heads, this.flippers]) m.instanceMatrix.needsUpdate = true;
    }
}
