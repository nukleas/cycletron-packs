/**
 * Small helpers for instanced meshes and the short-lived things they draw.
 */

import {type InstancedMesh, Matrix4} from 'three';

const ZERO = new Matrix4().makeScale(0, 0, 0);

/** Collapse instance `i` to nothing: the slot is free this frame. */
export function hide(mesh: InstancedMesh, i: number): void {
    mesh.setMatrixAt(i, ZERO);
}

/** Upload the instance matrices and colours written this frame. */
export function markDirty(mesh: InstancedMesh): void {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

export interface Aging {
    age: number;
}

/** Age every item by `dt` and drop the ones past `life`. */
export function age(list: Aging[], dt: number, life: number): void {
    for (let i = list.length - 1; i >= 0; i--) {
        list[i].age += dt;
        if (list[i].age >= life) list.splice(i, 1);
    }
}
