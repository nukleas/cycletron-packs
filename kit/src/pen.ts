/**
 * Rect primitives for figures drawn around their own feet. `at` sets the
 * origin; `b` and `ln` queue outlined rects, `paint` draws the outlines
 * first and the fills over them, so one figure reads as one shape.
 */

export type Pt = readonly [number, number];

let ox = 0;
let oy = 0;

export function at(x: number, y: number): void {
    ox = Math.round(x);
    oy = Math.round(y);
}

export function b(x: number, y: number, w: number, h: number, c: string, edge = true): void {
    put(ox + x, oy + y, w, h, c, edge);
}

export function ln(x0: number, y0: number, x1: number, y1: number, size: number, c: string, edge = true): void {
    seg(ox + x0, oy + y0, ox + x1, oy + y1, size, c, edge);
}

/** Shoulder to elbow in the sleeve, elbow to hand in the skin, and a 3px hand. */
export function limb(sx: number, sy: number, ex: number, ey: number, hx: number, hy: number, sleeve: string, skin: string): void {
    ln(sx, sy, ex, ey, 2, sleeve);
    ln(ex, ey, hx, hy, 2, skin);
    b(hx - 1, hy - 1, 3, 3, skin);
}

/** Two legs; on a hit one foot stamps, alternating by frame. */
export function stance(hit: number, frame: number, leg: string, shoe: string, gap = 1): void {
    const lift = hit > 0.5 ? frame & 1 : -1;
    const l = lift === 0 ? 1 : 0;
    const r = lift === 1 ? 1 : 0;
    b(-4 - gap, -11 - l, 4, 8, leg);
    b(gap, -11 - r, 4, 8, leg);
    b(-6 - gap, -4 - l, 6, 4, shoe);
    b(gap, -4 - r, 6, 4, shoe);
}

/** A point `t` of the way from (x0, y0) to (x1, y1). */
export function along(x0: number, y0: number, x1: number, y1: number, t: number): Pt {
    return [Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t)];
}

/** Rects for one outlined layer, kept between frames. */
const layer: {x: number; y: number; w: number; h: number; c: string; edge: boolean}[] = [];
let layerN = 0;

export function put(x: number, y: number, w: number, h: number, c: string, edge = true): void {
    let r = layer[layerN];
    if (!r) {
        r = {x: 0, y: 0, w: 0, h: 0, c: '', edge: true};
        layer[layerN] = r;
    }
    r.x = x;
    r.y = y;
    r.w = w;
    r.h = h;
    r.c = c;
    r.edge = edge;
    layerN++;
}

export function paint(ctx: CanvasRenderingContext2D, outline: string): void {
    ctx.fillStyle = outline;
    for (let i = 0; i < layerN; i++) {
        const r = layer[i];
        if (r.edge) ctx.fillRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
    }
    for (let i = 0; i < layerN; i++) {
        const r = layer[i];
        ctx.fillStyle = r.c;
        ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    layerN = 0;
}

/** A `size`-pixel brush along a line. */
export function seg(x0: number, y0: number, x1: number, y1: number, size: number, c: string, edge = true): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) {
        put(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), size, size, c, edge);
    }
}
