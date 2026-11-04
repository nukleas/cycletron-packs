/**
 * A monitor inside the console: a pixel screen blitted at an integer scale
 * into a rect, a dark surround filling the rest, a label plate, and a tint
 * once the alert is hot. `fitMonitor` runs in layout(), so the scale comes
 * from the rect and never from a cached frame.
 */

import {drawLabel, PH, PW, type PxScreen} from '@cycletron/viz-sdk';
import {alertColor, type ConsoleInk, type Rect} from './chrome.js';

export interface Monitor extends Rect {
    /** Blit size and position inside the rect. */
    bx: number;
    by: number;
    bw: number;
    bh: number;
}

/**
 * The largest integer scale of the 320×180 screen that fits `rect`, centred.
 * When the integer step would leave more than 30% of the fit unused (a 1×
 * picture in a 1.9× slot), or none fits, the exact fraction is used instead.
 */
export function fitMonitor(rect: Rect): Monitor {
    const scale = Math.min(rect.w / PW, rect.h / PH);
    const whole = Math.floor(scale);
    const k = whole >= 1 && whole / scale >= 0.7 ? whole : scale;
    const bw = Math.round(PW * k), bh = Math.round(PH * k);
    return {...rect, bx: Math.round(rect.x + (rect.w - bw) / 2), by: Math.round(rect.y + (rect.h - bh) / 2), bw, bh};
}

export function drawMonitor(
    ctx: CanvasRenderingContext2D, screen: PxScreen, m: Monitor, ink: ConsoleInk, level: number, label: string, small: number,
): void {
    ctx.save();
    ctx.fillStyle = ink.track;
    ctx.fillRect(m.x, m.y, m.w, m.h);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(screen.canvas, m.bx, m.by, m.bw, m.bh);
    if (level <= 2) {
        ctx.fillStyle = alertColor(ink, level, 0.08);
        ctx.fillRect(m.bx, m.by, m.bw, m.bh);
    }
    ctx.strokeStyle = level <= 2 ? alertColor(ink, level, 0.7) : ink.frame;
    ctx.lineWidth = 1;
    ctx.strokeRect(m.bx - 0.5, m.by - 0.5, m.bw + 1, m.bh + 1);
    // Label plate, top left, over the picture.
    const plateH = small * 1.6, plateW = small * (label.length * 0.62 + 1.6);
    ctx.fillStyle = ink.bg;
    ctx.fillRect(m.bx, m.by, plateW, plateH);
    drawLabel(ctx, label, m.bx + small * 0.8, m.by + plateH / 2, ink.label, small, 'left');
    ctx.restore();
}
