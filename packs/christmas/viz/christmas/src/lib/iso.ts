/**
 * The app's iso-city projection (2:1 dimetric, tile 72×36, 22px a unit of
 * height) with a scale and origin fitted to a rect, and the flat-shaded
 * shapes drawn through it: boxes, quads, cones and star outlines.
 * i runs down-right, j down-left, k up.
 */

import {TAU} from '@cycletron/viz-sdk';
import type {Rect} from './console/chrome.js';

export const ISO_W = 36;
export const ISO_H = 18;
export const ISO_Z = 22;

export function isoX(i: number, j: number): number {
    return (i - j) * ISO_W;
}

export function isoY(i: number, j: number, k: number): number {
    return (i + j) * ISO_H - k * ISO_Z;
}

/** Three faces: top lit, the +j face mid, the +i face dark. */
export interface Shade {
    top: string;
    left: string;
    right: string;
}

export class View {
    scale = 1;
    ox = 0;
    oy = 0;
    /** Edge colour and width for outlines. */
    line = '#000';
    lw = 1;

    /** Fit the iso points (i, j, k triples) into `r`, centred. */
    fit(r: Rect, pts: readonly number[]): void {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let n = 0; n < pts.length; n += 3) {
            const x = isoX(pts[n], pts[n + 1]);
            const y = isoY(pts[n], pts[n + 1], pts[n + 2]);
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
        const s = Math.min(r.w / (maxX - minX), r.h / (maxY - minY));
        this.scale = s;
        this.ox = r.x + (r.w - (maxX - minX) * s) / 2 - minX * s;
        this.oy = r.y + (r.h - (maxY - minY) * s) / 2 - minY * s;
        this.lw = Math.max(1, s * 0.6);
    }

    x(i: number, j: number): number {
        return this.ox + isoX(i, j) * this.scale;
    }

    y(i: number, j: number, k: number): number {
        return this.oy + isoY(i, j, k) * this.scale;
    }
}

/** A box from (i, j, k) of size w × d × h: the +j face, the +i face, the top, then the edges. */
export function box(
    ctx: CanvasRenderingContext2D, v: View, i: number, j: number, k: number, w: number, d: number, h: number,
    s: Shade, edges = true,
): void {
    const t = k + h;
    const ax = v.x(i, j), bx = v.x(i + w, j), cx = v.x(i + w, j + d), dx = v.x(i, j + d);
    const ayT = v.y(i, j, t), byT = v.y(i + w, j, t), cyT = v.y(i + w, j + d, t), dyT = v.y(i, j + d, t);
    const byB = v.y(i + w, j, k), cyB = v.y(i + w, j + d, k), dyB = v.y(i, j + d, k);

    ctx.fillStyle = s.left;
    ctx.beginPath();
    ctx.moveTo(dx, dyT); ctx.lineTo(cx, cyT); ctx.lineTo(cx, cyB); ctx.lineTo(dx, dyB);
    ctx.fill();
    ctx.fillStyle = s.right;
    ctx.beginPath();
    ctx.moveTo(bx, byT); ctx.lineTo(cx, cyT); ctx.lineTo(cx, cyB); ctx.lineTo(bx, byB);
    ctx.fill();
    ctx.fillStyle = s.top;
    ctx.beginPath();
    ctx.moveTo(ax, ayT); ctx.lineTo(bx, byT); ctx.lineTo(cx, cyT); ctx.lineTo(dx, dyT);
    ctx.fill();
    if (!edges) return;
    ctx.strokeStyle = v.line;
    ctx.lineWidth = v.lw;
    ctx.beginPath();
    ctx.moveTo(ax, ayT); ctx.lineTo(bx, byT); ctx.lineTo(bx, byB); ctx.lineTo(cx, cyB); ctx.lineTo(dx, dyB);
    ctx.lineTo(dx, dyT); ctx.closePath();
    ctx.moveTo(dx, dyT); ctx.lineTo(cx, cyT); ctx.lineTo(bx, byT);
    ctx.moveTo(cx, cyT); ctx.lineTo(cx, cyB);
    ctx.stroke();
}

/** A filled quad through four iso points (i, j, k ×4). */
export function quad(ctx: CanvasRenderingContext2D, v: View, p: readonly number[], fill: string): void {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(v.x(p[0], p[1]), v.y(p[0], p[1], p[2]));
    ctx.lineTo(v.x(p[3], p[4]), v.y(p[3], p[4], p[5]));
    ctx.lineTo(v.x(p[6], p[7]), v.y(p[6], p[7], p[8]));
    ctx.lineTo(v.x(p[9], p[10]), v.y(p[9], p[10], p[11]));
    ctx.fill();
}

/** A floor diamond of half-size `r` round (i, j). */
export function diamond(ctx: CanvasRenderingContext2D, v: View, i: number, j: number, r: number, fill: string): void {
    quad(ctx, v, [i - r, j - r, 0, i + r, j - r, 0, i + r, j + r, 0, i - r, j + r, 0], fill);
}

/** A cone standing on (i, j, k), base radius r, height h: two flat halves. */
export function cone(
    ctx: CanvasRenderingContext2D, v: View, i: number, j: number, k: number, r: number, h: number, s: Shade,
): void {
    const bx = v.x(i, j), by = v.y(i, j, k);
    const ay = v.y(i, j, k + h);
    // A ground circle of radius r is an ellipse √2·36 wide, half as tall.
    const rw = r * ISO_W * Math.SQRT2 * v.scale, rh = r * ISO_H * Math.SQRT2 * v.scale;
    ctx.fillStyle = s.left;
    ctx.beginPath();
    ctx.moveTo(bx, ay); ctx.lineTo(bx - rw, by); ctx.lineTo(bx, by + rh);
    ctx.fill();
    ctx.fillStyle = s.right;
    ctx.beginPath();
    ctx.moveTo(bx, ay); ctx.lineTo(bx, by + rh); ctx.lineTo(bx + rw, by);
    ctx.fill();
    ctx.strokeStyle = v.line;
    ctx.lineWidth = v.lw;
    ctx.beginPath();
    ctx.moveTo(bx, ay); ctx.lineTo(bx - rw, by); ctx.lineTo(bx, by + rh); ctx.lineTo(bx + rw, by); ctx.closePath();
    ctx.stroke();
}

/** A five-point star outline facing the viewer, centred r units above (i, j, k). */
export function star(
    ctx: CanvasRenderingContext2D, v: View, i: number, j: number, k: number, r: number, color: string, width: number,
): void {
    const cx = v.x(i, j), cy = v.y(i, j, k) - r * ISO_Z * v.scale;
    const ro = r * ISO_Z * v.scale, ri = ro * 0.45;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let n = 0; n < 10; n++) {
        const a = -TAU / 4 + (n * TAU) / 10;
        const rr = n & 1 ? ri : ro;
        if (n === 0) ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        else ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.stroke();
}
