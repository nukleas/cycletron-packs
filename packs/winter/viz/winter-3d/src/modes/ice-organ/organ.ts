/**
 * The organ: a pedal rank of twelve tall pipes at the back, one per pitch
 * class, and a manual rank of twenty-four in front, two chromatic octaves.
 * Lower notes are longer pipes, so both ranks fall left to right, and a
 * semitone is always the next pipe over. A beam of ice crowns the pedal rank.
 */

import {
    AdditiveBlending, BoxGeometry, type Color, CylinderGeometry, InstancedMesh, Mesh, MeshBasicMaterial,
    MeshStandardMaterial, Object3D, type Scene, Vector3,
} from 'three';
import type {Ink} from '../../lib/ink.js';

export const PEDALS = 12;
export const MANUALS = 24;
const PEDAL_Z = -7.6;
const MANUAL_Z = -6.4;
const WIDTH = 5.4;

interface Rank {
    pipes: InstancedMesh;
    shells: InstancedMesh;
    /** The top of each pipe, for anything aimed at it. */
    tops: Vector3[];
    heights: number[];
}

export class Organ {
    private readonly pipeMat = new MeshStandardMaterial({flatShading: true, roughness: 0.25});
    private readonly shellMat = new MeshBasicMaterial({blending: AdditiveBlending, transparent: true, depthWrite: false});
    private readonly crownMat = new MeshStandardMaterial({flatShading: true, roughness: 0.3});
    private readonly dummy = new Object3D();
    readonly pedal: Rank;
    readonly manual: Rank;

    constructor(scene: Scene) {
        this.pedal = this.rank(scene, PEDALS, PEDAL_Z, 0.3, 7.2, 4.4);
        this.manual = this.rank(scene, MANUALS, MANUAL_Z, 0.15, 3.8, 1.4);
        const crown = new Mesh(new BoxGeometry(2 * WIDTH + 1.4, 0.35, 0.6), this.crownMat);
        crown.position.set(0, 7.5, PEDAL_Z);
        const plinth = new Mesh(new BoxGeometry(2 * WIDTH + 1.4, 0.5, 2.4), this.crownMat);
        plinth.position.set(0, 0.25, (PEDAL_Z + MANUAL_Z) / 2);
        scene.add(crown, plinth);
    }

    paint(ink: Ink): void {
        this.pipeMat.emissive.copy(ink.deep).multiplyScalar(0.3);
        this.crownMat.color.copy(ink.frost).lerp(ink.deep, 0.4);
    }

    /** Colour each pipe of `rank` by its level, 0 dark to 1 at the onset, in `colors`. */
    light(rank: Rank, levels: Float32Array, colors: Color[], ink: Ink, tint: Color): void {
        for (let i = 0; i < levels.length; i++) {
            const g = levels[i];
            rank.pipes.setColorAt(i, tint.copy(ink.deep).lerp(colors[i], 0.3 + 0.7 * Math.min(1, g * 1.5)));
            rank.shells.setColorAt(i, tint.copy(colors[i]).multiplyScalar(0.03 + 0.85 * g));
        }
        if (rank.pipes.instanceColor) rank.pipes.instanceColor.needsUpdate = true;
        if (rank.shells.instanceColor) rank.shells.instanceColor.needsUpdate = true;
    }

    /** The crown's flash, 0 to 1. */
    crown(ink: Ink, flash: number): void {
        this.crownMat.emissive.copy(ink.ice).multiplyScalar(0.05 + 0.9 * flash);
    }

    private rank(scene: Scene, count: number, z: number, radius: number, tall: number, short: number): Rank {
        const geo = new CylinderGeometry(radius, radius, 1, 8).translate(0, 0.5, 0);
        const pipes = new InstancedMesh(geo, this.pipeMat, count);
        const shells = new InstancedMesh(geo, this.shellMat, count);
        shells.renderOrder = 2;
        const tops: Vector3[] = [];
        const heights: number[] = [];
        const {dummy} = this;
        for (let i = 0; i < count; i++) {
            const t = i / (count - 1);
            const x = -WIDTH + 2 * WIDTH * t;
            const h = tall + (short - tall) * t;
            dummy.position.set(x, 0.5, z);
            dummy.scale.set(1, h, 1);
            dummy.updateMatrix();
            pipes.setMatrixAt(i, dummy.matrix);
            dummy.scale.set(1.35, h + 0.15, 1.35);
            dummy.updateMatrix();
            shells.setMatrixAt(i, dummy.matrix);
            // Instance colours have to exist before the first draw.
            pipes.setColorAt(i, this.crownMat.color);
            shells.setColorAt(i, this.crownMat.color);
            tops.push(new Vector3(x, 0.5 + h, z));
            heights.push(h);
        }
        scene.add(pipes, shells);
        return {pipes, shells, tops, heights};
    }
}
