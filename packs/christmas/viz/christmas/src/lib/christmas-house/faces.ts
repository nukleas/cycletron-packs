/**
 * Faces in the windows: seven Christmas minis in a 10×12 cell, three frames
 * each, and Santa's face in the attic after a crash. At this size the hat
 * and the colour do the work; a face is three or four pixels. `accent` is
 * the track's colour.
 */

import type {Ink} from '../christmas-band/ink.js';
import type {Role} from '../christmas-band/roles.js';

export type Face = 'elf' | 'snowman' | 'reindeer' | 'ginger' | 'penguin' | 'nutcracker' | 'mrsClaus';

const FACES: readonly Face[] = ['elf', 'snowman', 'reindeer', 'ginger', 'penguin', 'nutcracker', 'mrsClaus'];

const ROLE_SHIFT: Record<Role, number> = {kick: 0, snare: 1, tom: 2, crash: 3, hat: 4, perc: 5, bass: 0, mid: 2, lead: 4};

type Rect = (x: number, y: number, w: number, h: number, color: string) => void;

/** Window face. Seed and role both move the pick, and the same hap stays put. */
export function windowFace(seed: number, role: Role): Face {
    return FACES[(seed + ROLE_SHIFT[role]) % FACES.length];
}

function pen(ctx: CanvasRenderingContext2D, ox: number, oy: number): Rect {
    const x0 = Math.round(ox);
    const y0 = Math.round(oy);
    return (x, y, w, h, color) => {
        ctx.fillStyle = color;
        ctx.fillRect(x0 + x, y0 + y, w, h);
    };
}

/** A face in the glass. Three frames, clipped to the pane. */
export function drawWindowFace(
    ctx: CanvasRenderingContext2D, face: Face, x: number, y: number, w: number, h: number,
    frame: number, accent: string, ink: Ink,
): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const ox = Math.round(x + (w - 10) / 2);
    const oy = Math.round(h >= 12 ? y + h - 12 : y);
    const r = pen(ctx, ox, oy);
    const f = frame % 3;
    switch (face) {
        case 'elf': drawElf(r, f, accent, ink); break;
        case 'snowman': drawSnowman(r, f, accent, ink); break;
        case 'reindeer': drawReindeer(r, f, accent, ink); break;
        case 'ginger': drawGinger(r, f, accent, ink); break;
        case 'penguin': drawPenguin(r, f, accent, ink); break;
        case 'nutcracker': drawNutcracker(r, f, accent, ink); break;
        case 'mrsClaus': drawMrsClaus(r, f, accent, ink); break;
    }
    ctx.restore();
}

/**
 * Santa's face for the bar after a crash, on a 10-cell grid so a 10px attic
 * pane still reads: red hat, white beard, eyes in the track's colour, and the
 * mouth going ho, ho, ho across the three frames.
 */
export function drawSanta(
    ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
    frame: number, accent: string, ink: Ink,
): void {
    const X = Math.round(x);
    const Y = Math.round(y);
    const f = frame % 3;
    ctx.fillStyle = ink.night;
    ctx.fillRect(X, Y, w, h);
    const cell = (gx: number, gy: number, gw: number, gh: number, color: string) => {
        const x1 = X + Math.floor(gx * w / 10);
        const y1 = Y + Math.floor(gy * h / 10);
        const x2 = X + Math.floor((gx + gw) * w / 10);
        const y2 = Y + Math.floor((gy + gh) * h / 10);
        ctx.fillStyle = color;
        ctx.fillRect(x1, y1, Math.max(1, x2 - x1), Math.max(1, y2 - y1));
    };
    cell(2, 0, 6, 1, ink.red);
    cell(1, 1, 8, 1, ink.red);
    cell(8, 0, 2, 1, ink.snow);
    cell(0, 2, 10, 1, ink.snow);
    cell(1, 3, 8, 3, ink.skin);
    cell(2, 3, 2, 1, accent);
    cell(6, 3, 2, 1, accent);
    cell(0, 5, 2, 4, ink.snow);
    cell(8, 5, 2, 4, ink.snow);
    cell(2, 6, 6, 3, ink.snow);
    cell(3, 9, 4, 1, ink.snow);
    // Ho (open), ho (wider), ho (shut).
    if (f === 0) cell(4, 6, 2, 1, ink.red);
    else if (f === 1) cell(3, 6, 4, 2, ink.redDark);
    else cell(4, 6, 2, 1, ink.line);
}

function drawElf(r: Rect, frame: number, accent: string, ink: Ink): void {
    r(frame === 1 ? 8 : 7, 0, 2, 1, ink.snow);
    r(5, 0, 2, 1, ink.green);
    r(4, 1, 4, 1, ink.green);
    r(2, 2, 6, 1, ink.green);
    r(2, 3, 6, 3, ink.skin);
    r(1, 3, 1, 2, ink.skin);
    r(8, 3, 1, 2, ink.skin);
    r(3, 4, 1, 1, accent);
    r(6, 4, 1, 1, accent);
    r(4, 5, 2, 1, ink.redDark);
    r(2, 6, 6, 4, ink.green);
    r(2, 8, 6, 1, ink.sil);
    if (frame === 1) {
        r(0, 6, 2, 2, ink.green);
        r(8, 6, 2, 2, ink.green);
    } else if (frame === 2) {
        r(0, 8, 2, 1, ink.green);
        r(8, 8, 2, 1, ink.green);
    }
    r(3, 10, 2, 2, ink.red);
    r(6, 10, 2, 2, ink.red);
}

function drawSnowman(r: Rect, frame: number, accent: string, ink: Ink): void {
    r(3, 0, 4, 2, ink.sil);
    r(2, 2, 6, 1, ink.sil);
    r(3, 1, 4, 1, accent);
    r(2, 3, 6, 4, ink.snow);
    r(3, 4, 1, 1, ink.line);
    r(6, 4, 1, 1, ink.line);
    r(5, 5, frame === 2 ? 3 : 2, 1, ink.flame);
    r(1, 7, 8, 5, ink.snow);
    r(4, 8, 1, 1, ink.line);
    r(4, 10, 1, 1, ink.line);
    if (frame === 1) {
        r(0, 6, 1, 2, ink.brown);
        r(9, 6, 1, 2, ink.brown);
    } else {
        r(0, 8, 1, 2, ink.brown);
        r(9, 8, 1, 2, ink.brown);
    }
}

function drawReindeer(r: Rect, frame: number, accent: string, ink: Ink): void {
    r(1, 0, 1, 2, ink.brownDark);
    r(0, 0, 1, 1, ink.brownDark);
    r(8, 0, 1, 2, ink.brownDark);
    r(9, 0, 1, 1, ink.brownDark);
    r(2, 1, 1, 2, ink.brownDark);
    r(7, 1, 1, 2, ink.brownDark);
    r(3, 2, 4, 4, ink.brown);
    r(3, 3, 1, 1, accent);
    r(6, 3, 1, 1, accent);
    r(4, 5, 2, 2, frame === 1 ? ink.red : ink.redDark);
    r(2, 7, 6, 3, ink.brown);
    r(4, 7, 2, 1, ink.gold);
    if (frame === 2) r(0, 7, 2, 1, ink.brown);
    r(3, 10, 1, 2, ink.brownDark);
    r(6, 10, 1, 2, ink.brownDark);
}

function drawGinger(r: Rect, frame: number, accent: string, ink: Ink): void {
    r(3, 0, 4, 4, ink.brown);
    r(4, 1, 1, 1, accent);
    r(6, 1, 1, 1, accent);
    r(4, 3, 2, 1, ink.snow);
    r(2, 4, 6, 4, ink.brown);
    r(4, 5, 1, 1, ink.red);
    r(5, 6, 1, 1, ink.green);
    r(4, 7, 1, 1, ink.red);
    if (frame === 1) {
        r(0, 3, 2, 2, ink.brown);
        r(8, 3, 2, 2, ink.brown);
    } else {
        r(0, 5, 2, 2, ink.brown);
        r(8, 5, 2, 2, ink.brown);
    }
    r(0, 5, 1, 1, ink.snow);
    r(9, 5, 1, 1, ink.snow);
    r(2, 8, 2, 4, ink.brown);
    r(6, 8, 2, 4, ink.brown);
    if (frame === 2) r(2, 10, 2, 1, ink.snow);
}

function drawPenguin(r: Rect, frame: number, accent: string, ink: Ink): void {
    r(3, 0, 4, 2, ink.line);
    r(2, 2, 6, 8, ink.line);
    r(3, 3, 4, 7, ink.snow);
    r(3, 3, 1, 1, accent);
    r(6, 3, 1, 1, accent);
    r(4, 4, 2, 1, ink.flame);
    if (frame === 1) {
        r(0, 4, 2, 3, ink.line);
        r(8, 4, 2, 3, ink.line);
    } else {
        r(1, 5, 1, 4, ink.line);
        r(8, 5, 1, 4, ink.line);
    }
    r(2, 10, 2, 1, ink.flame);
    r(6, 10, 2, 1, ink.flame);
    if (frame === 2) r(4, 2, 2, 1, accent);
}

function drawNutcracker(r: Rect, frame: number, accent: string, ink: Ink): void {
    r(3, 0, 4, 3, ink.sil);
    r(3, 2, 4, 1, ink.gold);
    r(3, 3, 4, 3, ink.skin);
    r(3, 4, 1, 1, accent);
    r(6, 4, 1, 1, accent);
    r(3, 5, 4, frame === 1 ? 3 : 2, ink.snow);
    if (frame === 1) r(4, 6, 2, 1, ink.line);
    r(2, 7, 6, 3, ink.red);
    r(4, 7, 2, 3, ink.gold);
    if (frame === 2) r(8, 6, 2, 2, ink.red);
    r(3, 10, 2, 2, ink.sil);
    r(6, 10, 2, 2, ink.sil);
}

function drawMrsClaus(r: Rect, frame: number, accent: string, ink: Ink): void {
    r(4, 0, 2, 1, ink.snow);
    r(2, 1, 6, 2, ink.snow);
    r(2, 3, 6, 3, ink.skin);
    r(2, 3, 1, 2, ink.snow);
    r(7, 3, 1, 2, ink.snow);
    r(3, 4, 1, 1, accent);
    r(6, 4, 1, 1, accent);
    r(4, 4, 2, 1, ink.line);
    r(1, 6, 8, 5, ink.red);
    r(1, 6, 8, 1, ink.snow);
    r(1, 10, 8, 1, ink.snow);
    if (frame === 1) {
        r(0, 7, 1, 2, ink.skin);
        r(9, 7, 1, 2, ink.skin);
    } else if (frame === 2) {
        r(4, 5, 2, 1, ink.red);
    }
}
