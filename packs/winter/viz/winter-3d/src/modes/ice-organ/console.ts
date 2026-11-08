/**
 * The organ's console: a desk with two keyboards, stepped like a real one.
 * The lower manual has twenty-four keys for the manual rank, the upper one
 * twelve wider keys for the pedal rank, both starting on C. A key goes down
 * and lights in its note's colour while its pipe sounds. Built in the yeti's
 * frame, so it turns with the yeti.
 */

import {BoxGeometry, type Color, type Group, Mesh, MeshStandardMaterial, Vector3} from 'three';
import type {Ink} from '../../lib/ink.js';

const WHITE = [0, 2, 4, 5, 7, 9, 11];
const SPAN = 3.4;
const DESK_Y = 2.225;

interface Key {
    mesh: Mesh;
    mat: MeshStandardMaterial;
    black: boolean;
    rest: number;
    /** The middle of the key's top, where a hand lands. */
    top: Vector3;
}

export class Console {
    private readonly deskMat = new MeshStandardMaterial({flatShading: true, roughness: 0.4});
    readonly lower: Key[];
    readonly upper: Key[];

    constructor(parent: Group) {
        const desk = new Mesh(new BoxGeometry(SPAN + 0.6, 0.35, 1.3), this.deskMat);
        desk.position.set(0, 2.05, 1.75);
        const stand = new Mesh(new BoxGeometry(SPAN, 1.9, 0.5), this.deskMat);
        stand.position.set(0, 0.95, 2.1);
        const step = new Mesh(new BoxGeometry(SPAN + 0.6, 0.2, 0.55), this.deskMat);
        step.position.set(0, DESK_Y + 0.1, 2.1);
        parent.add(desk, stand, step);
        this.lower = keyboard(parent, 24, DESK_Y, 1.5, 0.5);
        this.upper = keyboard(parent, 12, DESK_Y + 0.2, 2.05, 0.42);
    }

    paint(ink: Ink): void {
        this.deskMat.color.copy(ink.ice).lerp(ink.deep, 0.45);
        for (const k of [...this.lower, ...this.upper]) k.mat.color.copy(k.black ? ink.deep : ink.snow);
    }

    /** Press and light `keys` by their levels, 0 up and dark to 1 at the onset. */
    light(keys: Key[], levels: Float32Array, colors: Color[]): void {
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            const g = Math.min(1, levels[i]);
            k.mesh.position.y = k.rest - 0.05 * g;
            k.mat.emissive.copy(colors[i]).multiplyScalar(g * (k.black ? 2 : 1.3));
        }
    }
}

/** `count` keys from C across the console's span at `y`, their middle `depth` deep at `z`. */
function keyboard(parent: Group, count: number, y: number, z: number, depth: number): Key[] {
    const whites = Math.round((count / 12) * WHITE.length);
    const w = SPAN / whites;
    const keys: Key[] = [];
    for (let s = 0; s < count; s++) {
        const pc = s % 12;
        const octave = Math.floor(s / 12);
        const white = WHITE.indexOf(pc);
        const black = white < 0;
        // A black key sits on the line between the white keys either side of it.
        const slot = black ? octave * 7 + WHITE.indexOf(pc - 1) + 1 : octave * 7 + white + 0.5;
        const x = -SPAN / 2 + slot * w;
        const mat = new MeshStandardMaterial({flatShading: true, roughness: 0.35});
        const kw = black ? w * 0.55 : w * 0.92;
        const kd = black ? depth * 0.6 : depth;
        const rest = y + (black ? 0.09 : 0.04);
        const mesh = new Mesh(new BoxGeometry(kw, black ? 0.1 : 0.08, kd), mat);
        const kz = black ? z + depth * 0.2 : z;
        mesh.position.set(x, rest, kz);
        parent.add(mesh);
        keys.push({mesh, mat, black, rest, top: new Vector3(x, rest + 0.06, kz - kd * 0.2)});
    }
    return keys;
}
