/**
 * Low-poly pines, one instanced mesh: a lathe of three tiers on a trunk,
 * needles dark at each tier's skirt and snowy toward its top. A mode calls
 * `begin()`, `add()` for every tree in view, then `end()`, each frame.
 */

import {BufferAttribute, Color, InstancedMesh, LatheGeometry, MeshLambertMaterial, Object3D, Vector2} from 'three';

/** Profile (radius, height) of a 2.6-unit pine; the index tells trunk, skirt and snow apart. */
const PROFILE: readonly [number, number][] = [
    [0.001, 0], [0.12, 0], [0.12, 0.45],
    [0.9, 0.5], [0.18, 1.25], [0.7, 1.2], [0.14, 1.9], [0.5, 1.85], [0.001, 2.6],
];
const TRUNK = 3;
const SIDES = 7;

export class Pines {
    readonly mesh: InstancedMesh;
    private readonly geo: LatheGeometry;
    private readonly dummy = new Object3D();
    private readonly shade = new Color();
    private n = 0;

    constructor(private readonly max: number) {
        this.geo = new LatheGeometry(PROFILE.map(([r, y]) => new Vector2(r, y)), SIDES);
        this.geo.setAttribute('color', new BufferAttribute(new Float32Array(this.geo.attributes.position.count * 3), 3));
        this.mesh = new InstancedMesh(this.geo, new MeshLambertMaterial({flatShading: true, vertexColors: true}), max);
        for (let i = 0; i < max; i++) this.mesh.setColorAt(i, this.shade.setRGB(1, 1, 1));
        this.mesh.count = 0;
        this.mesh.frustumCulled = false;
    }

    /** Bake the colours: `needle` at each skirt, toward `snow` at each tier's top. */
    paint(needle: Color, snow: Color, trunk: Color): void {
        const col = this.geo.attributes.color;
        const c = new Color();
        for (let i = 0; i < col.count; i++) {
            const j = i % PROFILE.length;
            if (j < TRUNK) c.copy(trunk);
            else if (j % 2 === 1) c.copy(needle);
            else c.copy(needle).lerp(snow, 0.75);
            col.setXYZ(i, c.r, c.g, c.b);
        }
        col.needsUpdate = true;
    }

    begin(): void {
        this.n = 0;
    }

    /** One tree; `shade` 0..1 darkens it, for depth and variety. */
    add(x: number, y: number, z: number, scale: number, turn: number, shade: number): void {
        if (this.n >= this.max) return;
        const {dummy} = this;
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, turn, 0);
        dummy.scale.set(scale, scale * (0.9 + 0.25 * shade), scale);
        dummy.updateMatrix();
        this.mesh.setMatrixAt(this.n, dummy.matrix);
        const v = 1 - 0.45 * shade;
        this.mesh.setColorAt(this.n, this.shade.setRGB(v, v, v));
        this.n++;
    }

    end(): void {
        this.mesh.count = this.n;
        this.mesh.instanceMatrix.needsUpdate = true;
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
}
