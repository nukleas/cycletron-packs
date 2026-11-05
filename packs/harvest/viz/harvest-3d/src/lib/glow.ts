/**
 * Soft light without post-processing: a radial falloff texture on additive
 * quads. With additive blending a quad's colour is its brightness, so black
 * draws nothing and an instance colour fades a glow in and out.
 */

import {AdditiveBlending, CanvasTexture, DoubleSide, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace} from 'three';

let disc: CanvasTexture | null = null;

/** A white radial falloff, shared by every glow in the pack. */
export function glowTexture(): CanvasTexture {
    if (disc) return disc;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const g = canvas.getContext('2d');
    if (g) {
        const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
        grad.addColorStop(0.6, 'rgba(255,255,255,0.12)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 64, 64);
    }
    disc = new CanvasTexture(canvas);
    disc.colorSpace = SRGBColorSpace;
    return disc;
}

/** An additive glow material; the colour (or instance colour) is its brightness. */
export function glowMaterial(): MeshBasicMaterial {
    return new MeshBasicMaterial({map: glowTexture(), blending: AdditiveBlending, transparent: true, depthWrite: false,
        side: DoubleSide, fog: false});
}

/** The unit quad glows are drawn on. */
export const GLOW_QUAD = new PlaneGeometry(1, 1);
