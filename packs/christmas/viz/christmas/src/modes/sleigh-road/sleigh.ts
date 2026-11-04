/**
 * SLEIGH ROAD sprites, seen from behind: Santa's sleigh (red tub, gold
 * runners, the sack, Santa in his red coat), the reindeer, and the rival
 * sleds. Each is a vector sprite at its projected ground point, `k` pixels
 * per meter. Gallops, runner sparks and the sparkle trail are pure functions
 * of time, so a render replays exactly.
 */

import {TAU, hash32, rand01} from '@cycletron/viz-sdk';

const RED = '#d8262e';
const RED_DARK = '#6e1216';
const GOLD = '#efbd73';
const GOLD_DARK = '#9a6a2e';
const FUR = '#f2efe8';
const SACK = '#a8743f';
const SACK_DARK = '#6e4622';
const HIDE = '#8a5a34';
const HIDE_DARK = '#5a3a20';
const ANTLER = '#d9bb8a';

/** Drift spark tiers: ice, gold, holly. Body and hot core. */
export const SPARK_TIERS: ReadonlyArray<readonly [string, string]> = [
    ['#8fd8ff', '#e8f8ff'],
    ['#ffb020', '#fff3c0'],
    ['#ff4a6e', '#ffc0d0'],
];

/** Runner x positions, meters from the middle. */
const RUNNER = 0.62;

/**
 * Santa's sleigh at its runners' point (x, y) on screen. `lean` (radians)
 * banks it into a bend.
 */
export function drawSleigh(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, lean: number): void {
    if (k < 0.8) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean * 0.35);
    ctx.scale(k, k);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Runners: gold struts down to the rails, the rails curling up at the back.
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 0.07;
    ctx.beginPath();
    for (const rx of [-RUNNER, RUNNER]) {
        ctx.moveTo(rx * 0.85, -0.3); ctx.lineTo(rx, -0.04);
        ctx.moveTo(rx, -0.04); ctx.arc(rx, -0.13, 0.09, Math.PI / 2, Math.PI * 1.6, rx > 0);
    }
    ctx.stroke();

    // The tub: wider at the rim, a gold lip and a scroll on the back.
    const body = ctx.createLinearGradient(0, -0.95, 0, -0.25);
    body.addColorStop(0, RED);
    body.addColorStop(1, RED_DARK);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-0.56, -0.26);
    ctx.lineTo(0.56, -0.26);
    ctx.lineTo(0.74, -0.86);
    ctx.quadraticCurveTo(0.8, -0.98, 0.66, -0.96);
    ctx.lineTo(-0.66, -0.96);
    ctx.quadraticCurveTo(-0.8, -0.98, -0.74, -0.86);
    ctx.closePath();
    ctx.fill();

    // The sack, rear left, bulging over the rim.
    ctx.fillStyle = SACK;
    ctx.beginPath();
    ctx.ellipse(-0.33, -1.06, 0.3, 0.3, -0.15, 0, TAU);
    ctx.fill();
    ctx.fillStyle = SACK_DARK;
    ctx.beginPath();
    ctx.ellipse(-0.42, -1.33, 0.1, 0.07, 0.4, 0, TAU);
    ctx.fill();

    // Santa from behind: coat, belt, sleeves out to the reins, white trim.
    const sx = 0.16;
    ctx.fillStyle = '#b81e26';
    ctx.beginPath();
    ctx.moveTo(sx - 0.3, -0.92);
    ctx.lineTo(sx + 0.3, -0.92);
    ctx.lineTo(sx + 0.26, -1.36);
    ctx.quadraticCurveTo(sx, -1.46, sx - 0.26, -1.36);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#b81e26';
    ctx.lineWidth = 0.13;
    ctx.beginPath();
    ctx.moveTo(sx - 0.24, -1.28); ctx.lineTo(sx - 0.4, -1.18);
    ctx.moveTo(sx + 0.24, -1.28); ctx.lineTo(sx + 0.42, -1.18);
    ctx.stroke();
    ctx.fillStyle = FUR;
    ctx.beginPath();
    ctx.arc(sx - 0.42, -1.17, 0.07, 0, TAU);
    ctx.arc(sx + 0.44, -1.17, 0.07, 0, TAU);
    ctx.fill();
    ctx.fillRect(sx - 0.31, -0.98, 0.62, 0.08);
    ctx.fillStyle = '#151515';
    ctx.fillRect(sx - 0.28, -1.12, 0.56, 0.07);

    // The beard shows past the head on both sides; the back of the head is white hair.
    ctx.fillStyle = FUR;
    ctx.beginPath();
    ctx.ellipse(sx, -1.4, 0.2, 0.09, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx, -1.52, 0.15, 0, TAU);
    ctx.fill();

    // The hat: a red cone flopping to the side, a fur band and a pompom.
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.moveTo(sx - 0.16, -1.58);
    ctx.quadraticCurveTo(sx - 0.02, -1.98, sx + 0.3, -1.84);
    ctx.lineTo(sx + 0.16, -1.58);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = FUR;
    ctx.fillRect(sx - 0.18, -1.63, 0.36, 0.08);
    ctx.beginPath();
    ctx.arc(sx + 0.31, -1.83, 0.07, 0, TAU);
    ctx.fill();

    // The gold lip goes on last, over the sack and the coat.
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(-0.74, -0.9); ctx.lineTo(0.74, -0.9);
    ctx.stroke();
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    ctx.arc(-0.12, -0.56, 0.11, Math.PI * 0.2, Math.PI * 1.7);
    ctx.arc(0.12, -0.56, 0.11, Math.PI * 1.3, Math.PI * 2.8);
    ctx.stroke();
    ctx.restore();
}

/**
 * A reindeer from behind, `height` m over its ground point. `phase` 0/1 is
 * the gallop; `rock` (radians) rolls the body. The lead's nose glows by
 * `nose` (0..1).
 */
export function drawReindeer(
    ctx: CanvasRenderingContext2D, x: number, y: number, k: number, height: number, phase: number, rock: number, nose: number,
): void {
    if (k < 1.5) return;
    ctx.save();
    ctx.translate(x, y - height * k);
    ctx.rotate(rock);
    ctx.scale(k, k);
    ctx.lineCap = 'round';

    // Legs: stretched out on one beat of the gallop, tucked on the other.
    ctx.strokeStyle = HIDE_DARK;
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    if (phase === 0) {
        ctx.moveTo(-0.1, 0.1); ctx.lineTo(-0.16, 0.44);
        ctx.moveTo(0.1, 0.1); ctx.lineTo(0.16, 0.44);
    } else {
        ctx.moveTo(-0.1, 0.1); ctx.lineTo(-0.13, 0.24); ctx.lineTo(-0.06, 0.32);
        ctx.moveTo(0.1, 0.1); ctx.lineTo(0.13, 0.24); ctx.lineTo(0.06, 0.32);
    }
    ctx.stroke();

    // Head and antlers, ahead and above the body.
    ctx.strokeStyle = ANTLER;
    ctx.lineWidth = 0.035;
    ctx.beginPath();
    for (const side of [-1, 1]) {
        ctx.moveTo(side * 0.04, -0.36); ctx.lineTo(side * 0.16, -0.58);
        ctx.moveTo(side * 0.1, -0.47); ctx.lineTo(side * 0.2, -0.47);
        ctx.moveTo(side * 0.14, -0.54); ctx.lineTo(side * 0.08, -0.64);
    }
    ctx.stroke();
    ctx.fillStyle = HIDE_DARK;
    ctx.beginPath();
    ctx.arc(0, -0.3, 0.09, 0, TAU);
    ctx.fill();

    // Body, rump toward us, a white tail patch.
    ctx.fillStyle = HIDE;
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.19, 0.2, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#e8dcc8';
    ctx.beginPath();
    ctx.ellipse(0, -0.08, 0.06, 0.05, 0, 0, TAU);
    ctx.fill();
    // Harness collar with a gold bell.
    ctx.fillStyle = '#9e1c22';
    ctx.fillRect(-0.12, -0.21, 0.24, 0.05);
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.arc(0, -0.15, 0.03, 0, TAU);
    ctx.fill();

    if (nose > 0) {
        ctx.globalCompositeOperation = 'lighter';
        const r = 0.12 + 0.18 * nose;
        const g = ctx.createRadialGradient(0, -0.34, 0, 0, -0.34, r);
        g.addColorStop(0, 'rgba(255, 90, 80, 0.95)');
        g.addColorStop(1, 'rgba(255, 40, 40, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(-r, -0.34 - r, r * 2, r * 2);
    }
    ctx.restore();
}

/**
 * A rival at (x, y): a small sleigh (`elf` false) or a low elf sled, the body
 * in the track colour and the driver's hat in `trim`.
 */
export function drawRival(
    ctx: CanvasRenderingContext2D, x: number, y: number, k: number, body: string, trim: string, lean: number, elf: boolean,
): void {
    if (k < 0.8) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean * 0.35);
    ctx.scale(k, k);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = GOLD_DARK;
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    for (const rx of [-0.5, 0.5]) {
        ctx.moveTo(rx * 0.85, elf ? -0.18 : -0.26); ctx.lineTo(rx, -0.03);
    }
    ctx.stroke();
    ctx.fillStyle = body;
    ctx.beginPath();
    if (elf) {
        // A flat sled: a plank with a raised back.
        ctx.rect(-0.5, -0.28, 1.0, 0.12);
    } else {
        ctx.moveTo(-0.46, -0.24); ctx.lineTo(0.46, -0.24); ctx.lineTo(0.6, -0.74); ctx.lineTo(-0.6, -0.74);
        ctx.closePath();
    }
    ctx.fill();
    // The driver: a green coat, a pointed hat in the trim colour.
    const top = elf ? -0.28 : -0.7;
    ctx.fillStyle = '#2f8a4a';
    ctx.beginPath();
    ctx.moveTo(-0.2, top); ctx.lineTo(0.2, top); ctx.lineTo(0.15, top - 0.38); ctx.lineTo(-0.15, top - 0.38);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f0c9a0';
    ctx.beginPath();
    ctx.arc(0, top - 0.48, 0.11, 0, TAU);
    ctx.fill();
    ctx.fillStyle = trim;
    ctx.beginPath();
    ctx.moveTo(-0.13, top - 0.54); ctx.lineTo(0.13, top - 0.54); ctx.lineTo(elf ? 0.22 : 0.05, top - (elf ? 0.92 : 0.86));
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = GOLD;
    ctx.fillRect(-0.5, -0.06, 1.0, 0.04);
    ctx.restore();
}

/**
 * The sparkle trail: gold and white glints streaming off both runners
 * toward the camera. `power` 0..1 sets the length; `tier` 2 tints it holly.
 */
export function drawTrail(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, power: number, time: number, tier: number, lean: number): void {
    if (power <= 0.02 || k < 0.8) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean * 0.35);
    ctx.globalCompositeOperation = 'lighter';
    const hot = tier === 2 ? '#ffc0d0' : '#fff3c0';
    const body = tier === 2 ? '#ff4a6e' : GOLD;
    for (const rx of [-RUNNER, RUNNER]) {
        for (let i = 0; i < 10; i++) {
            const h = hash32(i, rx > 0 ? 31 : 37);
            const life = (time / 0.4 + rand01(h)) % 1;
            const px = (rx + (rand01(hash32(h, 1)) - 0.5) * 0.25 * life) * k;
            const py = (-0.05 + life * (0.3 + power * 1.1)) * k;
            const r = (0.07 * (1 - life) + 0.015) * k;
            ctx.globalAlpha = (1 - life) * Math.min(1, power * 1.5);
            ctx.fillStyle = life < 0.3 ? hot : body;
            ctx.fillRect(px - r, py - r * 0.25, r * 2, r * 0.5);
            ctx.fillRect(px - r * 0.25, py - r, r * 0.5, r * 2);
        }
    }
    ctx.restore();
}

/**
 * Drift sparks thrown off both runners, in the current tier's colour.
 * Twelve particles per runner on a looping 0.3 s life, placed by hash.
 */
export function drawSparks(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, tier: number, time: number, lean: number): void {
    if (tier < 0 || k < 0.8) return;
    const [body, hot] = SPARK_TIERS[Math.min(2, tier)];
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const tilt = Math.sin(lean) * 0.35;
    for (const rx of [-RUNNER, RUNNER]) {
        for (let i = 0; i < 12; i++) {
            const h = hash32(i, rx > 0 ? 7 : 11);
            const life = (time / 0.3 + rand01(h)) % 1;
            const out = rx > 0 ? 1 : -1;
            const px = (rx + tilt * 0.6 + out * life * (0.4 + rand01(hash32(h, 1)) * 0.5)) * k;
            const py = (-0.05 - life * (0.25 + rand01(hash32(h, 2)) * 0.4) + life * life * 0.5) * k;
            const r = (0.12 * (1 - life) + 0.02) * k;
            ctx.globalAlpha = 1 - life;
            ctx.strokeStyle = life < 0.25 ? hot : body;
            ctx.lineWidth = Math.max(1, r * 0.35);
            ctx.beginPath();
            ctx.moveTo(px - r, py); ctx.lineTo(px + r, py);
            ctx.moveTo(px, py - r); ctx.lineTo(px, py + r);
            ctx.stroke();
        }
    }
    if (tier >= 2) {
        // The top tier lights the road under the sleigh.
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.ellipse(tilt * k, 0, 1.1 * k, 0.22 * k, 0, 0, TAU);
        ctx.fill();
    }
    ctx.restore();
}
