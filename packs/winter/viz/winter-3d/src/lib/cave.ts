/**
 * The ice cavern the yeti plays in: a rough dome, a snow floor, two great
 * crystal pillars the bass lights, icicles on the roof that the kicks shake,
 * and the lights. A mode adds its cave to its scene, paints it in `layout()`
 * and drives it in `update()`; what stands in the cave is the mode's own.
 */

import {clamp01, hash32, rand01, TAU} from '@cycletron/viz-sdk';
import {
    AmbientLight, BackSide, BufferAttribute, type BufferGeometry, CircleGeometry, Color, ConeGeometry, DirectionalLight,
    Fog, HemisphereLight, InstancedMesh, LatheGeometry, Mesh, MeshLambertMaterial, MeshStandardMaterial, Object3D,
    type Scene, SphereGeometry, Vector2, Vector3,
} from 'three';
import type {Ink} from './ink.js';

export const DOME = 13;
const PILLARS = [new Vector3(-6.2, 0, -5.5), new Vector3(6.2, 0, -5.5)];
const ICICLES = 46;

export class Cave {
    /** The background and the fog's colour. */
    readonly air = new Color();
    readonly fog = new Fog(0x000000, 18, 48);
    /** Ice for anything else hanging from the roof. */
    readonly iceMat = new MeshStandardMaterial({flatShading: true, roughness: 0.25});
    readonly ambient = new AmbientLight(0xffffff, 0.6);
    readonly hemi = new HemisphereLight(0xffffff, 0x000000, 1.1);
    /** The key: cold light from high over the camera's left, so the figures have a lit side. */
    readonly key = new DirectionalLight(0xffffff, 1.6);
    private readonly domeMat = new MeshStandardMaterial({flatShading: true, side: BackSide, vertexColors: true, roughness: 0.9});
    private readonly dome: Mesh;
    private readonly floorMat = new MeshLambertMaterial();
    private readonly pillarMats: MeshStandardMaterial[] = [];
    private readonly icicles: InstancedMesh;
    private readonly icicleSpots: Vector3[] = [];
    private readonly dummy = new Object3D();

    /** `target` is where the key light points: the cave's subject. */
    constructor(scene: Scene, target: Vector3) {
        scene.background = this.air;
        scene.fog = this.fog;
        this.dome = new Mesh(domeGeometry(), this.domeMat);
        this.dome.position.z = -2;
        const floor = new Mesh(new CircleGeometry(DOME + 1, 24).rotateX(-Math.PI / 2), this.floorMat);
        scene.add(this.dome, floor);

        for (let i = 0; i < 2; i++) {
            const mat = new MeshStandardMaterial({flatShading: true, roughness: 0.3});
            const m = new Mesh(new LatheGeometry([new Vector2(0, 0), new Vector2(0.9, 0), new Vector2(1, 4.2), new Vector2(0, 6)], 6), mat);
            m.position.copy(PILLARS[i]);
            m.rotation.z = (i === 0 ? 1 : -1) * 0.12;
            this.pillarMats.push(mat);
            scene.add(m);
        }

        this.icicles = new InstancedMesh(new ConeGeometry(0.22, 1, 5).rotateX(Math.PI), this.iceMat, ICICLES);
        this.icicles.frustumCulled = false;
        for (let i = 0; i < ICICLES; i++) {
            const r = (n: number) => rand01(hash32(i, 50 + n));
            const a = r(1) * TAU;
            const d = 2 + r(2) * 8;
            const x = Math.cos(a) * d;
            const z = -2 + Math.sin(a) * d * 0.8;
            const y = Math.sqrt(Math.max(0, DOME * DOME - x * x - (z + 2) * (z + 2))) * 0.82;
            this.icicleSpots.push(new Vector3(x, y, z));
        }
        scene.add(this.icicles);

        this.key.position.set(-5, 10, 8);
        this.key.target.position.copy(target);
        scene.add(this.ambient, this.hemi, this.key, this.key.target);
    }

    paint(ink: Ink): void {
        this.air.copy(ink.bg).lerp(ink.deep, 0.6);
        this.fog.color.copy(this.air);
        paintDome(this.dome.geometry, ink);
        this.floorMat.color.copy(ink.snow).multiplyScalar(0.7);
        this.iceMat.color.copy(ink.frost).lerp(ink.ice, 0.3);
        this.iceMat.emissive.copy(ink.deep).multiplyScalar(0.25);
        this.ambient.color.copy(ink.deep).lerp(ink.ice, 0.35);
        this.hemi.color.copy(ink.frost).lerp(ink.snow, 0.4);
        this.hemi.groundColor.copy(ink.deep).multiplyScalar(0.5);
        this.key.color.copy(ink.snow).lerp(ink.frost, 0.3);
    }

    /** Light the pillars by the bass, 0 to 1. */
    pulse(ink: Ink, bass: number): void {
        for (const m of this.pillarMats) m.emissive.copy(ink.glow).multiplyScalar(0.08 + 0.9 * bass);
    }

    /** Shake the icicles by a kick's strike, a new jiggle each sixteenth. */
    shake(now: number, kick: number): void {
        const {dummy} = this;
        for (let i = 0; i < ICICLES; i++) {
            const p = this.icicleSpots[i];
            const r = rand01(hash32(i, 9));
            const len = 0.8 + r * 1.6;
            const jig = kick * 0.12 * ((hash32(i, Math.floor(now * 16)) & 1) === 0 ? 1 : -1);
            dummy.position.set(p.x + jig, p.y - len / 2, p.z);
            dummy.rotation.set(0, 0, jig);
            dummy.scale.set(1, len, 1);
            dummy.updateMatrix();
            this.icicles.setMatrixAt(i, dummy.matrix);
        }
        this.icicles.instanceMatrix.needsUpdate = true;
    }
}

/** The cavern: a rough dome, its seam and rim shared so it closes. */
function domeGeometry(): BufferGeometry {
    const g = new SphereGeometry(DOME, 22, 10, 0, TAU, 0, Math.PI / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const key = hash32(Math.round(x * 3) * 977 + Math.round(z * 3), Math.round(y * 3));
        const k = y < 0.01 ? 1 : 1 + (rand01(key) - 0.5) * 0.18;
        pos.setXYZ(i, x * k, y * k * 0.85, z * k);
    }
    g.setAttribute('color', new BufferAttribute(new Float32Array(pos.count * 3), 3));
    g.computeVertexNormals();
    return g;
}

function paintDome(g: BufferGeometry, ink: Ink): void {
    const pos = g.attributes.position;
    const col = g.attributes.color;
    const c = new Color();
    for (let i = 0; i < pos.count; i++) {
        const h = clamp01(pos.getY(i) / DOME);
        c.copy(ink.deep).lerp(ink.frost, 0.2 + 0.35 * h).multiplyScalar(0.8 + 0.2 * rand01(hash32(i, 2)));
        col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
}
