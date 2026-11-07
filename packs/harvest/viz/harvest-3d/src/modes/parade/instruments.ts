/**
 * The band's three horns, each a plain outline that reads at frame size:
 * a trumpet is a short flared tube, a trombone a long one with a slide under
 * it, a sousaphone a ring round the body under a big bell over the
 * head. Every horn pivots at the player's mouth with its bell out along +x;
 * the sousaphone's frame is the player's hip.
 */

import {BoxGeometry, LatheGeometry, TorusGeometry, Vector2} from 'three';

/**
 * A horn: a thin tube from the mouth at x = 0 that flares, over its last
 * third, to an open bell of `radius` at x = `length`.
 */
function flare(radius: number, length: number, tube: number): LatheGeometry {
    const profile = [
        new Vector2(tube, 0), new Vector2(tube, length * 0.62), new Vector2(tube * 1.8, length * 0.82),
        new Vector2(radius * 0.55, length * 0.95), new Vector2(radius, length),
    ];
    const g = new LatheGeometry(profile, 10);
    g.rotateZ(-Math.PI / 2);
    return g;
}

export const TRUMPET_BELL = 0.65;
export const trumpetGeometry = (): LatheGeometry => flare(0.2, TRUMPET_BELL, 0.05);

export const TROMBONE_BELL = 1.1;
export const tromboneGeometry = (): LatheGeometry => flare(0.28, TROMBONE_BELL, 0.05);

/** How far the slide runs out: from first position (the highest notes) to the lowest. */
export const SLIDE_RUN = 0.4;
/** The slide: a flat bar under the trombone, from the mouth forward, and the crook at its end. */
export function slideGeometry(): BoxGeometry {
    const g = new BoxGeometry(0.85, 0.08, 0.1);
    g.translate(0.45, -0.22, 0);
    return g;
}

/** The ring of tubing round the player's body, over the left shoulder and under the right arm. */
export function sousaRingGeometry(): TorusGeometry {
    const g = new TorusGeometry(0.46, 0.08, 6, 14);
    g.rotateX(Math.PI / 2);
    g.rotateZ(0.45);
    g.translate(0, 0.75, 0);
    return g;
}

/** The sousaphone's bell sits above the head, facing forward: its mouth is this far out. */
export const SOUSA_BELL_X = 0.55;
export const SOUSA_BELL_Y = 2.2;
export function sousaBellGeometry(): LatheGeometry {
    const g = flare(0.55, 0.8, 0.09);
    g.translate(SOUSA_BELL_X - 0.8, 0, 0);
    return g;
}
