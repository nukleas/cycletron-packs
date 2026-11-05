/**
 * One WebGL renderer for every three.js mode in the page. The host hands a
 * mode a 2D context and never disposes a mode, so a renderer per mode would
 * leak a GL context on every entry; the browser drops the oldest past ~16.
 * A mode renders its scene here, then draws the GL canvas onto the host's.
 */

import {WebGLRenderer, type Camera, type Scene} from 'three';

let shared: WebGLRenderer | null = null;

function renderer(): WebGLRenderer {
    shared ??= new WebGLRenderer({canvas: document.createElement('canvas'), antialias: true, alpha: false});
    return shared;
}

/** Render `scene` at the host canvas's pixel size and composite it onto `ctx`. */
export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, camera: Camera, width: number, height: number, dpr: number): void {
    const r = renderer();
    const w = Math.round(width * dpr);
    const h = Math.round(height * dpr);
    if (r.domElement.width !== w || r.domElement.height !== h) r.setSize(w, h, false);
    r.render(scene, camera);
    ctx.drawImage(r.domElement, 0, 0, width, height);
}
