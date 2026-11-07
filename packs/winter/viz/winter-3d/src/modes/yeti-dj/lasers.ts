/**
 * The laser fan: a beam per pitch class and register, from one rig over the
 * decks out into the cave. A pitch always has the same beam: across the fan
 * from C on the left to B on the right, and bass low, mids level, leads
 * high. Unlit beams are hidden, so the fan is drawn only by the music.
 */

import {
    AdditiveBlending, BoxGeometry, Color, InstancedMesh, MeshBasicMaterial, Object3D, Vector3,
} from 'three';

export const PITCHES = 12;
export const REGISTERS = 3;
export const BEAMS = PITCHES * REGISTERS;
/** The fan's spread across, and each register's tilt from level (down is negative). */
const SPREAD = 1.1;
const TILT = [-0.22, -0.04, 0.16];
const LENGTH = 18;
const WIDTH = 0.04;

export class Lasers {
    readonly mesh: InstancedMesh;
    private readonly dummy = new Object3D();
    private readonly tint = new Color();

    constructor(private readonly origin: Vector3) {
        const g = new BoxGeometry(WIDTH, WIDTH, 1).translate(0, 0, 0.5);
        this.mesh = new InstancedMesh(g, new MeshBasicMaterial({blending: AdditiveBlending, transparent: true, depthWrite: false}), BEAMS);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 3;
        for (let b = 0; b < BEAMS; b++) this.mesh.setColorAt(b, this.tint.setRGB(0, 0, 0));
    }

    /**
     * Draw beam `b` at `level` (0 hides it) in `color`; a hit widens it by
     * `punch` (0 to 1).
     */
    set(b: number, level: number, color: Color, punch: number): void {
        const d = this.dummy;
        const across = (b % PITCHES) / (PITCHES - 1) - 0.5;
        d.position.copy(this.origin);
        d.rotation.set(-TILT[Math.floor(b / PITCHES)], across * SPREAD * 2, 0, 'YXZ');
        const w = level > 0 ? 1 + 1.2 * punch : 0;
        d.scale.set(w, w, LENGTH);
        d.updateMatrix();
        this.mesh.setMatrixAt(b, d.matrix);
        this.mesh.setColorAt(b, this.tint.copy(color).multiplyScalar(level));
    }

    commit(): void {
        this.mesh.instanceMatrix.needsUpdate = true;
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
}

/** The beam for a pitched note of a register (0 bass, 1 mid, 2 lead). */
export function beamOf(note: number, register: number): number {
    const pc = ((Math.round(note) % PITCHES) + PITCHES) % PITCHES;
    return register * PITCHES + pc;
}
