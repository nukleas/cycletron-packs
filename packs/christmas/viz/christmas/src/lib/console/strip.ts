/**
 * The readout strip: one small row of a station's numbers across the bottom
 * of the body, above the footer. It replaces the telemetry columns that used
 * to take the right third of the picture. The footer already carries the log
 * and the band meters, so a station puts only its own figures here.
 */

import {clamp01, drawLabel} from '@cycletron/viz-sdk';
import type {ConsoleInk, ConsoleLayout, Rect} from './chrome.js';
import {rule} from './panel.js';

export interface StripCell {
    label: string;
    /** Text to the right of the label, in the value colour (or `color`). */
    value?: string;
    /** A small bar meter, 0..1, in place of (or after) the value. */
    meter?: number;
    color?: string;
}

/** Height the strip takes off the bottom of the body. */
export function stripHeight(lay: ConsoleLayout): number {
    return Math.round(lay.small * 2.2);
}

/** The body less the strip: what the station's picture fills. */
export function pictureRect(lay: ConsoleLayout): Rect {
    const h = stripHeight(lay);
    return {x: lay.body.x, y: lay.body.y, w: lay.body.w, h: lay.body.h - h};
}

/** Draws `cells` spaced evenly across the strip, with a rule over it. */
export function drawStrip(ctx: CanvasRenderingContext2D, lay: ConsoleLayout, ink: ConsoleInk, cells: readonly StripCell[]): void {
    const h = stripHeight(lay);
    const {body, margin, small} = lay;
    const y0 = body.y + body.h - h;
    const x0 = body.x + margin * 0.6, x1 = body.x + body.w - margin * 0.6;
    ctx.save();
    ctx.fillStyle = ink.bg;
    ctx.fillRect(0, y0, ctx.canvas.width, h);
    rule(ctx, x0, y0 + 0.5, x1, ink.frame);
    const ty = y0 + h * 0.55;
    const n = Math.max(1, cells.length);
    const slot = (x1 - x0) / n;
    const meterW = Math.min(small * 6, slot * 0.4), meterH = small * 0.6;
    cells.forEach((c, i) => {
        const x = x0 + slot * i;
        drawLabel(ctx, c.label, x, ty, ink.labelDim, small, 'left');
        let vx = x + small * (c.label.length * 0.62 + 1);
        if (c.value !== undefined) {
            drawLabel(ctx, c.value, vx, ty, c.color ?? ink.value, small, 'left');
            vx += small * (c.value.length * 0.62 + 1);
        }
        if (c.meter !== undefined) {
            ctx.fillStyle = ink.track;
            ctx.fillRect(vx, ty - meterH / 2, meterW, meterH);
            ctx.fillStyle = c.color ?? ink.value;
            ctx.fillRect(vx, ty - meterH / 2, meterW * clamp01(c.meter), meterH);
        }
        if (i > 0) drawLabel(ctx, '·', x - small * 0.9, ty, ink.frame, small, 'center');
    });
    ctx.restore();
}
