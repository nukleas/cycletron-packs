/**
 * The band, drawn as rects around each member's feet. Each onset advances
 * `frame`, `hit` is 1 on the onset and decays, `lift` is where the pitch
 * sits in its register (0..1), and `held` is true while a long note sounds.
 * Santa sits at the kit and plays whichever piece was hit last.
 */

import {drawSprite, spr, type Sprite} from '@cycletron/viz-sdk';
import type {Cast} from './cast.js';
import type {Ink} from './ink.js';
import {idleKit, type KitFlash} from './kit.js';
import {along, at, b, limb, ln, paint, type Pt, put, seg, stance} from './pen.js';

export interface Singer {
    accent: string;
    frame: number;
    hit: number;
    lift: number;
    held: boolean;
}

export function drawPerformer(
    ctx: CanvasRenderingContext2D, cast: Cast, variant: number, x: number, foot: number, frame: number,
    hit: number, lift: number, held: boolean, accent: string, ink: Ink, kit?: KitFlash, singers?: readonly Singer[],
): void {
    if (cast === 'santa') {
        drawSanta(ctx, x, foot, hit, accent, ink, kit);
        return;
    }
    if (cast === 'carollers') {
        drawCarollers(ctx, x, foot, singers ?? [], ink);
        return;
    }
    at(x, foot);
    const f = frame % 3;
    switch (cast) {
        case 'reindeer': drawReindeer(ctx, f, hit, lift, accent, ink); break;
        case 'snowman': drawSnowman(ctx, f, hit, lift, accent, ink); break;
        case 'yeti': drawYeti(ctx, f, hit, lift, accent, ink); break;
        case 'mrsclaus': drawMrsClaus(ctx, f, hit, lift, held, accent, ink); break;
        case 'guitarist': drawGuitarist(ctx, f, hit, lift, held, accent, variant, ink); break;
        case 'elf': drawElf(ctx, f, hit, lift, held, accent, variant, ink); break;
        case 'gingerbread': drawGingerbread(ctx, f, hit, lift, accent, ink); break;
        case 'penguin': drawPenguin(ctx, f, hit, lift, accent, ink); break;
        case 'nutcracker': drawNutcracker(ctx, f, hit, lift, held, accent, ink); break;
    }
}

/** Elf hats by the order the elves took the stage. */
function hatColour(variant: number, ink: Ink): string {
    return variant === 1 ? ink.ice : variant === 2 ? ink.gold : ink.red;
}

/** Reindeer with a strap of harness bells. The strap shakes with the frame; the nose lights on the hit. */
function drawReindeer(ctx: CanvasRenderingContext2D, frame: number, hit: number, lift: number, accent: string, ink: Ink): void {
    const fur = ink.brown;
    const dark = ink.brownDark;
    const tan = ink.goldDark;
    const d = hit > 0.5 ? 1 : 0;
    const lit = hit > 0.4;
    stance(hit, frame, fur, dark);
    b(-8, -14, 3, 3, tan);
    b(-6, -24 + d, 12, 13, fur);
    b(-3, -21 + d, 6, 9, tan, false);
    // Harness: a red strap with three bells.
    b(-6, -19 + d, 12, 2, accent);
    for (let i = 0; i < 3; i++) b(-5 + i * 4, -18 + d + (frame === 1 ? 1 : 0), 2, 2, ink.gold, false);
    // Head, turned a little to the right, with the muzzle out front.
    b(-5, -36 + d, 10, 10, fur);
    b(-1, -32 + d, 8, 5, tan);
    b(-3, -34 + d, 1, 1, ink.line, false);
    b(1, -34 + d, 1, 1, ink.line, false);
    b(5, -31 + d, 3, 3, lit ? ink.red : ink.redDark);
    if (lit) {
        b(6, -30 + d, 1, 1, ink.snow, false);
        b(9, -31 + d, 1, 1, ink.red, false);
        b(9, -28 + d, 1, 1, ink.red, false);
        b(6, -33 + d, 1, 1, ink.red, false);
    }
    b(-7, -37 + d, 3, 2, fur);
    b(3, -37 + d, 3, 2, fur);
    // Antlers.
    b(-4, -43 + d, 2, 7, tan);
    b(3, -43 + d, 2, 7, tan);
    b(-7, -42 + d, 3, 2, tan);
    b(5, -42 + d, 3, 2, tan);
    b(-6, -46 + d, 2, 4, tan);
    b(5, -46 + d, 2, 4, tan);
    b(-2, -45 + d, 2, 3, tan);
    b(2, -45 + d, 2, 3, tan);
    paint(ctx, ink.line);

    // Left hand shakes a strap of bells, right hand rises with the pitch.
    const shake = frame === 1 ? -2 : frame === 2 ? 2 : 0;
    const hx = -13 + shake;
    const hy = -27 + d;
    limb(-6, -22 + d, -10, -18 + d, hx, hy, fur, fur);
    ln(hx, hy - 1, hx - 1 + shake, hy - 11, 2, ink.redDark);
    for (let i = 0; i < 3; i++) {
        const t = (i + 1) / 4;
        const bx = hx - 1 + Math.round((shake - 1) * t);
        const by = hy - 2 - Math.round(10 * t);
        b(bx - 1, by - 1, 4, 4, hit > 0.5 ? ink.snow : ink.gold);
        b(bx, by + 1, 2, 1, ink.line, false);
    }
    const ry = -22 - Math.round(lift * 10) + d;
    limb(6, -22 + d, 10, -17 + d, 11, ry, fur, fur);
    paint(ctx, ink.line);
}

/** Snowman on bass. Stick arms; the fretting hand walks the neck with pitch. */
function drawSnowman(ctx: CanvasRenderingContext2D, frame: number, hit: number, lift: number, accent: string, ink: Ink): void {
    const d = hit > 0.5 ? 1 : 0;
    const coal = ink.line;
    // Bottom, middle and head snowballs with subtle 3D shading on the right edge.
    b(-9, -14, 18, 14, ink.snow);
    b(5, -13, 3, 12, ink.snowDim, false);
    b(-7, -26 + d, 14, 12, ink.snow);
    b(4, -25 + d, 2, 10, ink.snowDim, false);
    b(-1, -24 + d, 2, 2, coal, false);
    b(-1, -20 + d, 2, 2, coal, false);
    b(-5, -36 + d, 10, 10, ink.snow);
    b(3, -35 + d, 2, 8, ink.snowDim, false);
    b(-4, -37 + d, 8, 1, ink.snow);
    b(-3, -34 + d, 1, 1, coal, false);
    b(2, -34 + d, 1, 1, coal, false);
    b(0, -32 + d, 5, 2, ink.flame);
    b(-2, -29 + d, 1, 1, coal, false);
    b(0, -28 + d, 1, 1, coal, false);
    b(2, -29 + d, 1, 1, coal, false);
    // Top hat with a red band, holly sprig, and a fringed scarf in the team colour.
    b(-7, -38 + d, 14, 1, coal);
    b(-4, -45 + d, 8, 7, coal);
    b(-4, -40 + d, 8, 1, ink.red, false);
    b(2, -42 + d, 2, 2, ink.green, false);
    b(1, -41 + d, 1, 1, ink.red, false);
    b(-6, -28 + d, 12, 3, accent);
    b(4, -27 + d, 3, 6, accent);
    b(4, -21 + d, 1, 2, ink.snow, false);
    b(6, -21 + d, 1, 2, ink.snow, false);
    paint(ctx, ink.line);

    // Bass across the middle, neck up to the left.
    b(-2, -18 + d, 12, 8, accent);
    b(-1, -19 + d, 7, 1, accent);
    b(-1, -10 + d, 9, 1, accent);
    b(7, -21 + d, 3, 3, accent);
    ln(0, -16 + d, -13, -29 + d, 2, ink.brown);
    b(-17, -33 + d, 4, 4, accent);
    b(1, -17 + d, 4, 5, ink.snow, false);
    b(5, -16 + d, 3, 1, ink.line, false);
    b(5, -13 + d, 3, 1, ink.stone, false);
    if (hit > 0.5) ln(1, -15 + d, -12, -28 + d, 1, ink.gold, false);
    paint(ctx, ink.line);

    // Twig arms: the fretting hand on the neck, the plucking hand over the strings.
    const [fx, fy] = along(-1, -17, -13, -29, 0.3 + 0.6 * (1 - lift));
    ln(-7, -22 + d, -11, -18 + d, 1, ink.brown);
    ln(-11, -18 + d, fx, fy + d, 1, ink.brown);
    b(fx - 2, fy - 1 + d, 2, 1, ink.brown);
    b(fx, fy - 3 + d, 1, 2, ink.brown);
    const sy = hit > 0.3 ? (frame & 1 ? -11 : -17) : -14;
    ln(7, -22 + d, 11, -18 + d, 1, ink.brown);
    ln(11, -18 + d, 8, sy + d, 1, ink.brown);
    b(8, sy + 1 + d, 2, 1, ink.brown);
    b(9, sy - 2 + d, 1, 2, ink.brown);
    paint(ctx, ink.line);
}

/** Bumble the Yeti plucking a tall wooden upright double-bass. */
function drawYeti(ctx: CanvasRenderingContext2D, frame: number, hit: number, lift: number, accent: string, ink: Ink): void {
    const d = hit > 0.5 ? 1 : 0;
    stance(hit, frame, ink.snow, ink.ice, 2);
    // Shaggy white fur torso with ice-blue chest and festive sash
    b(-8, -27 + d, 16, 16, ink.snow);
    b(-9, -25 + d, 2, 8, ink.snow);
    b(7, -25 + d, 2, 8, ink.snow);
    b(-5, -24 + d, 10, 10, ink.ice, false);
    b(-8, -19 + d, 16, 2, accent, false);
    // Yeti head, curved horns, ice-blue face and friendly toothy grin
    b(-6, -39 + d, 12, 12, ink.snow);
    b(-9, -41 + d, 3, 4, ink.goldDark);
    b(6, -41 + d, 3, 4, ink.goldDark);
    b(-4, -36 + d, 8, 7, ink.ice, false);
    b(-3, -35 + d, 2, 2, ink.gold, false);
    b(1, -35 + d, 2, 2, ink.gold, false);
    b(-2, -35 + d, 1, 1, ink.line, false);
    b(2, -35 + d, 1, 1, ink.line, false);
    b(-3, -31 + d, 6, 2, ink.line, false);
    b(-2, -31 + d, 1, 1, ink.snow, false);
    b(1, -31 + d, 1, 1, ink.snow, false);
    paint(ctx, ink.line);

    // Tall Upright Double-Bass standing on the right side (x = 9)
    const bx = 9;
    b(bx, -3, 1, 3, ink.stone);
    b(bx - 5, -16 + d, 11, 13, ink.brown);
    b(bx - 4, -24 + d, 9, 8, ink.brown);
    b(bx - 3, -24 + d, 2, 18, ink.brownDark, false);
    // F-holes & bridge
    b(bx - 3, -15 + d, 1, 5, ink.line, false);
    b(bx + 3, -15 + d, 1, 5, ink.line, false);
    b(bx - 2, -11 + d, 5, 1, ink.goldDark, false);
    // Fingerboard, neck and scroll
    b(bx - 1, -40 + d, 3, 17, ink.line);
    b(bx - 2, -44 + d, 4, 4, ink.brown);
    b(bx - 3, -43 + d, 1, 2, ink.gold, false);
    if (hit > 0.4) b(bx, -38 + d, 1, 26, accent, false);
    paint(ctx, ink.line);

    // Left arm reaches across to pluck strings; right hand slides up/down the neck with `lift`.
    const pluckY = hit > 0.35 ? (frame & 1 ? -14 : -19) : -16;
    limb(-8, -24 + d, -3, -18 + d, bx - 1, pluckY + d, ink.snow, ink.ice);
    const neckY = -26 - Math.round(lift * 12) + d;
    limb(7, -24 + d, 13, -22 + d, bx + 1, neckY, ink.snow, ink.ice);
    paint(ctx, ink.line);
}

/** Mrs. Claus playing a holiday upright pipe organ topped with gleaming golden pipes. */
function drawMrsClaus(
    ctx: CanvasRenderingContext2D, frame: number, hit: number, lift: number, held: boolean, accent: string, ink: Ink,
): void {
    const d = hit > 0.5 ? 1 : 0;
    const sway = frame === 1 ? -1 : frame === 2 ? 1 : 0;
    // Red dress skirt, white apron, lace collar & capelet
    b(-6, -13, 12, 13, ink.redDark);
    b(-4, -13, 8, 12, ink.snow, false);
    b(-6 + sway, -25 + d, 12, 12, ink.red);
    b(-4 + sway, -25 + d, 8, 3, ink.snow, false);
    b(-1 + sway, -23 + d, 2, 2, ink.gold, false);
    // Head, rosy cheeks, gold spectacles, white hair bun & holly sprig
    b(-4 + sway, -34 + d, 8, 9, ink.skin);
    b(-5 + sway, -35 + d, 10, 3, ink.snow);
    b(-3 + sway, -39 + d, 6, 4, ink.snow);
    b(-1 + sway, -38 + d, 2, 2, ink.green, false);
    b(0 + sway, -39 + d, 1, 1, ink.red, false);
    b(-3 + sway, -31 + d, 2, 2, ink.gold, false);
    b(1 + sway, -31 + d, 2, 2, ink.gold, false);
    b(-2 + sway, -31 + d, 1, 1, ink.line, false);
    b(2 + sway, -31 + d, 1, 1, ink.line, false);
    b(-4 + sway, -29 + d, 1, 1, ink.red, false);
    b(3 + sway, -29 + d, 1, 1, ink.red, false);
    b(-1 + sway, -27 + d, 3, 1, ink.line, false);
    paint(ctx, ink.line);

    // Holiday Pipe Organ console in front (-11..11) with 5 golden pipes & keyboard
    const pipeIdx = Math.min(4, Math.max(0, Math.round(lift * 4)));
    const pipeH = [10, 8, 11, 8, 10];
    for (let i = 0; i < 5; i++) {
        const px = -9 + i * 4;
        const ph = pipeH[i];
        const activePipe = (hit > 0.3 || held) && i === pipeIdx;
        b(px, -15 - ph + d, 3, ph, activePipe ? accent : ink.gold);
        b(px + 1, -14 - ph + d, 1, ph - 2, activePipe ? ink.snow : ink.goldDark, false);
    }
    b(-11, -15 + d, 22, 6, ink.brown);
    b(-10, -9 + d, 3, 9, ink.brownDark);
    b(7, -9 + d, 3, 9, ink.brownDark);
    // Garland & ivory keys along the organ manual
    b(-10, -14 + d, 20, 3, ink.snow, false);
    for (let k = -9; k < 9; k += 2) b(k, -14 + d, 1, 2, ink.line, false);
    const kx = -8 + Math.round(lift * 15);
    if (hit > 0.35 || held) b(kx, -12 + d, 2, 1, accent, false);
    paint(ctx, ink.line);

    // Both arms reaching to play the organ manual
    const lKey = Math.min(0, kx - 2);
    const rKey = Math.max(1, kx + 2);
    const lDip = hit > 0.4 && (frame & 1) === 0 ? 1 : 0;
    const rDip = hit > 0.4 && (frame & 1) === 1 ? 1 : 0;
    limb(-6 + sway, -22 + d, -9, -18 + d, lKey, -14 + d + lDip, ink.red, ink.skin);
    limb(6 + sway, -22 + d, 9, -18 + d, rKey, -14 + d + rDip, ink.red, ink.skin);
    paint(ctx, ink.line);
}

/** Rockin' Elf Guitarist shredding a Candy-Cane Flying-V electric guitar. */
function drawGuitarist(
    ctx: CanvasRenderingContext2D, frame: number, hit: number, lift: number, held: boolean, accent: string, variant: number, ink: Ink,
): void {
    const d = hit > 0.5 ? 1 : 0;
    const hat = hatColour(variant, ink);
    const tunic = ink.greenDark;
    stance(hit, frame, ink.red, ink.line);
    const stamp = hit > 0.5 ? frame & 1 : -1;
    const l = stamp === 0 ? 1 : 0;
    const r = stamp === 1 ? 1 : 0;
    for (const y of [-10, -7]) {
        b(-5, y - l, 4, 1, ink.snow, false);
        b(1, y - r, 4, 1, ink.snow, false);
    }
    b(-6, -24 + d, 12, 13, tunic);
    b(-6, -16 + d, 12, 2, ink.line, false);
    b(-1, -16 + d, 3, 2, ink.gold, false);
    b(-5, -24 + d, 10, 1, ink.red, false);
    // Head with pointed ears and cool shades
    const tip = held ? -1 : 0;
    b(-4, -33 + d, 8, 9, ink.skin);
    b(-6, -31 + d, 2, 2, ink.skin);
    b(4, -31 + d, 2, 2, ink.skin);
    // Cool pixel sunglasses
    b(-4, -32 + d, 8, 2, ink.line, false);
    b(-3, -32 + d, 1, 1, ink.ice, false);
    b(1, -32 + d, 1, 1, ink.ice, false);
    b(-1, -27 + d, 3, 1, ink.line, false);
    // Pointed hat leaning left with white pompom
    b(-5, -35 + d, 10, 2, ink.snow);
    b(-4, -38 + d + tip, 8, 3, hat);
    b(-5, -41 + d + tip, 6, 3, hat);
    b(-6, -44 + d + tip, 4, 3, hat);
    b(-8, -46 + d + tip, 3, 3, ink.snow);
    paint(ctx, ink.line);

    // Candy-Cane Flying-V Guitar: V wings on the right, neck angled up-left
    const up = held ? 2 : 0;
    ln(1, -16 + d, 12, -11 + d, 3, ink.red);
    ln(1, -16 + d, 10, -21 + d, 3, ink.red);
    b(-1, -18 + d, 5, 5, accent);
    b(4, -14 + d, 2, 2, ink.snow, false);
    b(8, -12 + d, 2, 2, ink.snow, false);
    b(4, -19 + d, 2, 2, ink.snow, false);
    b(7, -21 + d, 2, 2, ink.snow, false);
    // Guitar neck & headstock up-left
    ln(0, -16 + d, -14, -27 + d - up, 2, ink.brown);
    b(-17, -30 + d - up, 4, 3, accent);
    if (hit > 0.45 || held) ln(1, -16 + d, -13, -26 + d - up, 1, ink.gold, false);
    paint(ctx, ink.line);

    // Left hand frets along neck; right hand strums over V body
    const [fx, fy] = along(-1, -17, -14, -27 - up, 0.25 + 0.65 * lift);
    limb(-6, -22 + d, -10, -18 + d, fx, fy + d, tunic, ink.skin);
    const sy = hit > 0.35 ? (frame & 1 ? -13 : -19) : -16;
    limb(6, -22 + d, 9, -18 + d, 3, sy + d, tunic, ink.skin);
    paint(ctx, ink.line);
}

/** Elf with a keytar. Striped stockings, a pointed hat in its own colour; a held note tips the hat and the neck. */
function drawElf(
    ctx: CanvasRenderingContext2D, frame: number, hit: number, lift: number, held: boolean, accent: string, variant: number, ink: Ink,
): void {
    const d = hit > 0.5 ? 1 : 0;
    const hat = hatColour(variant, ink);
    const tunic = ink.green;
    stance(hit, frame, ink.red, ink.line);
    const stamp = hit > 0.5 ? frame & 1 : -1;
    const l = stamp === 0 ? 1 : 0;
    const r = stamp === 1 ? 1 : 0;
    for (const y of [-10, -7]) {
        b(-5, y - l, 4, 1, ink.snow, false);
        b(1, y - r, 4, 1, ink.snow, false);
    }
    b(-6, -24 + d, 12, 13, tunic);
    b(-6, -16 + d, 12, 2, ink.line, false);
    b(-1, -16 + d, 3, 2, ink.gold, false);
    b(-4, -24 + d, 2, 1, ink.snow, false);
    b(0, -24 + d, 2, 1, ink.snow, false);
    b(-6, -23 + d, 1, 1, ink.snow, false);
    b(5, -23 + d, 1, 1, ink.snow, false);
    // Head with pointed ears.
    const tip = held ? -1 : 0;
    b(-4, -33 + d, 8, 9, ink.skin);
    b(-6, -31 + d, 2, 2, ink.skin);
    b(4, -31 + d, 2, 2, ink.skin);
    b(-3, -31 + d, 1, 1, ink.line, false);
    b(2, -31 + d, 1, 1, ink.line, false);
    b(-4, -29 + d, 1, 1, ink.red, false);
    b(3, -29 + d, 1, 1, ink.red, false);
    b(-1, -27 + d, 3, 1, ink.line, false);
    // Hat: brim, then a cone that leans to the right, pompom on the tip.
    b(-5, -35 + d, 10, 2, ink.snow);
    b(-4, -38 + d + tip, 8, 3, hat);
    b(-1, -41 + d + tip, 6, 3, hat);
    b(2, -44 + d + tip, 4, 3, hat);
    b(5, -46 + d + tip, 3, 3, ink.snow);
    paint(ctx, ink.line);

    // Keytar across the hips: body on the left, keys in the middle, neck up the right.
    const up = held ? 2 : 0;
    b(-15, -17 + d, 6, 8, accent);
    b(-14, -18 + d, 4, 1, accent);
    b(-9, -16 + d, 17, 5, ink.sil);
    b(-8, -15 + d, 15, 3, ink.snow, false);
    for (let k = -7; k < 7; k += 2) b(k, -15 + d, 1, 3, ink.stone, false);
    for (let k = -6; k < 7; k += 4) b(k, -15 + d, 1, 2, ink.line, false);
    ln(8, -14 + d, 15, -21 + d - up, 2, accent);
    b(14, -24 + d - up, 3, 3, accent);
    const kx = -7 + Math.round(lift * 12);
    if (hit > 0.5 || held) b(kx, -13 + d, 2, 1, accent, false);
    paint(ctx, ink.line);

    const ky = hit > 0.5 ? -15 : -17;
    limb(-6, -22 + d, -11, -18 + d, kx, ky + d, tunic, ink.skin);
    const gy = -20 - up + (hit > 0.5 ? frame & 1 : 0);
    limb(6, -22 + d, 10, -18 + d, 12, gy + d, tunic, ink.skin);
    paint(ctx, ink.line);
}

/** Gingerbread man on a glockenspiel. Pitch picks the bar; the mallets take turns. */
function drawGingerbread(ctx: CanvasRenderingContext2D, frame: number, hit: number, lift: number, accent: string, ink: Ink): void {
    const d = hit > 0.5 ? 1 : 0;
    const dough = ink.brown;
    const icing = ink.snow;
    stance(hit, frame, dough, dough, 2);
    const stamp = hit > 0.5 ? frame & 1 : -1;
    b(-6, -5 - (stamp === 0 ? 1 : 0), 4, 1, icing, false);
    b(2, -5 - (stamp === 1 ? 1 : 0), 4, 1, icing, false);
    b(-6, -24 + d, 12, 13, dough);
    b(-6, -24 + d, 12, 1, icing, false);
    for (let i = -5; i < 6; i += 2) b(i, -23 + d, 1, 1, icing, false);
    // Icing bow-tie & gumdrop buttons
    b(-3, -24 + d, 6, 2, ink.red, false);
    b(-1, -20 + d, 2, 2, accent);
    b(-1, -16 + d, 2, 2, ink.green);
    // A round head with icing eyes and a smile.
    b(-5, -35 + d, 10, 10, dough);
    b(-4, -36 + d, 8, 1, dough);
    b(-4, -25 + d, 8, 1, dough);
    b(-3, -32 + d, 2, 2, icing, false);
    b(2, -32 + d, 2, 2, icing, false);
    b(-3, -32 + d, 1, 1, ink.line, false);
    b(2, -32 + d, 1, 1, ink.line, false);
    b(-4, -29 + d, 1, 1, icing, false);
    b(-3, -28 + d, 7, 1, icing, false);
    b(4, -29 + d, 1, 1, icing, false);
    b(-5, -30 + d, 1, 1, ink.red, false);
    b(5, -30 + d, 1, 1, ink.red, false);
    paint(ctx, ink.line);

    // Six bars on a stand with golden resonator tubes beneath, longest on the left.
    ln(-13, -10, -15, 0, 1, ink.stoneDark);
    ln(12, -10, 14, 0, 1, ink.stoneDark);
    b(-14, -11, 28, 1, ink.stoneDark);
    const bar = Math.round(lift * 5);
    const lit = hit > 0.3;
    for (let i = 0; i < 6; i++) {
        const x = -13 + i * 5;
        const len = 7 - i;
        const c = lit && i === bar ? accent : ink.ice;
        b(x + 1, -10, 1, 4 - (i >> 1), ink.goldDark, false);
        b(x, -11 - len, 3, len, c);
        b(x + 1, -11 - len + 1, 1, 1, ink.snow, false);
    }
    paint(ctx, ink.line);

    // The near hand takes its side's bars, the middle two alternate.
    const strikeLeft = bar === 2 || bar === 3 ? (frame & 1) === 0 : bar < 2;
    const bx = -12 + bar * 5;
    const by = -13 - (7 - bar);
    const down = hit > 0.5;
    const lHand: Pt = strikeLeft && down ? [bx - 5, by - 4] : [-9, -19];
    const rHand: Pt = !strikeLeft && down ? [bx + 5, by - 4] : [9, -19];
    const lTip: Pt = strikeLeft && down ? [bx, by] : [-12, -27];
    const rTip: Pt = !strikeLeft && down ? [bx, by] : [12, -27];
    ln(lHand[0], lHand[1] + d, lTip[0], lTip[1] + d, 1, ink.stone);
    ln(rHand[0], rHand[1] + d, rTip[0], rTip[1] + d, 1, ink.stone);
    b(lTip[0] - 1, lTip[1] - 1 + d, 2, 2, ink.gold);
    b(rTip[0], rTip[1] - 1 + d, 2, 2, ink.gold);
    limb(-6, -22 + d, -9, -16 + d, lHand[0], lHand[1] + d, dough, dough);
    limb(6, -22 + d, 9, -16 + d, rHand[0], rHand[1] + d, dough, dough);
    paint(ctx, ink.line);
}

/** Chilly the Penguin in earmuffs & red bow-tie ringing tall golden Tubular Chimes. */
function drawPenguin(ctx: CanvasRenderingContext2D, frame: number, hit: number, lift: number, accent: string, ink: Ink): void {
    const d = hit > 0.5 ? 1 : 0;
    const waddle = hit > 0.4 ? (frame & 1 ? 1 : -1) : 0;
    // Orange webbed feet
    b(-6, -2 - (waddle < 0 ? 1 : 0), 5, 2, ink.flame);
    b(1, -2 - (waddle > 0 ? 1 : 0), 5, 2, ink.flame);
    // Plump tuxedo body & white belly
    b(-6, -21 + d, 12, 19, ink.sil);
    b(-4, -19 + d, 8, 15, ink.snow, false);
    // Red bow-tie
    b(-3, -20 + d, 6, 2, ink.red, false);
    b(-1, -20 + d, 2, 2, ink.gold, false);
    // Head, eyes, orange beak & cosy winter earmuffs
    b(-5, -30 + d, 10, 9, ink.sil);
    b(-3, -28 + d, 6, 5, ink.snow, false);
    b(-2, -27 + d, 1, 1, ink.line, false);
    b(1, -27 + d, 1, 1, ink.line, false);
    b(-2, -25 + d, 4, 2, ink.flame);
    // Earmuffs arch & pads
    b(-4, -32 + d, 8, 1, ink.line);
    b(-7, -29 + d, 2, 4, accent);
    b(5, -29 + d, 2, 4, accent);
    paint(ctx, ink.line);

    // Tall rack of 5 Tubular Chimes standing to the right (x = 8..20)
    b(7, -38, 1, 38, ink.stoneDark);
    b(21, -38, 1, 38, ink.stoneDark);
    b(6, -39, 17, 2, ink.brown);
    const tube = Math.min(4, Math.max(0, Math.round(lift * 4)));
    const lit = hit > 0.3;
    for (let i = 0; i < 5; i++) {
        const tx = 9 + i * 2 + (i > 2 ? 1 : 0);
        const th = 24 - i * 3;
        const active = lit && i === tube;
        b(tx, -37, 2, th, active ? accent : ink.gold);
        if (active) b(tx, -36, 1, th - 2, ink.snow, false);
    }
    paint(ctx, ink.line);

    // Left flipper waves; right flipper strikes the chime with a mallet
    const ly = -14 - (frame === 1 ? 3 : 0) + d;
    limb(-6, -18 + d, -9, -15 + d, -10, ly, ink.sil, ink.sil);
    const tx = 9 + tube * 2;
    const hx = hit > 0.45 ? tx - 3 : 5;
    const hy = hit > 0.45 ? -28 : -22;
    ln(hx, hy + d, hx + 4, hy - 5 + d, 1, ink.brown);
    b(hx + 3, hy - 6 + d, 3, 2, ink.gold);
    limb(5, -18 + d, 7, -18 + d, hx, hy + d, ink.sil, ink.sil);
    paint(ctx, ink.line);
}

/** Nutcracker on trumpet. The jaw drops on the hit, the bell rises with pitch, a held note leans back. */
function drawNutcracker(
    ctx: CanvasRenderingContext2D, frame: number, hit: number, lift: number, held: boolean, accent: string, ink: Ink,
): void {
    const d = hit > 0.5 ? 1 : 0;
    const jaw = hit > 0.5 ? 1 : 0;
    const lean = held ? -1 : 0;
    stance(hit, frame, ink.snow, ink.line);
    b(-6, -25 + d, 12, 14, ink.red);
    b(-8, -25 + d, 3, 2, ink.gold);
    b(5, -25 + d, 3, 2, ink.gold);
    b(-1, -22 + d, 2, 2, ink.gold, false);
    b(-1, -18 + d, 2, 2, ink.gold, false);
    b(-1, -14 + d, 2, 2, ink.gold, false);
    b(-6, -13 + d, 12, 1, ink.line, false);
    // A big square head: white hair at the sides, wide eyes, a moustache, and the hinged jaw.
    const hx = lean;
    b(-5 + hx, -37 + d, 10, 10, ink.skin);
    b(-7 + hx, -36 + d, 2, 7, ink.snow);
    b(5 + hx, -36 + d, 2, 7, ink.snow);
    b(-4 + hx, -35 + d, 3, 1, ink.line, false);
    b(1 + hx, -35 + d, 3, 1, ink.line, false);
    b(-4 + hx, -34 + d, 2, 2, ink.snow, false);
    b(2 + hx, -34 + d, 2, 2, ink.snow, false);
    b(-3 + hx, -33 + d, 1, 1, ink.line, false);
    b(2 + hx, -33 + d, 1, 1, ink.line, false);
    b(-4 + hx, -30 + d, 8, 1, ink.snow, false);
    b(-3 + hx, -29 + d, 6, 1 + jaw, ink.line, false);
    for (let i = -3; i < 3; i += 2) b(i + hx, -29 + d, 1, 1, ink.snow, false);
    b(-4 + hx, -28 + d + jaw, 8, 3, ink.snow);
    // Tall hat with a gold band and a plume.
    b(-6 + hx, -38 + d, 12, 1, ink.line);
    b(-5 + hx, -51 + d, 10, 13, ink.line);
    b(-5 + hx, -41 + d, 10, 2, ink.gold, false);
    b(-1 + hx, -47 + d, 2, 2, ink.gold, false);
    b(4 + hx, -56 + d, 2, 6, accent);
    paint(ctx, ink.line);

    // Trumpet from the mouth to the right; the bell rises with pitch.
    const tilt = Math.round((lift - 0.5) * 6) + (held ? 1 : 0);
    const brass = hit > 0.5 ? ink.gold : accent;
    ln(4 + hx, -28 + d, 15, -28 + d - tilt, 2, brass);
    b(14, -31 + d - tilt, 3, 6, brass);
    b(17, -32 + d - tilt, 1, 8, brass);
    for (let i = 0; i < 3; i++) b(7 + i * 2, -31 + d + (i === frame ? 1 : 0), 1, 2, ink.stone);
    if (hit > 0.15) {
        const rise = Math.round((1 - hit) * 8);
        b(20, -31 + d - tilt - rise, 2, 2, accent);
        b(23, -34 + d - tilt - rise * 2, 2, 2, accent);
    }
    paint(ctx, ink.line);

    limb(-6, -23 + d, -4, -17 + d, 6, -26 + d - Math.round(tilt / 3), ink.red, ink.snow);
    limb(6, -23 + d, 8, -19 + d, 9, -29 + d - Math.round(tilt / 2), ink.red, ink.snow);
    paint(ctx, ink.line);
}

/** A sung note: head on the bottom left. */
const NOTE: Sprite = spr(`
    ..11
    ..1.
    111.
    11..
`);

/** Three Dickensian singers with songbooks. Always renders a full vocal trio! */
function drawCarollers(ctx: CanvasRenderingContext2D, x: number, foot: number, singers: readonly Singer[], ink: Ink): void {
    const fallbackColors = [ink.red, ink.green, ink.ice];
    const base = singers[0] ?? {accent: ink.red, frame: 0, hit: 0, lift: 0.5, held: false};
    const trio: Singer[] = [
        singers[0] ?? base,
        singers[1] ?? {
            accent: base.accent === ink.green ? ink.gold : ink.green,
            frame: (base.frame + 1) % 3,
            hit: base.hit * 0.9,
            lift: Math.min(1, base.lift + 0.15),
            held: base.held,
        },
        singers[2] ?? {
            accent: base.accent === ink.ice ? fallbackColors[0] : ink.ice,
            frame: (base.frame + 2) % 3,
            hit: base.hit * 0.85,
            lift: Math.max(0, base.lift - 0.15),
            held: base.held,
        },
    ];
    const n = trio.length;
    for (let i = 0; i < n; i++) {
        const s = trio[i];
        const sway = s.frame % 3 === 1 ? -1 : s.frame % 3 === 2 ? 1 : 0;
        at(x + Math.round((i - (n - 1) / 2) * 14) + sway, foot);
        const d = s.hit > 0.5 ? 1 : 0;
        const open = s.held || s.hit > 0.4;
        b(-4, -8, 3, 8, ink.sil);
        b(1, -8, 3, 8, ink.sil);
        b(-5, -6, 4, 2, ink.line);
        b(1, -6, 4, 2, ink.line);
        b(-5, -21 + d, 10, 13, s.accent);
        b(-5, -22 + d, 10, 2, ink.snow);
        b(3, -21 + d, 2, 5, ink.snow, false);
        b(-4, -30 + d, 8, 8, ink.skin);
        b(-3, -28 + d, 1, 1, ink.line, false);
        b(2, -28 + d, 1, 1, ink.line, false);
        b(-4, -26 + d, 1, 1, ink.red, false);
        b(3, -26 + d, 1, 1, ink.red, false);
        if (open) {
            const wide = s.held ? 4 : 3;
            b(-2, -26 + d, 4, wide, ink.line, false);
            b(-1, -25 + d, 2, wide - 2, ink.red, false);
        } else b(-1, -25 + d, 3, 1, ink.line, false);
        if (i === 1) {
            b(-5, -31 + d, 10, 1, ink.line);
            b(-3, -37 + d, 6, 6, ink.line);
            b(-3, -33 + d, 6, 1, s.accent, false);
        } else if (i === 2) {
            b(-5, -30 + d, 2, 3, s.accent);
            b(3, -30 + d, 2, 3, s.accent);
            b(-4, -32 + d, 8, 1, ink.line);
        } else {
            b(-4, -33 + d, 8, 3, s.accent);
            b(-4, -31 + d, 8, 1, ink.snow, false);
            b(-1, -35 + d, 2, 2, ink.snow);
        }
        // Songbook in both hands.
        b(-5, -16 + d, 10, 5, ink.snow);
        b(0, -16 + d, 1, 5, ink.line, false);
        b(-4, -14 + d, 3, 1, ink.stoneDark, false);
        b(2, -14 + d, 3, 1, ink.stoneDark, false);
        b(-6, -13 + d, 2, 2, ink.skin);
        b(4, -13 + d, 2, 2, ink.skin);
        paint(ctx, ink.line);
        if (s.hit > 0.1) {
            const rise = Math.round((1 - s.hit) * 12);
            const nx = Math.round(x + (i - (n - 1) / 2) * 14) + 5 + (s.frame % 2) * 2;
            const ny = foot - 36 - Math.round(s.lift * 6) - rise;
            drawSprite(ctx, NOTE, nx, ny, [null, s.accent], {outline: ink.line});
        }
    }
}

/** Santa's head: 1 hat red, 2 trim, 3 skin, 4 eyes. */
const SANTA_HEAD: Sprite = spr(`
    ....1111.....
    ...111111.22.
    ..11111111122
    ..1111111111.
    .22222222222.
    .22222222222.
    .33333333333.
    .33433333433.
    .33333333333.
    ..333331333..
    ..333333333..
`);

/** The beard, drawn under the head; it drops a pixel on a hit. 1 beard, 2 mouth. */
const SANTA_BEARD: Sprite = spr(`
    .11111111111.
    1111122211111
    1111111111111
    .11111111111.
    ..111111111..
    ....11111....
`);

/** Pelvis sits this far above the riser, behind the kick. */
const SEAT = 19;

/** Elbow, hand and stick tip, relative to the drummer's foot. */
interface Stroke {
    elbow: Pt;
    hand: Pt;
    tip: Pt;
}

/** A target played down (stick on the head) and up (stick cocked over it). */
interface Target {
    down: Stroke;
    up: Stroke;
}

const SHOULDER_L: Pt = [-5, -30];
const SHOULDER_R: Pt = [5, -30];

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
const DOWN = 0.55;
const UP = 0.12;

const IDLE_KIT = idleKit();

function drawSanta(ctx: CanvasRenderingContext2D, x: number, foot: number, hit: number, accent: string, ink: Ink, kit?: KitFlash): void {
    const X = Math.round(x);
    const k = kit ?? IDLE_KIT;
    const dip = k.kick > DOWN ? 1 : 0;
    const bounce = hit > 0.5 ? 1 : 0;

    drawCymbals(X, foot, k, ink);
    paint(ctx, ink.line);

    // Coat, belt and buckle, seated behind the kick.
    const top = foot - SEAT - 13 + dip;
    put(X - 8, top, 16, 13, ink.red);
    put(X - 8, top + 12, 16, 2, ink.snow);
    put(X - 2, top + 1, 4, 11, ink.snow, false);
    put(X - 8, top + 8, 16, 2, ink.line, false);
    put(X - 2, top + 8, 4, 2, ink.gold, false);
    paint(ctx, ink.line);
    const head = top - SANTA_HEAD.h - 2 + bounce;
    drawSprite(ctx, SANTA_HEAD, X - 6, head, [null, ink.red, ink.snow, ink.skin, ink.line], {outline: ink.line});
    drawSprite(ctx, SANTA_BEARD, X - 6, head + SANTA_HEAD.h - 1 + bounce, [null, ink.snow, ink.line], {outline: ink.line});

    drawDrums(X, foot, k, ink);
    paint(ctx, ink.line);

    const grip = hit > 0.4 ? accent : ink.snow;
    drawArm(X, foot + dip, SHOULDER_L, leftStroke(k), grip, ink);
    drawArm(X, foot + dip, SHOULDER_R, rightStroke(k), grip, ink);
    paint(ctx, ink.line);
}

/** Snare strokes alternate hands, unless the other hand is busy: the right hand plays the hats, the left the toms and the crash. */
function snareLeft(k: KitFlash): boolean {
    if (k.hat >= k.snare) return true;
    if (Math.max(k.tom, k.crash) >= k.snare) return false;
    return k.snareHand === 1;
}

/** Each hand plays whichever of its pieces was hit last. */
function leftStroke(k: KitFlash): Stroke {
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

function rightStroke(k: KitFlash): Stroke {
    const snare = snareLeft(k) ? 0 : k.snare;
    const t = k.hat >= snare ? RIGHT.hat : RIGHT.snare;
    const v = Math.max(k.hat, snare);
    return v > DOWN ? t.down : v > UP ? t.up : REST_R;
}

function drawArm(X: number, foot: number, shoulder: Pt, s: Stroke, grip: string, ink: Ink): void {
    const sx = X + shoulder[0];
    const sy = foot + shoulder[1];
    const ex = X + s.elbow[0];
    const ey = foot + s.elbow[1];
    const hx = X + s.hand[0];
    const hy = foot + s.hand[1];
    seg(hx, hy, X + s.tip[0], foot + s.tip[1], 1, ink.stone);
    seg(sx, sy, ex, ey, 2, ink.red);
    seg(ex, ey, hx, hy, 2, ink.red);
    put(hx - 1, hy - 1, 3, 3, grip);
}

function hot(amount: number, css: string, idle: string): string {
    return amount > 0.35 && css ? css : idle;
}

/** Crash on a boom over the floor tom, hats on the right. Both sit behind Santa. */
function drawCymbals(X: number, foot: number, k: KitFlash, ink: Ink): void {
    const chrome = ink.stoneDark;
    put(X - 38, foot - 44, 1, 44, chrome);
    put(X - 41, foot - 1, 7, 1, chrome);
    const tilt = k.crash > 0.6 ? 2 : k.crash > 0.3 ? 1 : 0;
    const crash = hot(k.crash, k.crashCss, ink.gold);
    put(X - 47, foot - 46 + tilt, 9, 1, crash);
    put(X - 38, foot - 46 - tilt, 10, 1, crash);
    put(X - 40, foot - 47, 4, 1, crash);

    put(X + 30, foot - 34, 1, 34, chrome);
    put(X + 27, foot - 1, 7, 1, chrome);
    const lift = k.hat > 0.35 ? 2 : 0;
    const hat = hot(k.hat, k.hatCss, ink.gold);
    put(X + 23, foot - 35, 15, 1, hat);
    put(X + 23, foot - 37 - lift, 15, 1, hat);
    put(X + 28, foot - 38 - lift, 5, 1, hat);
}

/** Floor tom left, rack tom on the kick, snare right, kick in front with a wreath on its head. */
function drawDrums(X: number, foot: number, k: KitFlash, ink: Ink): void {
    const chrome = ink.stone;
    const shell = ink.greenDark;
    const tom = hot(k.tom, k.tomCss, ink.snow);

    // Floor tom.
    put(X - 31, foot - 5, 1, 5, chrome);
    put(X - 21, foot - 5, 1, 5, chrome);
    put(X - 32, foot - 18, 13, 1, k.floorTom ? tom : ink.snow);
    put(X - 32, foot - 17, 13, 1, chrome);
    put(X - 32, foot - 16, 13, 10, shell);
    put(X - 32, foot - 6, 13, 1, chrome);

    // Kick: hoop, head, spurs, wreath.
    const kick = k.kick > DOWN;
    const bump = kick ? 1 : 0;
    const head = hot(k.kick, k.kickCss, ink.snow);
    put(X - 14, foot - 4, 2, 4, chrome);
    put(X + 13, foot - 4, 2, 4, chrome);
    put(X - 8, foot - 19 - bump, 17, 1, chrome);
    put(X - 10, foot - 18 - bump, 21, 17 + bump, chrome);
    put(X - 8, foot - 1, 17, 1, chrome);
    put(X - 7, foot - 18 - bump, 15, 1, head, false);
    put(X - 9, foot - 17 - bump, 19, 15 + bump, head, false);
    put(X - 7, foot - 2, 15, 1, head, false);
    const cy = foot - 10 - bump;
    for (let dy = -6; dy <= 6; dy++) {
        for (let dx = -6; dx <= 6; dx++) {
            const d = dx * dx + dy * dy;
            if (d > 36 || d < 9) continue;
            put(X + dx, cy + dy, 1, 1, (dx + dy) & 1 ? ink.green : ink.greenDark, false);
        }
    }
    const berry = kick ? ink.gold : ink.red;
    put(X - 1, cy - 5, 2, 2, berry, false);
    put(X + 3, cy + 3, 2, 2, berry, false);
    put(X - 5, cy + 2, 2, 2, berry, false);
    put(X + 4, cy - 3, 2, 2, berry, false);
    put(X - 2, cy + 5, 4, 2, ink.red, false);

    // Rack tom, mounted on the kick.
    put(X - 9, foot - 20, 2, 2, chrome);
    put(X - 18, foot - 27, 12, 1, k.floorTom ? ink.snow : tom);
    put(X - 18, foot - 26, 12, 1, chrome);
    put(X - 18, foot - 25, 12, 5, shell);
    put(X - 18, foot - 20, 12, 1, chrome);

    // Snare on its stand.
    const sd = k.snare > DOWN ? 1 : 0;
    put(X + 12, foot - 19, 1, 18, chrome);
    put(X + 9, foot - 1, 7, 1, chrome);
    put(X + 7, foot - 24 + sd, 12, 1, hot(k.snare, k.snareCss, ink.snow));
    put(X + 7, foot - 23 + sd, 12, 1, chrome);
    put(X + 7, foot - 22 + sd, 12, 3, ink.red);
    put(X + 7, foot - 19 + sd, 12, 1, chrome);
}
