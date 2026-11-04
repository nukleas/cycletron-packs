/**
 * The sleigh run's telemetry, in the style of the app's drive HUD. The album
 * letterboxes this mode to 2.39 and pushes the camera in to 1.4×, which
 * leaves x 14–86% and y 23–77% of the frame on screen at the end of a
 * section, so everything sits inside x 15–85%, y 25–75%: the ETA and the
 * sleigh roster on the left, the item slot at the top middle, the place,
 * the bells and the route along the bottom of that box.
 */

import type {Theme} from '@cycletron/viz-sdk';
import {TAU} from '@cycletron/viz-sdk';
import {roadHeading, roadX} from './road.js';

const MONO_FONT = "'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, ui-monospace, monospace";
export const INK = '#e8eef0';
export const MUTED = '#8aa3ad';
export const EDGE = '#2a4352';
const SURFACE = 'rgba(8, 14, 20, 0.78)';
const GOLD = '#efbd73';

export interface HudLayout {
    vw: number;
    vh: number;
    sc: number;
    theme: Theme;
}

export interface Racer {
    label: string;
    css: string;
    player: boolean;
}

/** The band the letterbox leaves clear. */
const top = (L: HudLayout): number => L.vh * 0.25;
const bottom = (L: HudLayout): number => L.vh * 0.75;
const margin = (L: HudLayout): number => Math.max(16, L.vw * 0.15);
const font = (L: HudLayout): number => Math.max(10, 13 * L.sc);

export function hudText(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size = 11,
    color = MUTED, align: CanvasTextAlign = 'left'): void {
    ctx.font = `500 ${Math.round(size)}px ${MONO_FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
}

/** A chamfered plate with one accent tick. */
function hudPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, accent = EDGE): void {
    ctx.beginPath();
    ctx.moveTo(x + 6, y + 0.5); ctx.lineTo(x + w - 0.5, y + 0.5);
    ctx.lineTo(x + w - 0.5, y + h - 6); ctx.lineTo(x + w - 6, y + h - 0.5);
    ctx.lineTo(x + 0.5, y + h - 0.5); ctx.lineTo(x + 0.5, y + 6); ctx.closePath();
    ctx.fillStyle = SURFACE; ctx.fill();
    ctx.strokeStyle = EDGE; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.beginPath(); ctx.moveTo(x + 12, y + 0.5); ctx.lineTo(x + 32, y + 0.5); ctx.stroke();
}

/** Mode name, ETA to the pole and the bar clock, top left; the leg and sync, top right. */
export function drawEta(ctx: CanvasRenderingContext2D, L: HudLayout, eta: number, bar: number, leg: number, legs: number, ready: boolean): void {
    const m = margin(L), y = top(L), f = font(L);
    hudText(ctx, 'SLEIGH ROAD', m, y, f, INK);
    const mm = Math.floor(eta / 60), ss = Math.floor(eta % 60);
    hudText(ctx, `ETA NORTH POLE ${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`, m, y + f * 1.6, f - 1, GOLD);
    hudText(ctx, `BAR ${String(bar + 1).padStart(3, '0')}`, m, y + f * 3, f - 1, MUTED);
    hudText(ctx, ready ? 'SYNC / LIVE' : 'SYNC / IDLE', L.vw - m, y, f, L.theme.neon, 'right');
    hudText(ctx, `LEG ${leg} / ${legs}`, L.vw - m, y + f * 1.6, f - 1, INK, 'right');
}

/** The sleigh roster, under the ETA; only as many rows as fit, you always among them. */
export function drawRoster(ctx: CanvasRenderingContext2D, L: HudLayout, racers: readonly Racer[]): void {
    const f = font(L);
    const x = margin(L), y = top(L) + f * 4.4, w = Math.max(120, 170 * L.sc);
    const rh = Math.max(16, 22 * L.sc);
    const room = Math.max(1, Math.min(racers.length, 5, Math.floor((L.vh * 0.55 - y - rh * 1.2) / rh)));
    const shown = racers.slice(0, room);
    const player = racers.find((r) => r.player);
    if (player && !shown.includes(player)) shown[shown.length - 1] = player;
    hudPanel(ctx, x, y, w, rh * 1.2 + rh * shown.length, L.theme.neon);
    hudText(ctx, 'SLEIGHS', x + 10, y + rh * 0.6, f - 2);
    shown.forEach((r, i) => {
        const ry = y + rh * 1.6 + i * rh;
        if (r.player) { ctx.fillStyle = 'rgba(239, 189, 115, 0.08)'; ctx.fillRect(x + 4, ry - rh / 2, w - 8, rh); }
        hudText(ctx, String(racers.indexOf(r) + 1).padStart(2, '0'), x + 10, ry, f - 1, r.player ? INK : MUTED);
        ctx.fillStyle = r.css; ctx.fillRect(x + 34, ry - 4, 2, 8);
        hudText(ctx, r.label, x + 44, ry, f - 1, r.player ? INK : r.css);
    });
}

/** Place, the bell count and the boost charge, bottom left of the band. */
export function drawPlace(ctx: CanvasRenderingContext2D, L: HudLayout, place: number, bells: number, charge: number, chargeCss: string): void {
    const f = font(L);
    const w = Math.max(110, 140 * L.sc), h = f * 4.6;
    const x = margin(L), y = bottom(L) - h;
    hudPanel(ctx, x, y, w, h, L.theme.neon);
    hudText(ctx, 'PLACE', x + 10, y + f * 0.9, f - 2);
    hudText(ctx, String(place).padStart(2, '0'), x + 10, y + f * 2.4, f * 2, INK);
    hudText(ctx, place === 1 ? 'LEAD' : 'CHASE', x + w - 10, y + f * 2.5, f - 2, L.theme.neon, 'right');
    hudText(ctx, 'BELLS', x + 10, y + h - f * 1.2, f - 2);
    hudText(ctx, String(bells).padStart(3, '0'), x + w - 10, y + h - f * 1.2, f - 1, GOLD, 'right');
    ctx.fillStyle = EDGE; ctx.fillRect(x + 10, y + h - 5, w - 20, 2);
    ctx.fillStyle = chargeCss; ctx.fillRect(x + 10, y + h - 5, (w - 20) * Math.max(0, Math.min(1, charge)), 2);
}

/** Christmas item glyphs: star, candy cane, gift, bell. */
function itemGlyph(ctx: CanvasRenderingContext2D, which: number, x: number, y: number, r: number): void {
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    ctx.beginPath();
    switch (which % 4) {
        case 0:
            for (let i = 0; i < 10; i++) {
                const a = -Math.PI / 2 + (i * Math.PI) / 5;
                const rr = i % 2 === 0 ? r : r * 0.42;
                if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
                else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
            }
            ctx.closePath();
            ctx.fillStyle = GOLD;
            ctx.fill();
            ctx.stroke();
            return;
        case 1:
            ctx.lineWidth = r * 0.32;
            ctx.strokeStyle = '#f4f1ea';
            ctx.moveTo(x + r * 0.25, y + r);
            ctx.lineTo(x + r * 0.25, y - r * 0.3);
            ctx.arc(x - r * 0.1, y - r * 0.3, r * 0.35, 0, Math.PI, true);
            ctx.stroke();
            ctx.strokeStyle = '#e0383e';
            ctx.lineWidth = r * 0.14;
            ctx.beginPath();
            for (let i = 0; i < 3; i++) {
                const yy = y + r * 0.8 - i * r * 0.5;
                ctx.moveTo(x + r * 0.1, yy); ctx.lineTo(x + r * 0.4, yy - r * 0.18);
            }
            ctx.stroke();
            return;
        case 2:
            ctx.rect(x - r * 0.8, y - r * 0.5, r * 1.6, r * 1.4);
            ctx.fillStyle = '#d8262e';
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = GOLD;
            ctx.fillRect(x - r * 0.12, y - r * 0.5, r * 0.24, r * 1.4);
            ctx.fillRect(x - r * 0.8, y + r * 0.08, r * 1.6, r * 0.24);
            ctx.beginPath();
            ctx.ellipse(x - r * 0.25, y - r * 0.7, r * 0.25, r * 0.15, -0.5, 0, TAU);
            ctx.ellipse(x + r * 0.25, y - r * 0.7, r * 0.25, r * 0.15, 0.5, 0, TAU);
            ctx.fill();
            return;
        default:
            ctx.moveTo(x - r * 0.85, y + r * 0.6);
            ctx.quadraticCurveTo(x - r * 0.55, y + r * 0.4, x - r * 0.5, y - r * 0.2);
            ctx.arc(x, y - r * 0.2, r * 0.5, Math.PI, 0);
            ctx.quadraticCurveTo(x + r * 0.55, y + r * 0.4, x + r * 0.85, y + r * 0.6);
            ctx.closePath();
            ctx.fillStyle = GOLD;
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x, y + r * 0.75, r * 0.16, 0, TAU);
            ctx.fill();
            return;
    }
}

/** Item roulette slot at the top middle of the band. */
export function drawItemSlot(ctx: CanvasRenderingContext2D, L: HudLayout, item: number, spin: number, time: number): void {
    if (L.vh < 300) return;
    const size = Math.max(36, 56 * L.sc);
    const x = L.vw / 2 - size / 2, y = top(L) - size * 0.15;
    hudPanel(ctx, x, y, size, size, spin > 0 ? L.theme.neonSecondary : L.theme.neon);
    if (spin > 0 || item >= 0) itemGlyph(ctx, spin > 0 ? Math.floor(time * 14) : item, x + size / 2, y + size / 2, size * 0.26);
    else hudText(ctx, '—', x + size / 2, y + size / 2, 14, MUTED, 'center');
}

/** The route: the road ahead and behind, rotated so you point up; rivals as dots. */
export function drawRoute(ctx: CanvasRenderingContext2D, L: HudLayout, s: number, behind: number, ahead: number,
    racers: ReadonlyArray<{ds: number; lane: number; css: string}>, playerLane: number): void {
    if (L.vw < 480) return;
    const w = Math.max(100, 170 * L.sc), h = Math.max(80, L.vh * 0.22);
    const x = L.vw - margin(L) - w, y = bottom(L) - h;
    hudPanel(ctx, x, y, w, h, L.theme.neon);
    hudText(ctx, 'ROUTE', x + 10, y + 10, font(L) - 3);
    const h0 = roadHeading(s);
    const c = Math.cos(h0), sn = Math.sin(h0);
    const x0 = roadX(s);
    const span = behind + ahead;
    const k = (h - 24) / span;
    const cx = x + w / 2;
    const base = y + h - 8 - behind * k;
    const at = (ds: number, lane: number): [number, number] => {
        const dx = roadX(s + ds) + lane - x0;
        const rx = dx * c - ds * sn;
        const rz = dx * sn + ds * c;
        return [cx + rx * k, base - rz * k];
    };
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y + 18, w, h - 18);
    ctx.clip();
    ctx.strokeStyle = MUTED;
    ctx.lineWidth = Math.max(1, 1.5 * L.sc);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let ds = -behind; ds <= ahead; ds += 4) {
        const [px, py] = at(ds, 0);
        if (ds === -behind) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    // The pole at the far end of the view.
    const [fx, fy] = at(ahead, 0);
    ctx.fillStyle = GOLD;
    ctx.fillRect(fx - 2, fy - 2, 4, 4);
    for (const r of racers) {
        const [px, py] = at(r.ds, r.lane);
        ctx.fillStyle = r.css;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(2.5, 4 * L.sc), 0, TAU);
        ctx.fill();
    }
    const [px, py] = at(0, playerLane);
    const r = Math.max(4, 7 * L.sc);
    ctx.fillStyle = '#d8262e';
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, py - r); ctx.lineTo(px + r * 0.7, py + r * 0.6); ctx.lineTo(px, py + r * 0.25); ctx.lineTo(px - r * 0.7, py + r * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

/** A short announcement under the item slot. */
export function drawBanner(ctx: CanvasRenderingContext2D, L: HudLayout, text: string, alpha: number): void {
    if (alpha <= 0.01 || L.vh < 360) return;
    const size = Math.max(36, 56 * L.sc);
    const y = top(L) + size * 0.75;
    ctx.save();
    ctx.globalAlpha = alpha;
    hudPanel(ctx, L.vw / 2 - 70, y, 140, 26, L.theme.neonSecondary);
    hudText(ctx, text, L.vw / 2, y + 13, font(L), INK, 'center');
    ctx.restore();
}
