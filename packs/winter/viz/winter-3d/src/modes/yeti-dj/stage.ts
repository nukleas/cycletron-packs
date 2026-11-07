/**
 * The show around the decks: a riser with a light strip along its lip, a
 * video wall behind the yeti, a truss of moving spots over the stage, and
 * cryo jets along the front. Every part is driven from the mode's notes in
 * `update`: nothing here keeps time of its own.
 */

import {
    AdditiveBlending, BoxGeometry, Color, ConeGeometry, DoubleSide, InstancedMesh, Mesh, MeshBasicMaterial,
    MeshStandardMaterial, Object3D, type Scene, Vector3,
} from 'three';
import type {Ink} from '../../lib/ink.js';
import {PITCHES} from './lasers.js';

export const STAGE_H = 0.5;
const STAGE = {x: 0, z: -3.2, w: 9, d: 5.5};
export const STAGE_FRONT = STAGE.z + STAGE.d / 2;
/** The wall: a tile column per pitch class, lit from the bottom up by how loud that pitch is. */
const ROWS = 9;
const TILE_W = 0.72;
const TILE_H = 0.5;
const WALL_Z = -6.4;
const WALL_Y = STAGE_H + 0.45;
/** The truss over the front of the stage, and the four spots hung on it. */
const TRUSS_Y = 6.4;
const TRUSS_Z = -1.2;
const TRUSS_W = 10;
const SPOTS = [-3.6, -1.2, 1.2, 3.6];
/** Where each spot points on each beat of the bar: the yeti on the one, then out over the crowd and back across the stage. */
const MARKS: Vector3[][] = [
    [new Vector3(-0.4, 4, -3.6), new Vector3(-0.2, 4, -3.6), new Vector3(0.2, 4, -3.6), new Vector3(0.4, 4, -3.6)],
    [new Vector3(-5, 0, 3), new Vector3(-2, 0, 4), new Vector3(2, 0, 4), new Vector3(5, 0, 3)],
    [new Vector3(2.5, STAGE_H, -2), new Vector3(3.5, STAGE_H, -1.5), new Vector3(-3.5, STAGE_H, -1.5), new Vector3(-2.5, STAGE_H, -2)],
    [new Vector3(-1, 0, 2), new Vector3(-4, 0, 1.5), new Vector3(4, 0, 1.5), new Vector3(1, 0, 2)],
];
const JETS = [-3.8, -2.2, 2.2, 3.8];
const DOWN = new Vector3(0, -1, 0);

function glowMat(): MeshBasicMaterial {
    return new MeshBasicMaterial({blending: AdditiveBlending, transparent: true, depthWrite: false, side: DoubleSide});
}

export class Show {
    private readonly riserMat = new MeshStandardMaterial({flatShading: true, roughness: 0.35});
    private readonly lipMat = new MeshBasicMaterial();
    private readonly frameMat = new MeshStandardMaterial({flatShading: true, roughness: 0.6});
    private readonly tiles: InstancedMesh;
    private readonly beams: InstancedMesh;
    private readonly jets: InstancedMesh;
    private readonly dummy = new Object3D();
    private readonly tint = new Color();
    private readonly dir = new Vector3();
    private readonly off = new Color();
    private readonly beamTints: Color[] = [];
    private readonly lipBase = new Color();

    constructor(scene: Scene) {
        const riser = new Mesh(new BoxGeometry(STAGE.w, STAGE_H, STAGE.d), this.riserMat);
        riser.position.set(STAGE.x, STAGE_H / 2, STAGE.z);
        const lip = new Mesh(new BoxGeometry(STAGE.w, 0.08, 0.08), this.lipMat);
        lip.position.set(STAGE.x, STAGE_H, STAGE_FRONT);
        scene.add(riser, lip);

        const wallW = PITCHES * TILE_W + 0.4;
        const back = new Mesh(new BoxGeometry(wallW, ROWS * TILE_H + 0.4, 0.2), this.frameMat);
        back.position.set(0, WALL_Y + (ROWS * TILE_H) / 2 - TILE_H / 2, WALL_Z - 0.15);
        this.tiles = new InstancedMesh(new BoxGeometry(TILE_W - 0.08, TILE_H - 0.08, 0.05), new MeshBasicMaterial(), PITCHES * ROWS);
        const d = this.dummy;
        for (let c = 0; c < PITCHES; c++) {
            for (let r = 0; r < ROWS; r++) {
                d.position.set((c - (PITCHES - 1) / 2) * TILE_W, WALL_Y + r * TILE_H, WALL_Z);
                d.updateMatrix();
                this.tiles.setMatrixAt(c * ROWS + r, d.matrix);
                this.tiles.setColorAt(c * ROWS + r, this.tint.setRGB(0, 0, 0));
            }
        }
        scene.add(back, this.tiles);

        // The truss: two towers and a beam across, the spots hung under it.
        for (const x of [-TRUSS_W / 2, TRUSS_W / 2]) {
            const tower = new Mesh(new BoxGeometry(0.3, TRUSS_Y, 0.3), this.frameMat);
            tower.position.set(x, TRUSS_Y / 2, TRUSS_Z);
            scene.add(tower);
        }
        const beam = new Mesh(new BoxGeometry(TRUSS_W + 0.3, 0.3, 0.3), this.frameMat);
        beam.position.set(0, TRUSS_Y, TRUSS_Z);
        scene.add(beam);
        for (const x of SPOTS) {
            const head = new Mesh(new BoxGeometry(0.35, 0.4, 0.35), this.frameMat);
            head.position.set(x, TRUSS_Y - 0.35, TRUSS_Z);
            scene.add(head);
        }
        // A spot's beam: an open cone from the head, as long as the throw.
        this.beams = new InstancedMesh(new ConeGeometry(0.42, 1, 14, 1, true).translate(0, -0.5, 0), glowMat(), SPOTS.length);
        this.beams.frustumCulled = false;
        this.beams.renderOrder = 3;
        // A cryo jet: an open cone from the lip, widening as it climbs.
        this.jets = new InstancedMesh(new ConeGeometry(0.45, 1, 10, 1, true).rotateX(Math.PI).translate(0, 0.5, 0), glowMat(), JETS.length);
        this.jets.frustumCulled = false;
        this.jets.renderOrder = 3;
        scene.add(this.beams, this.jets);
        for (let i = 0; i < SPOTS.length; i++) this.beamTints.push(new Color());
    }

    paint(ink: Ink): void {
        this.riserMat.color.copy(ink.deep).lerp(ink.bg, 0.4);
        this.riserMat.emissive.copy(ink.deep).multiplyScalar(0.15);
        this.frameMat.color.copy(ink.bg).lerp(ink.deep, 0.35);
        this.off.copy(ink.deep).multiplyScalar(0.12);
        const tints = [ink.glow, ink.ice, ink.ice, ink.glow];
        for (const [i, t] of this.beamTints.entries()) t.copy(tints[i]);
        this.lipBase.copy(ink.ice);
    }

    /** The lip flashes on the kick. */
    lip(kick: number): void {
        this.lipMat.color.copy(this.lipBase).multiplyScalar(0.25 + 0.75 * kick);
    }

    /**
     * The wall: column `c` lit from the bottom to `level[c]` of its height
     * in `color[c]`; the drop floods every tile with `flash`.
     */
    wall(level: Float32Array, color: readonly Color[], drop: number, flash: Color): void {
        const {tint} = this;
        for (let c = 0; c < PITCHES; c++) {
            const top = level[c] * ROWS;
            for (let r = 0; r < ROWS; r++) {
                const lit = Math.max(0, Math.min(1, top - r));
                tint.copy(this.off);
                if (lit > 0) tint.lerp(color[c], lit * (0.55 + 0.45 * level[c]));
                if (drop > 0) tint.lerp(flash, drop);
                this.tiles.setColorAt(c * ROWS + r, tint);
            }
        }
        if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
    }

    /** The spots step to the beat's marks, at `level` (0 to 1). */
    spots(beat: number, level: number): void {
        const d = this.dummy;
        for (const [i, x] of SPOTS.entries()) {
            d.position.set(x, TRUSS_Y - 0.55, TRUSS_Z);
            this.dir.copy(MARKS[beat][i]).sub(d.position);
            const throwLen = this.dir.length();
            d.quaternion.setFromUnitVectors(DOWN, this.dir.normalize());
            d.scale.set(1, throwLen, 1);
            d.updateMatrix();
            this.beams.setMatrixAt(i, d.matrix);
            this.beams.setColorAt(i, this.tint.copy(this.beamTints[i]).multiplyScalar(0.04 + 0.14 * level));
        }
        this.beams.instanceMatrix.needsUpdate = true;
        if (this.beams.instanceColor) this.beams.instanceColor.needsUpdate = true;
    }

    /** The jets fire on the drop and die away with it. */
    cryo(drop: number, color: Color): void {
        const d = this.dummy;
        for (const [i, x] of JETS.entries()) {
            d.position.set(x, STAGE_H, STAGE_FRONT - 0.3);
            d.quaternion.identity();
            const h = drop > 0.02 ? 2.5 + 2 * (1 - drop) : 0;
            const w = 0.6 + 1.4 * (1 - drop);
            d.scale.set(w, h, w);
            d.updateMatrix();
            this.jets.setMatrixAt(i, d.matrix);
            this.jets.setColorAt(i, this.tint.copy(color).multiplyScalar(0.5 * drop));
        }
        this.jets.instanceMatrix.needsUpdate = true;
        if (this.jets.instanceColor) this.jets.instanceColor.needsUpdate = true;
    }
}
