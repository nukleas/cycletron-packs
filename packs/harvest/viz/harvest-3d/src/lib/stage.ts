/**
 * The scene, camera and light every harvest mode starts from: a warm low sun,
 * a sky-to-ground hemisphere fill and distance fog in the sky colour, all
 * recoloured from the theme. Rendering goes through the kit's shared renderer.
 */

import {Color, DirectionalLight, Fog, HemisphereLight, InstancedMesh, PerspectiveCamera, Scene} from 'three';
import type {VizServices} from '@cycletron/viz-sdk';
import {drawScene} from '@naderlabs/kit/gl';

export class Stage {
    readonly scene = new Scene();
    readonly camera: PerspectiveCamera;
    readonly sun = new DirectionalLight(0xffffff, 2.2);
    readonly fill = new HemisphereLight(0xffffff, 0x000000, 1.2);
    private readonly sky = new Color();
    private readonly fog: Fog;

    constructor(fov: number, near: number, far: number, fogNear: number, fogFar: number) {
        this.camera = new PerspectiveCamera(fov, 16 / 9, near, far);
        this.fog = new Fog(0x000000, fogNear, fogFar);
        this.scene.fog = this.fog;
        this.scene.background = this.sky;
        this.scene.add(this.sun, this.sun.target, this.fill);
    }

    /** Match the canvas aspect and recolour the sky, fog and lights. */
    fit(s: VizServices, sky: Color, sun: Color, ground: Color): void {
        this.camera.aspect = s.width / Math.max(1, s.height);
        this.camera.updateProjectionMatrix();
        this.sky.copy(sky);
        this.fog.color.copy(sky);
        this.sun.color.copy(sun);
        this.fill.color.copy(sky).lerp(sun, 0.35);
        this.fill.groundColor.copy(ground);
    }

    /**
     * Turn off frustum culling for every instanced mesh in the scene. three
     * computes an instanced mesh's bounds once, at its first draw, from the
     * instances where they were then; instances that move on afterwards would
     * be culled by stale bounds, and a render that starts mid-song would cull
     * differently from one that played through. Call once the scene is built.
     */
    uncull(): void {
        this.scene.traverse((o) => {
            if (o instanceof InstancedMesh) o.frustumCulled = false;
        });
    }

    draw(ctx: CanvasRenderingContext2D, s: VizServices): void {
        drawScene(ctx, this.scene, this.camera, s.width, s.height, s.dpr);
    }
}
