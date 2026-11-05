/**
 * Low-poly shapes more than one mode builds from.
 */

import {BufferGeometry, Float32BufferAttribute, SphereGeometry} from 'three';

/** A ribbed, squat pumpkin of radius 1 sitting on y = 0. */
export function pumpkinGeometry(ribs: number): SphereGeometry {
    const g = new SphereGeometry(1, ribs * 2, 7);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const a = Math.atan2(z, x);
        const rib = 1 - 0.09 * (0.5 + 0.5 * Math.cos(a * ribs));
        // Dimpled top and bottom, where the stem goes in.
        const pinch = 1 - 0.25 * Math.pow(Math.abs(y), 6);
        pos.setXYZ(i, x * rib, y * 0.66 * pinch + 0.62, z * rib);
    }
    g.computeVertexNormals();
    return g;
}

/**
 * Ground: a grid of `cols` × `rows` flat-shaded cells from (x0, z0) to
 * (x1, z1), raised by `height(x, z)`, the function that also places things
 * on it. It carries a `color` attribute for the mode to paint.
 */
export function groundGeometry(x0: number, z0: number, x1: number, z1: number, cols: number, rows: number,
    height: (x: number, z: number) => number): BufferGeometry {
    const verts: number[] = [];
    const corner = (i: number, j: number) => {
        const x = x0 + (i / cols) * (x1 - x0);
        const z = z0 + (j / rows) * (z1 - z0);
        verts.push(x, height(x, z), z);
    };
    for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
            corner(i, j); corner(i, j + 1); corner(i + 1, j);
            corner(i + 1, j); corner(i, j + 1); corner(i + 1, j + 1);
        }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(verts, 3));
    g.setAttribute('color', new Float32BufferAttribute(new Float32Array(verts.length), 3));
    g.computeVertexNormals();
    return g;
}
