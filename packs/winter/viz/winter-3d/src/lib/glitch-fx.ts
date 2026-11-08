/**
 * What a mode draws for the glitches in `glitch.ts`. A choke cracks the lens:
 * from a few impacts the cracks grow through the silence, the lens frosts
 * over, and on the onset that breaks it the pieces fly out. A stutter jumps
 * the camera to a new offset on each loop, a hard cut, never a move.
 *
 * Call `update` after the mode places its camera, with the real cycle (not
 * the looped one), so the cracks and the jumps keep time with the song.
 */

import {
    AdditiveBlending, Color, Group, InstancedMesh, Mesh, MeshBasicMaterial, Object3D, type PerspectiveCamera,
    PlaneGeometry, type Scene, Vector3,
} from 'three';
import {chokeAt, chokeBroken, LOOP, SHATTER, type Sounded, stutterStart} from './glitch.js';
import type {Ink} from './ink.js';

const MAX_SEGS = 240;
/** The overlay's distance in front of the camera; inside the far plane, past the near one. */
const DEPTH = 0.5;
const THICK = 0.009;

interface Seg {
    x: number;
    y: number;
    angle: number;
    length: number;
    /** When it appears, as a fraction of the choke. */
    birth: number;
}

export class GlitchFx {
    private readonly root = new Group();
    private readonly segs: InstancedMesh;
    private readonly segMat = new MeshBasicMaterial({blending: AdditiveBlending, transparent: true, depthTest: false, depthWrite: false});
    private readonly frost: Mesh;
    private readonly frostMat = new MeshBasicMaterial({transparent: true, depthTest: false, depthWrite: false, opacity: 0});
    private readonly dummy = new Object3D();
    private readonly base = new Color();
    private readonly right = new Vector3();
    private readonly up = new Vector3();
    private pattern: Seg[] = [];
    private seed = Number.NaN;

    constructor(scene: Scene) {
        this.segs = new InstancedMesh(new PlaneGeometry(1, 1), this.segMat, MAX_SEGS);
        this.segs.frustumCulled = false;
        this.segs.renderOrder = 20;
        this.frost = new Mesh(new PlaneGeometry(1, 1), this.frostMat);
        this.frost.renderOrder = 19;
        this.frost.position.z = -DEPTH * 1.01;
        this.root.add(this.frost, this.segs);
        this.root.visible = false;
        scene.add(this.root);
    }

    paint(ink: Ink): void {
        this.base.copy(ink.snow);
        this.frostMat.color.copy(ink.frost).lerp(ink.snow, 0.5);
    }

    update(cycle: number, notes: readonly Sounded[], camera: PerspectiveCamera): void {
        this.jump(cycle, notes, camera);
        this.crack(cycle, notes, camera);
    }

    /** Inside a stutter, a hard offset that changes once a loop. */
    private jump(cycle: number, notes: readonly Sounded[], camera: PerspectiveCamera): void {
        const start = stutterStart(notes, cycle);
        if (start === null) return;
        const loop = Math.floor((cycle - start) / LOOP);
        const rand = mulberry(Math.round(start * 960) * 31 + loop);
        const sx = rand() < 0.5 ? -1 : 1;
        const sy = rand() < 0.5 ? -1 : 1;
        camera.updateMatrixWorld();
        this.right.setFromMatrixColumn(camera.matrixWorld, 0);
        this.up.setFromMatrixColumn(camera.matrixWorld, 1);
        camera.position.addScaledVector(this.right, sx * (0.25 + 0.45 * rand()));
        camera.position.addScaledVector(this.up, sy * (0.1 + 0.3 * rand()));
        camera.rotateZ((rand() - 0.5) * 0.14);
        camera.updateMatrixWorld();
    }

    private crack(cycle: number, notes: readonly Sounded[], camera: PerspectiveCamera): void {
        const choke = chokeAt(notes, cycle);
        const broken = choke ? null : chokeBroken(notes, cycle);
        const hole = choke ?? broken;
        if (!hole) {
            this.root.visible = false;
            return;
        }
        this.root.visible = true;
        this.pin(camera);
        const seed = Math.round(hole.from * 960);
        if (seed !== this.seed) {
            this.seed = seed;
            this.pattern = cracks(seed, camera.aspect);
        }

        // Fast at first, so even a half-beat hole reads as cracked.
        const grown = choke ? Math.sqrt(Math.min(1, (cycle - hole.from) / (hole.to - hole.from))) : 1;
        const flying = broken ? Math.min(1, (cycle - hole.to) / SHATTER) : 0;
        const {dummy} = this;
        let shown = 0;
        for (const seg of this.pattern) {
            if (seg.birth > grown) continue;
            // On the break each piece flies out from the middle of the frame.
            const out = 1 + 1.8 * flying;
            dummy.position.set(seg.x * out, seg.y * out, -DEPTH);
            dummy.rotation.set(0, 0, seg.angle + flying * (seg.birth - 0.5) * 2);
            dummy.scale.set(seg.length, THICK * (1 + flying), 1);
            dummy.updateMatrix();
            this.segs.setMatrixAt(shown++, dummy.matrix);
        }
        this.segs.count = shown;
        this.segs.instanceMatrix.needsUpdate = true;
        this.segMat.color.copy(this.base).multiplyScalar(0.9 * (1 - flying));
        this.frostMat.opacity = 0.3 * grown * (1 - flying);
    }

    /** Hold the overlay in front of the camera, scaled so a unit is half the frame's height. */
    private pin(camera: PerspectiveCamera): void {
        camera.updateMatrixWorld();
        this.root.position.copy(camera.position);
        this.root.quaternion.copy(camera.quaternion);
        const half = Math.tan((camera.fov * Math.PI) / 360) * DEPTH;
        this.root.scale.set(half / DEPTH, half / DEPTH, 1);
        this.frost.scale.set(2 * camera.aspect * DEPTH, 2 * DEPTH, 1);
    }
}

/**
 * A crack pattern in overlay units (y from -DEPTH to DEPTH, scaled to the
 * frame by `pin`): a few impacts, each a ring of short chords and branches
 * that wander out from it, each segment born a little later than the last.
 */
function cracks(seed: number, aspect: number): Seg[] {
    const rand = mulberry(seed);
    const segs: Seg[] = [];
    const impacts = 2 + Math.floor(rand() * 2);
    const w = DEPTH * aspect;
    for (let i = 0; i < impacts && segs.length < MAX_SEGS; i++) {
        const cx = (rand() * 1.6 - 0.8) * w;
        const cy = (rand() * 1.4 - 0.7) * DEPTH;
        const delay = (i / impacts) * 0.5;
        const ring = 0.03 + 0.03 * rand();
        const sides = 7;
        for (let k = 0; k < sides; k++) {
            const a0 = (k / sides) * Math.PI * 2;
            const a1 = ((k + 1) / sides) * Math.PI * 2;
            push(segs, cx + Math.cos(a0) * ring, cy + Math.sin(a0) * ring, cx + Math.cos(a1) * ring, cy + Math.sin(a1) * ring, delay);
        }
        const branches = 6 + Math.floor(rand() * 4);
        for (let b = 0; b < branches; b++) {
            let angle = (b / branches) * Math.PI * 2 + (rand() - 0.5) * 0.6;
            let x = cx;
            let y = cy;
            const steps = 5 + Math.floor(rand() * 5);
            for (let s = 0; s < steps && segs.length < MAX_SEGS; s++) {
                angle += (rand() - 0.5) * 0.7;
                const len = DEPTH * (0.07 + 0.11 * rand());
                const nx = x + Math.cos(angle) * len;
                const ny = y + Math.sin(angle) * len;
                push(segs, x, y, nx, ny, delay + (1 - delay) * 0.9 * ((s + 1) / steps));
                x = nx;
                y = ny;
            }
        }
    }
    return segs;
}

function push(segs: Seg[], x0: number, y0: number, x1: number, y1: number, birth: number): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    segs.push({x: (x0 + x1) / 2, y: (y0 + y1) / 2, angle: Math.atan2(dy, dx), length: Math.hypot(dx, dy), birth});
}

function mulberry(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
