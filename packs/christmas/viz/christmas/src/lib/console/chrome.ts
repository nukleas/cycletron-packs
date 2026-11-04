/**
 * The console every station draws through: a header strip (station, the
 * SLEIGHCON block, bar and clock), a footer strip (the alert log, the band
 * meters), corner brackets, and the body rect between them that the station
 * draws into. Colours mix from the theme so it reads in any palette; the
 * alert colour runs neon, yellow, amber, red as the level rises.
 */

import {alphaRamp, clamp01, drawLabel, mixRgb, rampAt, rgbOf, type Theme, type VizServices} from '@cycletron/viz-sdk';
import type {Alert} from './alert.js';
import {pad} from './panel.js';
import {css} from '@naderlabs/pixel-kit/color';

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface ConsoleLayout {
    /** The strip the header text sits in, and the footer's. */
    header: Rect;
    footer: Rect;
    /** What the station draws into. */
    body: Rect;
    margin: number;
    font: number;
    small: number;
}

export interface Station {
    /** `STN-01` */
    code: string;
    /** `SITUATION DISPLAY` */
    name: string;
}

export interface ConsoleInk {
    bg: string;
    frame: string;
    label: string;
    labelDim: string;
    value: string;
    head: string;
    track: string;
    /** Alert colour per level, index 1..5, as alpha ramps. */
    alert: string[][];
    /** Text on an alert block. */
    onAlert: string;
}

export function layoutConsole(s: VizServices): ConsoleLayout {
    const w = s.width, h = s.height;
    const margin = Math.round(h * 0.03);
    const font = Math.max(8, Math.round(h / 54));
    const small = Math.max(7, Math.round(font * 0.8));
    const headerH = Math.round(font * 2.6);
    const footerH = Math.round(small * 2.4);
    const header = {x: margin, y: margin, w: w - 2 * margin, h: headerH};
    const footer = {x: margin, y: h - margin - footerH, w: w - 2 * margin, h: footerH};
    const body = {x: margin, y: header.y + headerH, w: w - 2 * margin, h: footer.y - (header.y + headerH)};
    return {header, footer, body, margin, font, small};
}

export function bakeConsoleInk(theme: Theme): ConsoleInk {
    const neon = rgbOf(theme.neon, [71, 246, 255]);
    const sec = rgbOf(theme.neonSecondary, [255, 80, 200]);
    const act = rgbOf(theme.active, [255, 230, 90]);
    const red = rgbOf(theme.red, [255, 60, 60]);
    const text = theme.textRgb;
    const neonRamp = alphaRamp(neon);
    const textRamp = alphaRamp(text);
    return {
        bg: theme.bg,
        frame: rampAt(neonRamp, 0.4),
        label: rampAt(textRamp, 0.9),
        labelDim: rampAt(textRamp, 0.55),
        value: theme.active,
        head: theme.neonSecondary,
        track: css(mixRgb(theme.bgRgb, text, 0.18)),
        alert: [[], alphaRamp(red), alphaRamp(mixRgb(sec, red, 0.35)), alphaRamp(act), alphaRamp(mixRgb(neon, act, 0.3)), neonRamp],
        onAlert: theme.bg,
    };
}

/** The alert colour at full alpha for `level`. */
export function alertColor(ink: ConsoleInk, level: number, alpha = 1): string {
    return rampAt(ink.alert[level], alpha);
}

/** True while the SLEIGHCON block blinks: half a bar after a change, and always at level 1. */
export function alertBlink(alert: Alert): boolean {
    const cycle = alert.cycle;
    const fresh = cycle - alert.changedAt < 0.5;
    if (!fresh && alert.level > 1) return false;
    return (Math.floor(cycle * (fresh ? 8 : 2)) & 1) === 0;
}

/** Draws the strips and brackets over whatever the station painted. */
export function drawConsole(ctx: CanvasRenderingContext2D, s: VizServices, lay: ConsoleLayout, ink: ConsoleInk, alert: Alert, station: Station): void {
    const {header, footer, body, margin, font, small} = lay;
    const cycle = alert.cycle;
    const level = alert.level;
    const hot = level <= 2;
    const blink = alertBlink(alert);
    const edge = hot ? alertColor(ink, level, blink ? 0.9 : 0.5) : ink.frame;

    ctx.save();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';

    // Strips, painted so the station never shows through the text.
    ctx.fillStyle = ink.bg;
    ctx.fillRect(0, 0, s.width, body.y);
    ctx.fillRect(0, footer.y, s.width, s.height - footer.y);

    // Brackets around the whole console.
    const bx = header.x, by = header.y, bw = header.w, bh = footer.y + footer.h - header.y;
    const len = margin * 1.2;
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx, by + len); ctx.lineTo(bx, by); ctx.lineTo(bx + len, by);
    ctx.moveTo(bx + bw - len, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + len);
    ctx.moveTo(bx + bw, by + bh - len); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw - len, by + bh);
    ctx.moveTo(bx + len, by + bh); ctx.lineTo(bx, by + bh); ctx.lineTo(bx, by + bh - len);
    ctx.stroke();

    // Header: station left, the SLEIGHCON block in the middle, bar and clock right.
    const x0 = header.x + margin * 0.6, x1 = header.x + header.w - margin * 0.6;
    const ty = header.y + header.h * 0.5;
    drawLabel(ctx, station.code, x0, ty, ink.labelDim, font, 'left');
    drawLabel(ctx, station.name, x0 + font * 4.2, ty, ink.value, Math.round(font * 1.2), 'left');

    const blockW = font * 8.4, blockH = font * 1.7;
    const blockX = header.x + header.w * 0.5 - blockW / 2, blockY = ty - blockH / 2;
    const lit = !hot || blink;
    ctx.fillStyle = alertColor(ink, level, lit ? 1 : 0.25);
    ctx.fillRect(blockX, blockY, blockW, blockH);
    drawLabel(ctx, `SLEIGHCON ${level}`, blockX + blockW / 2, ty, lit ? ink.onAlert : alertColor(ink, level), font, 'center');
    // Level pips either side of the block.
    const pipW = font * 0.5, pipGap = font * 0.3;
    for (let i = 0; i < 5; i++) {
        const on = i >= level - 1;
        ctx.fillStyle = on ? alertColor(ink, level, 0.9) : ink.track;
        const px = blockX - pipGap - (i + 1) * (pipW + pipGap);
        ctx.fillRect(px, ty - pipW / 2, pipW, pipW);
        ctx.fillRect(blockX + blockW + pipGap + i * (pipW + pipGap), ty - pipW / 2, pipW, pipW);
    }

    const bar = Math.floor(cycle);
    const beat = Math.floor((cycle - bar) * 4) + 1;
    const secs = Math.max(0, cycle) * (240 / Math.max(1, s.bpm));
    const hh = Math.floor(secs / 3600), mm = Math.floor(secs / 60) % 60, ss = Math.floor(secs) % 60;
    const clock = `T+${pad(hh, 2)}:${pad(mm, 2)}:${pad(ss, 2)}`;
    drawLabel(ctx, `BAR ${pad(bar + 1, 3)} · BEAT ${beat} · ${Math.round(s.bpm)} BPM · ${clock}`, x1, ty, ink.label, font, 'right');
    rule(ctx, x0, body.y - 1, x1, ink.frame);

    // Footer: the newest log lines left, the band meters right.
    const fy = footer.y + footer.h * 0.5;
    rule(ctx, x0, footer.y + 1, x1, ink.frame);
    const lines = alert.log;
    const newest = lines.length > 0 ? lines[lines.length - 1] : 'STANDBY';
    const older = lines.length > 1 ? lines[lines.length - 2] : '';
    drawLabel(ctx, `> ${newest}`, x0, fy, ink.value, small, 'left');
    // The older line only where it clears the meters on the right.
    if (older && footer.w > small * 80) drawLabel(ctx, `> ${older}`, x0 + small * 22, fy, ink.labelDim, small, 'left');
    const bands: Array<[string, number]> = [['LO', s.low], ['MID', s.mid], ['HI', s.high]];
    let mx = x1;
    const mw = small * 5, mh = small * 0.6;
    for (let i = bands.length - 1; i >= 0; i--) {
        const [name, val] = bands[i];
        mx -= mw;
        ctx.fillStyle = ink.track;
        ctx.fillRect(mx, fy - mh / 2, mw, mh);
        ctx.fillStyle = alertColor(ink, level, 0.8);
        ctx.fillRect(mx, fy - mh / 2, mw * clamp01(val), mh);
        mx -= small * 2.4;
        drawLabel(ctx, name, mx + small * 2.1, fy, ink.labelDim, small, 'right');
        mx -= small * 0.4;
    }
    drawLabel(ctx, alert.locked ? `NET SYNC · ${alert.tracks} TRK · ${pad(alert.onsets, 2)} EV/BAR` : 'NET STANDBY', mx - small, fy, ink.labelDim, small, 'right');
    ctx.restore();
}

export function rule(ctx: CanvasRenderingContext2D, x0: number, y: number, x1: number, color: string): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
}
