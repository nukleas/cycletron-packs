/** Readout furniture every station uses: brackets, rules, rows, headings, meters. Mono text via drawLabel. */

import {drawLabel} from '@cycletron/viz-sdk';

/** Corner brackets around a box. */
export function brackets(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, len: number, color: string): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + len); ctx.lineTo(x, y); ctx.lineTo(x + len, y);
    ctx.moveTo(x + w - len, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + len);
    ctx.moveTo(x + w, y + h - len); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - len, y + h);
    ctx.moveTo(x + len, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - len);
    ctx.stroke();
}

export function rule(ctx: CanvasRenderingContext2D, x0: number, y: number, x1: number, color: string): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
}

/** A label on the left and a value flush right. */
export function row(
    ctx: CanvasRenderingContext2D, label: string, value: string, x0: number, x1: number, y: number,
    labelColor: string, valueColor: string, size: number,
): void {
    drawLabel(ctx, label, x0, y, labelColor, size, 'left');
    drawLabel(ctx, value, x1, y, valueColor, size, 'right');
}

/** A section heading with a rule under it. */
export function heading(
    ctx: CanvasRenderingContext2D, text: string, x0: number, x1: number, y: number, color: string, ruleColor: string, size: number,
): void {
    drawLabel(ctx, text, x0, y, color, size, 'left');
    rule(ctx, x0, y + size * 0.9, x1, ruleColor);
}

/** A horizontal bar meter, 0..1. */
export function meter(
    ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, v: number, color: string, track: string,
): void {
    ctx.fillStyle = track;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, v)), h);
}

export function pad(n: number, width: number): string {
    return String(Math.max(0, Math.floor(n))).padStart(width, '0');
}

/** 1,234,567 */
export function group(n: number): string {
    return String(Math.max(0, Math.floor(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
