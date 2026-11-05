/**
 * One corn stalk, built by hand as a flat-shaded triangle list rooted at the
 * origin: a tapering stem, five drooping blades and a tassel. Its vertex
 * colours are a grey shade (dark at the root, bright at the tassel) that the
 * instance colour tints.
 */

import {BufferGeometry, Float32BufferAttribute} from 'three';

export const STALK_HEIGHT = 3;

export function stalkGeometry(): BufferGeometry {
    const pos: number[] = [];
    const shade: number[] = [];
    const tri = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) => {
        pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
        for (const y of [ay, by, cy]) {
            const v = y > STALK_HEIGHT ? 1.35 : 0.5 + 0.5 * (y / STALK_HEIGHT);
            shade.push(v, v, v);
        }
    };

    // Stem: a four-sided taper.
    const r0 = 0.08;
    const r1 = 0.03;
    for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2;
        const b = ((k + 1) / 4) * Math.PI * 2;
        const [ax, az, bx, bz] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b)];
        tri(ax * r0, 0, az * r0, bx * r0, 0, bz * r0, ax * r1, STALK_HEIGHT, az * r1);
        tri(bx * r0, 0, bz * r0, bx * r1, STALK_HEIGHT, bz * r1, ax * r1, STALK_HEIGHT, az * r1);
    }

    // Blades: out, up, then drooping to a tip, turning round the stem.
    for (let i = 0; i < 5; i++) {
        const h = 0.6 + i * 0.42;
        const a = i * 2.4;
        const len = 1.15 - i * 0.12;
        const [dx, dz] = [Math.cos(a), Math.sin(a)];
        const [sx, sz] = [-dz * 0.09, dx * 0.09];
        const mid = [dx * len * 0.5, h + 0.3, dz * len * 0.5];
        const tip = [dx * len, h - 0.1, dz * len];
        tri(sx, h, sz, -sx, h, -sz, mid[0] + sx, mid[1], mid[2] + sz);
        tri(-sx, h, -sz, mid[0] - sx, mid[1], mid[2] - sz, mid[0] + sx, mid[1], mid[2] + sz);
        tri(mid[0] + sx, mid[1], mid[2] + sz, mid[0] - sx, mid[1], mid[2] - sz, tip[0], tip[1], tip[2]);
    }

    // Tassel: three spikes splaying from the top.
    for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        const [dx, dz] = [Math.cos(a) * 0.28, Math.sin(a) * 0.28];
        const [sx, sz] = [-Math.sin(a) * 0.04, Math.cos(a) * 0.04];
        tri(sx, STALK_HEIGHT, sz, -sx, STALK_HEIGHT, -sz, dx, STALK_HEIGHT + 0.55, dz);
    }

    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(shade, 3));
    g.computeVertexNormals();
    return g;
}
