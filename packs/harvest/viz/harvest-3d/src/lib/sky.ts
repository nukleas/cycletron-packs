/**
 * A sky dome: a big inside-out sphere shaded from the horizon colour up to
 * the zenith colour, unlit and out of the fog. Recolour it in `layout()`.
 */

import {BackSide, Color, Float32BufferAttribute, Mesh, MeshBasicMaterial, SphereGeometry} from 'three';

export class SkyDome {
    readonly mesh: Mesh;
    private readonly geo: SphereGeometry;
    private readonly scratch = new Color();

    constructor(radius: number) {
        this.geo = new SphereGeometry(radius, 24, 12);
        this.geo.setAttribute('color', new Float32BufferAttribute(new Float32Array(this.geo.getAttribute('position').count * 3), 3));
        this.mesh = new Mesh(this.geo, new MeshBasicMaterial({side: BackSide, vertexColors: true, fog: false, depthWrite: false}));
        this.mesh.renderOrder = -1;
    }

    /** Shade the dome: `horizon` at the horizon, `zenith` overhead, `below` under it. */
    paint(zenith: Color, horizon: Color, below: Color): void {
        const pos = this.geo.getAttribute('position');
        const rgb = this.geo.getAttribute('color');
        const r = this.geo.parameters.radius;
        for (let i = 0; i < pos.count; i++) {
            const e = pos.getY(i) / r;
            if (e >= 0) this.scratch.copy(horizon).lerp(zenith, Math.pow(e, 0.6));
            else this.scratch.copy(horizon).lerp(below, Math.min(1, -e * 4));
            rgb.setXYZ(i, this.scratch.r, this.scratch.g, this.scratch.b);
        }
        rgb.needsUpdate = true;
    }
}
