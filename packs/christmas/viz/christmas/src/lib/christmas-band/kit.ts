/** What the drum kit shows: a flash per piece, decaying, in the team's colour. */

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
