/**
 * A seated drummer's kit and arms: what the kit shows (a flash per piece,
 * decaying, in the team's colour) and where each hand is for it. Strokes are
 * relative to the drummer's foot; the pack draws the arms and the kit in its
 * own colours.
 */

import type {Pt} from './pen.js';

export type KitPiece = 'kick' | 'snare' | 'hat' | 'tom' | 'crash';

export const PIECES: readonly KitPiece[] = ['kick', 'snare', 'hat', 'tom', 'crash'];

export interface KitFlash {
    kick: number;
    snare: number;
    hat: number;
    tom: number;
    crash: number;
    /** Flips on every snare hit, so rolls alternate hands. */
    snareHand: number;
    /** The last tom hit was the floor tom. */
    floorTom: boolean;
    kickCss: string;
    snareCss: string;
    hatCss: string;
    tomCss: string;
    crashCss: string;
}

export function idleKit(): KitFlash {
    return {
        kick: 0, snare: 0, hat: 0, tom: 0, crash: 0, snareHand: 0, floorTom: false,
        kickCss: '', snareCss: '', hatCss: '', tomCss: '', crashCss: '',
    };
}

/** Pelvis sits this far above the riser, behind the kick. */
export const SEAT = 19;

/** Elbow, hand and stick tip, relative to the drummer's foot. */
export interface Stroke {
    elbow: Pt;
    hand: Pt;
    tip: Pt;
}

/** A target played down (stick on the head) and up (stick cocked over it). */
interface Target {
    down: Stroke;
    up: Stroke;
}

export const SHOULDER_L: Pt = [-5, -30];
export const SHOULDER_R: Pt = [5, -30];

/** Viewer's left hand: rack tom, floor tom, crash, and every other snare stroke. */
const LEFT = {
    tom: {
        down: {elbow: [-11, -24], hand: [-10, -31], tip: [-14, -27]},
        up: {elbow: [-11, -25], hand: [-10, -35], tip: [-13, -43]},
    },
    floor: {
        down: {elbow: [-12, -24], hand: [-18, -26], tip: [-26, -19]},
        up: {elbow: [-12, -25], hand: [-17, -30], tip: [-22, -38]},
    },
    crash: {
        down: {elbow: [-11, -33], hand: [-17, -39], tip: [-28, -45]},
        up: {elbow: [-11, -34], hand: [-17, -42], tip: [-24, -50]},
    },
    snare: {
        down: {elbow: [-8, -24], hand: [-1, -27], tip: [8, -24]},
        up: {elbow: [-10, -25], hand: [-8, -31], tip: [-11, -39]},
    },
} as const satisfies Record<string, Target>;

/** Viewer's right hand: hats and snare. */
const RIGHT = {
    snare: {
        down: {elbow: [10, -24], hand: [8, -29], tip: [15, -24]},
        up: {elbow: [10, -25], hand: [9, -33], tip: [13, -41]},
    },
    hat: {
        down: {elbow: [11, -33], hand: [18, -36], tip: [28, -36]},
        up: {elbow: [11, -34], hand: [18, -39], tip: [26, -44]},
    },
} as const satisfies Record<string, Target>;

const REST_L: Stroke = {elbow: [-10, -24], hand: [-10, -30], tip: [-15, -36]};
const REST_R: Stroke = {elbow: [10, -24], hand: [9, -30], tip: [14, -36]};

/** Above this the stick is on the head; above `UP` it is still cocked over it. */
export const DOWN = 0.55;
const UP = 0.12;

/** Snare strokes alternate hands, unless the other hand is busy: the right hand plays the hats, the left the toms and the crash. */
function snareLeft(k: KitFlash): boolean {
    if (k.hat >= k.snare) return true;
    if (Math.max(k.tom, k.crash) >= k.snare) return false;
    return k.snareHand === 1;
}

/** Each hand plays whichever of its pieces was hit last. */
export function leftStroke(k: KitFlash): Stroke {
    const snare = snareLeft(k) ? k.snare : 0;
    let v = k.tom;
    let t: Target = k.floorTom ? LEFT.floor : LEFT.tom;
    if (k.crash > v) {
        v = k.crash;
        t = LEFT.crash;
    }
    if (snare > v) {
        v = snare;
        t = LEFT.snare;
    }
    return v > DOWN ? t.down : v > UP ? t.up : REST_L;
}

export function rightStroke(k: KitFlash): Stroke {
    const snare = snareLeft(k) ? 0 : k.snare;
    const t = k.hat >= snare ? RIGHT.hat : RIGHT.snare;
    const v = Math.max(k.hat, snare);
    return v > DOWN ? t.down : v > UP ? t.up : REST_R;
}

export function hot(amount: number, css: string, idle: string): string {
    return amount > 0.35 && css ? css : idle;
}
