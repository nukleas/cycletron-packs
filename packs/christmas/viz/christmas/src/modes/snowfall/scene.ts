/**
 * The SAT FEED picture behind the notes: starfield, Milky Way, aurora borealis,
 * crescent moon, snow-capped mountain ranges and evergreen forest treeline, a
 * two-tier winter village with timber cottages, smoking chimneys, church spire
 * and town Christmas tree, a contoured snowfield with warm window light pools,
 * foreground snow-laden pines, fence, snowman and Victorian streetlamp, and
 * three layers of falling snow.
 *
 * bake() lays out the geometry from deterministic hashes of the index alone, so
 * layout() can rerun at any time; the draw calls batch paths by colour and derive
 * all animation from `cycle` and the drum envelopes.
 */

import {hash32, rand01, TAU} from '@cycletron/viz-sdk';
import type {Rect} from '../../lib/console/chrome.js';

/** The ground line, as a fraction of the body height. */
export const GROUND = 0.8;

const STARS = 320;
const MILKY = 420;
const BACK_HOUSES = 11;
const HOUSES = 14;
const CHURCH = 7;
const SPARKLES = 180;
/** Flakes per layer, far to near, about 600 in all. */
const FLAKES = [300, 200, 100];
/** Body heights a cycle, low and high, per layer. */
const FALL = [[0.05, 0.09], [0.11, 0.18], [0.24, 0.34]];
const WOBBLE = [3, 7, 12];
const SWAY = [0.3, 0.7, 1.2];

export interface ScenePalette {
    sky: string;
    skyMid: string;
    skyTop: string;
    auroraGreen: string;
    auroraViolet: string;
    starBright: string;
    starDim: string;
    starFaint: string;
    milky: string;
    moon: string;
    moonHalo: string;
    mountainFar: string;
    mountainNear: string;
    mountainSnow: string;
    forest: string;
    skyline: string;
    houseBack: string;
    house: string;
    houseTrim: string;
    roof: string;
    chimney: string;
    windowDark: string;
    window: string;
    windowWarm: string;
    windowGlow: string;
    smoke: string;
    cap: string;
    tree: string;
    treeDark: string;
    ornamentRed: string;
    ornamentCyan: string;
    ornamentGold: string;
    near: string;
    pool: string;
    poolFaint: string;
    ground: string;
    groundLit: string;
    drift: string;
    sparkle: string;
    flake: string;
    flakeDim: string;
    flakeFaint: string;
}

interface Window {
    x: number;
    y: number;
    w: number;
    h: number;
    house: number;
    /** Lit whatever the clock says (the church, or key windows). */
    always: boolean;
    /** Back-row cottage window (smaller, no mullions). */
    back: boolean;
    /** Arched top (church lancet). */
    arched: boolean;
}

/** A chimney top: centre x, top y (relative to the ground line), width, and the house it sits on. */
export interface Chimney {
    x: number;
    y: number;
    w: number;
    house: number;
}

interface PineTree {
    x: number;
    baseY: number;
    h: number;
    w: number;
    tiers: number;
}

interface Ornament {
    x: number;
    y: number;
    r: number;
    color: number;
    seed: number;
}

export class Scene {
    private b: Rect = {x: 0, y: 0, w: 1, h: 1};
    private gy = 0;
    private readonly starX = new Float32Array(STARS);
    private readonly starY = new Float32Array(STARS);
    private readonly starS = new Uint8Array(STARS);
    private readonly starTier = new Uint8Array(STARS);
    /** Per frame: 0 bright, 1 dim, 2 faint. */
    private readonly starLevel = new Uint8Array(STARS);
    private readonly milkyX = new Float32Array(MILKY);
    private readonly milkyY = new Float32Array(MILKY);

    /** Mountain ridge vertices (x, y relative to ground line) and snow-cap triangles. */
    private farRidge: number[] = [];
    private nearRidge: number[] = [];
    private ridgeSnowTris: number[] = [];
    private forestTris: number[] = [];

    /** Back-row hillside cottages. */
    private backRects: number[] = [];
    private backTris: number[] = [];
    private backCaps: number[] = [];

    /** Foreground village houses, roofs, timber trim, chimneys, doors and snow caps. */
    private houseRects: number[] = [];
    private roofTris: number[] = [];
    private chimneyRects: number[] = [];
    private trimSegs: number[] = [];
    private doorRects: number[] = [];
    private wreaths: number[] = [];
    private caps: number[] = [];
    private windows: Window[] = [];
    private chimneys: Chimney[] = [];
    private houseCenters: number[] = [];

    /** Church rose window & spire cross, plus the town square Christmas tree. */
    private churchCross = {x: 0, y: 0, s: 0};
    private churchRose = {x: 0, y: 0, r: 0};
    private townTree: PineTree = {x: 0, baseY: 0, h: 0, w: 0, tiers: 5};
    private ornaments: Ornament[] = [];
    private garlandBulbs: number[] = [];

    /** Foreground fence, snow-laden pines, bare tree, snowman and Victorian streetlamp. */
    private nearRects: number[] = [];
    private nearTris: number[] = [];
    private nearSegs: number[] = [];
    private nearCaps: number[] = [];
    private nearPines: PineTree[] = [];
    private snowman = {x: 0, y: 0, s: 0};
    private lamp = {x: 0, y: 0, postX: 0, topY: 0, base: 0, h: 0};

    private drifts: number[] = [];
    private readonly sparkX = new Float32Array(SPARKLES);
    private readonly sparkY = new Float32Array(SPARKLES);
    private readonly flakeX: Float32Array[] = FLAKES.map((n) => new Float32Array(n));
    private readonly flakeY: Float32Array[] = FLAKES.map((n) => new Float32Array(n));
    private readonly flakeV: Float32Array[] = FLAKES.map((n) => new Float32Array(n));
    private readonly flakeS: Uint8Array[] = FLAKES.map((n) => new Uint8Array(n));

    /** Chimney tops, for Santa. */
    get chimneyTops(): readonly Chimney[] {
        return this.chimneys;
    }

    bake(b: Rect): void {
        this.b = b;
        this.gy = Math.round(b.y + b.h * GROUND);
        this.bakeSky();
        this.bakeMountains();
        this.bakeTown();
        this.bakeNear();
        this.bakeGround();
        this.bakeSnow();
    }

    private bakeSky(): void {
        const b = this.b;
        const skyH = b.h * GROUND;
        for (let i = 0; i < STARS; i++) {
            this.starX[i] = Math.round(b.x + rand01(hash32(i, 101)) * b.w);
            this.starY[i] = Math.round(b.y + rand01(hash32(i, 102)) * skyH * 0.82);
            this.starS[i] = rand01(hash32(i, 103)) < 0.25 ? 2 : 1;
            this.starTier[i] = rand01(hash32(i, 104)) < 0.3 ? 0 : 1;
        }
        // The Milky Way runs low left to high right; its stars bunch about the middle line.
        const x0 = b.x + b.w * 0.04, y0 = b.y + skyH * 0.7;
        const x1 = b.x + b.w * 0.96, y1 = b.y + skyH * 0.02;
        const len = Math.hypot(x1 - x0, y1 - y0);
        const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
        for (let i = 0; i < MILKY; i++) {
            const t = rand01(hash32(i, 111));
            const off = (rand01(hash32(i, 112)) + rand01(hash32(i, 113)) + rand01(hash32(i, 114)) - 1.5) * b.h * 0.09;
            this.milkyX[i] = Math.round(x0 + (x1 - x0) * t + nx * off);
            this.milkyY[i] = Math.round(y0 + (y1 - y0) * t + ny * off);
        }
    }

    /** Distant alpine mountain ranges and mid-ground evergreen pine forest behind the village. */
    private bakeMountains(): void {
        const b = this.b;
        const farPts: number[] = [];
        const nearPts: number[] = [];
        const snowTris: number[] = [];

        const farPeaks = 9;
        for (let i = 0; i <= farPeaks * 2; i++) {
            const u = i / (farPeaks * 2);
            const x = Math.round(b.x + u * b.w);
            const isPeak = (i & 1) === 1;
            const baseH = isPeak
                ? b.h * (0.22 + 0.11 * rand01(hash32(i, 120)))
                : b.h * (0.12 + 0.05 * rand01(hash32(i, 121)));
            const y = -Math.round(baseH);
            farPts.push(x, y);
        }
        for (let i = 2; i < farPts.length - 2; i += 4) {
            const px = farPts[i], py = farPts[i + 1];
            const lx = farPts[i - 2], ly = farPts[i - 1];
            const rx = farPts[i + 2], ry = farPts[i + 3];
            const capFrac = 0.36;
            snowTris.push(
                px, py,
                Math.round(px + (lx - px) * capFrac), Math.round(py + (ly - py) * capFrac),
                Math.round(px + (rx - px) * (capFrac * 0.75)), Math.round(py + (ry - py) * (capFrac * 0.75)),
            );
        }

        const nearPeaks = 11;
        for (let i = 0; i <= nearPeaks * 2; i++) {
            const u = i / (nearPeaks * 2);
            const x = Math.round(b.x + u * b.w);
            const isPeak = (i & 1) === 0;
            const baseH = isPeak
                ? b.h * (0.14 + 0.07 * rand01(hash32(i, 124)))
                : b.h * (0.08 + 0.04 * rand01(hash32(i, 125)));
            nearPts.push(x, -Math.round(baseH));
        }

        // Dense evergreen pine treeline along the foothills behind the cottages.
        const forest: number[] = [];
        const trees = 48;
        for (let i = 0; i < trees; i++) {
            const tx = Math.round(b.x + ((i + 0.2 + 0.6 * rand01(hash32(i, 126))) / trees) * b.w);
            const tw = Math.round(b.w * (0.012 + 0.008 * rand01(hash32(i, 127))));
            const th = Math.round(b.h * (0.065 + 0.045 * rand01(hash32(i, 128))));
            const base = -Math.round(b.h * 0.015);
            forest.push(tx - tw, base, tx, base - th, tx + tw, base);
            forest.push(
                tx - Math.round(tw * 0.8), base - Math.round(th * 0.35),
                tx, base - Math.round(th * 1.15),
                tx + Math.round(tw * 0.8), base - Math.round(th * 0.35),
            );
        }

        this.farRidge = farPts;
        this.nearRidge = nearPts;
        this.ridgeSnowTris = snowTris;
        this.forestTris = forest;
    }

    private bakeTown(): void {
        const b = this.b;
        const backRects: number[] = [], backTris: number[] = [], backCaps: number[] = [];
        const houseRects: number[] = [], roofTris: number[] = [], chimneyRects: number[] = [];
        const trimSegs: number[] = [], doorRects: number[] = [], wreaths: number[] = [];
        const caps: number[] = [], windows: Window[] = [], chimneys: Chimney[] = [];
        const houseCenters: number[] = [];
        const garlandBulbs: number[] = [];

        // 1. Back row of hillside cottages nestled above the main street.
        const backSlot = b.w / BACK_HOUSES;
        const hillY = -b.h * 0.032;
        for (let i = 0; i < BACK_HOUSES; i++) {
            if (i === 5) continue; // Leave breathing room behind the church spire.
            const w = backSlot * (0.48 + 0.24 * rand01(hash32(i, 201)));
            const h = b.h * (0.042 + 0.035 * rand01(hash32(i, 202)));
            const x = b.x + (i + 0.15) * backSlot + (backSlot - w) * 0.5 * rand01(hash32(i, 203));
            const y = hillY - h;
            const eave = w * 0.07;
            const roofH = Math.min(h * 0.8, w * 0.34);
            const mid = x + w / 2;
            backRects.push(x, y, w, h + b.h * 0.035);
            backTris.push(x - eave, y, mid, y - roofH, x + w + eave, y);
            backCaps.push(x - eave, y, mid, y - roofH, mid, y - roofH, x + w + eave, y);

            const ww = Math.max(3, w * 0.16), wh = Math.max(4, h * 0.28);
            const wy = y + h * 0.25;
            windows.push({
                x: Math.round(x + w * 0.22), y: Math.round(wy), w: Math.round(ww), h: Math.round(wh),
                house: 20 + i, always: false, back: true, arched: false,
            });
            windows.push({
                x: Math.round(x + w * 0.62), y: Math.round(wy), w: Math.round(ww), h: Math.round(wh),
                house: 20 + i, always: false, back: true, arched: false,
            });
        }

        // 2. Foreground village cottages, chalets, and the central parish church.
        const slot = b.w / HOUSES;
        for (let i = 0; i < HOUSES; i++) {
            const church = i === CHURCH;
            const w = slot * (church ? 0.86 : 0.62 + 0.28 * rand01(hash32(i, 131)));
            const h = b.h * (church ? 0.115 : 0.058 + 0.068 * rand01(hash32(i, 132)));
            const x = b.x + i * slot + (slot - w) * rand01(hash32(i, 133));
            const y = -h;
            const mid = x + w / 2;
            houseCenters.push(Math.round(mid));

            houseRects.push(x, y, w, h + 3);
            // Horizontal eave beam & vertical corner timber posts
            trimSegs.push(x, y, x + w, y);
            trimSegs.push(x + 1, y, x + 1, 0);
            trimSegs.push(x + w - 1, y, x + w - 1, 0);

            const pitched = church || hash32(i, 134) % 4 !== 0;
            const eave = w * 0.09;
            const roofH = pitched ? Math.min(h * 0.92, w * (0.34 + 0.22 * rand01(hash32(i, 135)))) : 0;
            if (pitched) {
                roofTris.push(x - eave, y, mid, y - roofH, x + w + eave, y);
                caps.push(x - eave, y, mid, y - roofH, mid, y - roofH, x + w + eave, y);
                // Gable timber collar beam
                if (roofH > b.h * 0.025) {
                    trimSegs.push(mid - (w * 0.25), y - roofH * 0.45, mid + (w * 0.25), y - roofH * 0.45);
                    trimSegs.push(mid, y - roofH, mid, y);
                }
            } else {
                caps.push(x - 2, y, x + w + 2, y);
            }

            // Stone chimney & smoke source
            if (!church && (!pitched || (hash32(i, 136) % 3) !== 0)) {
                const cw = Math.max(4, w * 0.12);
                const cx = x + w * (0.16 + 0.58 * rand01(hash32(i, 137)));
                const edge = Math.max(Math.abs(cx - mid), Math.abs(cx + cw - mid));
                const under = pitched ? roofH * Math.max(0, 1 - edge / (w / 2 + eave)) : 0;
                const top = y - under - h * 0.30;
                chimneyRects.push(cx, top, cw, y - top + 1);
                caps.push(cx - 1, top, cx + cw + 1, top);
                chimneys.push({x: Math.round(cx + cw * 0.5), y: Math.round(top), w: Math.round(cw), house: i});
            }

            // Cottage door with holiday wreath
            const dw = Math.max(4, w * (church ? 0.16 : 0.15));
            const dh = Math.min(h * 0.38, b.h * 0.032);
            const dx = church ? mid - dw / 2 : x + w * (0.42 + 0.16 * rand01(hash32(i, 139)));
            doorRects.push(dx, -dh, dw, dh + 2);
            wreaths.push(Math.round(dx + dw / 2), Math.round(-dh * 0.62), Math.max(2, Math.round(dw * 0.28)));

            // Windows: 2 to 4 windows, plus an attic gable window on taller chalets.
            const n = church ? 4 : 2 + (hash32(i, 138) % 3);
            const cols = n === 4 && !church ? 2 : church ? 4 : n;
            const rowsN = n === 4 && !church ? 2 : 1;
            const ww = Math.max(4, w * (cols >= 3 ? 0.13 : 0.18));
            const wh = Math.max(5, h * (rowsN === 2 ? 0.21 : church ? 0.38 : 0.27));
            const usableH = h - dh * 0.7;
            const gapX = (w - cols * ww) / (cols + 1);
            const gapY = (usableH - rowsN * wh) / (rowsN + 1);
            for (let r = 0; r < rowsN; r++) {
                for (let c = 0; c < cols; c++) {
                    if (church && (c === 1 || c === 2)) continue; // Central tower occupies the middle of the church
                    const wx = x + gapX + c * (ww + gapX);
                    const wy = y + gapY + r * (wh + gapY);
                    windows.push({
                        x: Math.round(wx), y: Math.round(wy), w: Math.round(ww), h: Math.round(wh),
                        house: i, always: church, back: false, arched: church,
                    });
                }
            }
            if (!church && pitched && roofH > b.h * 0.032) {
                const aw = Math.max(3, Math.round(ww * 0.75)), ah = Math.max(3, Math.round(wh * 0.65));
                windows.push({
                    x: Math.round(mid - aw / 2), y: Math.round(y - roofH * 0.55), w: aw, h: ah,
                    house: i, always: false, back: false, arched: true,
                });
            }

            // Colourful eave fairy-light bulbs on the church and every second cottage.
            if (church || (i & 1) === 0) {
                const bulbs = Math.max(5, Math.round(w / (b.w * 0.009)));
                for (let k = 0; k <= bulbs; k++) {
                    const bx = x - eave * 0.5 + ((w + eave) * k) / bulbs;
                    const sag = Math.sin((k / bulbs) * Math.PI) * b.h * 0.004;
                    garlandBulbs.push(Math.round(bx), Math.round(y + sag), (i + k) % 3);
                }
            }

            if (church) {
                // Bell tower, belfry lancet window, stained-glass rose window, tall spire & cross.
                const tw = w * 0.32, tx = mid - tw / 2;
                const tTop = y - roofH - h * 0.42;
                houseRects.push(tx, tTop, tw, y - tTop + 2);
                const spire = h * 1.15;
                roofTris.push(tx - tw * 0.1, tTop, mid, tTop - spire, tx + tw * 1.1, tTop);
                caps.push(tx - tw * 0.1, tTop, mid, tTop - spire, mid, tTop - spire, tx + tw * 1.1, tTop);
                windows.push({
                    x: Math.round(mid - tw * 0.2), y: Math.round(tTop + h * 0.08),
                    w: Math.round(tw * 0.4), h: Math.round(h * 0.26),
                    house: i, always: true, back: false, arched: true,
                });
                this.churchRose = {
                    x: Math.round(mid),
                    y: Math.round(y - roofH * 0.42),
                    r: Math.max(3, Math.round(tw * 0.22)),
                };
                this.churchCross = {
                    x: Math.round(mid),
                    y: Math.round(tTop - spire),
                    s: Math.max(4, Math.round(b.h * 0.014)),
                };

                // Town Square Christmas Tree standing in the plaza beside the church.
                const treeX = Math.round(x - slot * 0.12);
                const treeH = Math.round(b.h * 0.135);
                const treeW = Math.round(b.w * 0.025);
                this.townTree = {x: treeX, baseY: 2, h: treeH, w: treeW, tiers: 5};
                const orns: Ornament[] = [];
                for (let t = 0; t < 5; t++) {
                    const ty = 2 - treeH * (0.18 + t * 0.16);
                    const span = treeW * (0.88 - t * 0.15);
                    const count = 4 - Math.floor(t * 0.6);
                    for (let c = 0; c < count; c++) {
                        const u = count === 1 ? 0 : (c / (count - 1)) * 2 - 1;
                        orns.push({
                            x: Math.round(treeX + u * span * 0.72),
                            y: Math.round(ty + Math.abs(u) * b.h * 0.005),
                            r: Math.max(1.5, b.h * 0.0032),
                            color: (t + c) % 3,
                            seed: t * 7 + c,
                        });
                    }
                }
                this.ornaments = orns;
            }
        }

        this.backRects = backRects.map(Math.round);
        this.backTris = backTris.map(Math.round);
        this.backCaps = backCaps.map(Math.round);
        this.houseRects = houseRects.map(Math.round);
        this.roofTris = roofTris.map(Math.round);
        this.chimneyRects = chimneyRects.map(Math.round);
        this.trimSegs = trimSegs.map(Math.round);
        this.doorRects = doorRects.map(Math.round);
        this.wreaths = wreaths;
        this.caps = caps.map(Math.round);
        this.windows = windows;
        this.chimneys = chimneys;
        this.houseCenters = houseCenters;
        this.garlandBulbs = garlandBulbs;
    }

    /** In front of the ground line: snow-capped fence, snow-laden pines, bare winter tree, snowman & Victorian streetlamp. */
    private bakeNear(): void {
        const b = this.b;
        const base = b.h * 0.075;
        const nearRects: number[] = [], nearTris: number[] = [], nearSegs: number[] = [], nearCaps: number[] = [];
        const postH = b.h * 0.036, postW = Math.max(2, b.w * 0.0028), step = b.w * 0.014;
        for (const [a, z] of [[0.04, 0.34], [0.64, 0.86]]) {
            const x0 = b.x + b.w * a, x1 = b.x + b.w * z;
            for (let x = x0; x <= x1; x += step) {
                nearRects.push(x, base - postH, postW, postH);
                nearCaps.push(x - 1, base - postH, x + postW + 1, base - postH);
            }
            nearSegs.push(x0, base - postH * 0.75, x1 + postW, base - postH * 0.75);
            nearSegs.push(x0, base - postH * 0.3, x1 + postW, base - postH * 0.3);
            nearCaps.push(x0, base - postH * 0.75 - 1, x1 + postW, base - postH * 0.75 - 1);
        }

        // Foreground snow-laden evergreen pine trees (left and right flanks)
        this.nearPines = [
            {x: Math.round(b.x + b.w * 0.08), baseY: Math.round(base + b.h * 0.01), h: Math.round(b.h * 0.17), w: Math.round(b.w * 0.032), tiers: 5},
            {x: Math.round(b.x + b.w * 0.37), baseY: Math.round(base - b.h * 0.005), h: Math.round(b.h * 0.145), w: Math.round(b.w * 0.026), tiers: 4},
            {x: Math.round(b.x + b.w * 0.90), baseY: Math.round(base + b.h * 0.012), h: Math.round(b.h * 0.185), w: Math.round(b.w * 0.035), tiers: 5},
        ];

        // One detailed bare winter tree at x = 0.42
        {
            const tx = b.x + b.w * 0.42, tH = b.h * 0.145;
            const foot = b.h * 0.006;
            nearTris.push(tx - foot, base, tx, base - tH, tx + foot, base);
            for (let j = 0; j < 6; j++) {
                const at = base - tH * (0.32 + 0.11 * j);
                const side = j & 1 ? 1 : -1;
                const reach = tH * (0.34 - 0.045 * j) * (0.85 + 0.3 * rand01(hash32(j, 142)));
                const ex = tx + side * reach, ey = at - reach * 0.68;
                nearSegs.push(tx, at, ex, ey);
                nearSegs.push(
                    tx + (ex - tx) * 0.55, at + (ey - at) * 0.55,
                    tx + (ex - tx) * 0.72 - side * reach * 0.16, ey - reach * 0.26,
                );
            }
        }

        // Cozy snowman beside the left fence
        this.snowman = {
            x: Math.round(b.x + b.w * 0.29),
            y: Math.round(base + b.h * 0.008),
            s: Math.max(4, Math.round(b.h * 0.018)),
        };

        // Ornate Victorian streetlamp with curved bracket and lantern housing
        const lx = b.x + b.w * 0.605, lH = b.h * 0.135, lw = Math.max(2, b.h * 0.0042);
        nearRects.push(lx - lw / 2, base - lH, lw, lH);
        nearRects.push(lx - lw * 1.2, base - lH * 0.22, lw * 2.4, lH * 0.22);
        nearRects.push(lx - lw * 2.2, base - lw * 2, lw * 4.4, lw * 2);
        // Crossbar near top of post
        nearSegs.push(lx - lw * 2.2, base - lH * 0.82, lx + lw * 2.2, base - lH * 0.82);
        // Bracket arm out to the lantern
        const armX = lx + b.h * 0.022;
        nearSegs.push(lx, base - lH, armX, base - lH);
        nearSegs.push(lx, base - lH * 0.88, armX * 0.6 + lx * 0.4, base - lH);
        this.lamp = {
            x: Math.round(armX),
            y: Math.round(base - lH + lw * 1.8),
            postX: Math.round(lx),
            topY: Math.round(base - lH),
            base: Math.round(base),
            h: Math.round(lH),
        };
        this.nearRects = nearRects.map(Math.round);
        this.nearTris = nearTris.map(Math.round);
        this.nearSegs = nearSegs.map(Math.round);
        this.nearCaps = nearCaps.map(Math.round);
    }

    private bakeGround(): void {
        const b = this.b;
        this.drifts = [];
        for (let i = 0; i < 6; i++) {
            const cx = b.x + b.w * (0.08 + 0.17 * i + 0.05 * rand01(hash32(i, 151)));
            const cy = b.h * (0.012 + 0.045 * rand01(hash32(i, 152)));
            const rx = b.w * (0.10 + 0.08 * rand01(hash32(i, 153)));
            const ry = b.h * (0.016 + 0.012 * rand01(hash32(i, 154)));
            this.drifts.push(Math.round(cx), Math.round(cy), Math.round(rx), Math.round(ry));
        }
        const deep = b.h * (1 - GROUND);
        for (let i = 0; i < SPARKLES; i++) {
            this.sparkX[i] = Math.round(b.x + rand01(hash32(i, 161)) * b.w);
            this.sparkY[i] = Math.round(rand01(hash32(i, 162)) * deep);
        }
    }

    private bakeSnow(): void {
        for (let l = 0; l < FLAKES.length; l++) {
            const [lo, hi] = FALL[l];
            for (let i = 0; i < FLAKES[l]; i++) {
                const k = l * 1000 + i;
                this.flakeX[l][i] = rand01(hash32(k, 171));
                this.flakeY[l][i] = rand01(hash32(k, 172));
                this.flakeV[l][i] = lo + (hi - lo) * rand01(hash32(k, 173));
                this.flakeS[l][i] = l === 0 ? 1 : l === 1 ? 2 : rand01(hash32(k, 174)) < 0.5 ? 3 : 4;
            }
        }
    }

    /** Sky gradient, undulating Aurora Borealis curtains, Milky Way, twinkling stars, and crescent moon. */
    drawSky(ctx: CanvasRenderingContext2D, pal: ScenePalette, cycle: number): void {
        const b = this.b;
        const sky = ctx.createLinearGradient(0, b.y, 0, this.gy);
        sky.addColorStop(0, pal.skyTop);
        sky.addColorStop(0.58, pal.skyMid);
        sky.addColorStop(1, pal.sky);
        ctx.fillStyle = sky;
        ctx.fillRect(b.x, b.y, b.w, this.gy - b.y + Math.ceil(b.h * 0.01) + 2);

        // Polar Aurora Borealis ribbons undulating slowly across the upper sky.
        this.drawAurora(ctx, pal, cycle);

        // The Milky Way: a dense strip of faint stardust.
        ctx.fillStyle = pal.milky;
        ctx.beginPath();
        for (let i = 0; i < MILKY; i++) ctx.rect(this.milkyX[i], this.milkyY[i], 1, 1);
        ctx.fill();

        // A third of the stars drop a tier on any quarter bar.
        const q = Math.floor(cycle * 4);
        for (let i = 0; i < STARS; i++) this.starLevel[i] = this.starTier[i] + (hash32(q, i) % 3 === 0 ? 1 : 0);
        const fills = [pal.starBright, pal.starDim, pal.starFaint];
        for (let level = 0; level < 3; level++) {
            ctx.fillStyle = fills[level];
            ctx.beginPath();
            for (let i = 0; i < STARS; i++) {
                if (this.starLevel[i] !== level) continue;
                const s = this.starS[i];
                ctx.rect(this.starX[i], this.starY[i], s, s);
            }
            ctx.fill();
        }

        // Crescent moon high in the right corner with layered atmospheric halo.
        const r = b.h * 0.034, cx = b.x + b.w * 0.86, cy = b.y + b.h * 0.19;
        const d = r * 0.42, r2 = r * 0.92;
        const ix = (d * d + r * r - r2 * r2) / (2 * d), iy = Math.sqrt(Math.max(0, r * r - ix * ix));
        const th = Math.atan2(iy, ix), ph = Math.atan2(iy, ix - d);
        ctx.fillStyle = pal.moonHalo;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 3.2, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.9, 0, TAU);
        ctx.fill();
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.6);
        ctx.fillStyle = pal.moon;
        ctx.beginPath();
        ctx.arc(0, 0, r, th, TAU - th);
        ctx.arc(d, 0, r2, -ph, ph, true);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    private drawAurora(ctx: CanvasRenderingContext2D, pal: ScenePalette, cycle: number): void {
        const b = this.b;
        const skyH = this.gy - b.y;
        const steps = 28;
        for (let band = 0; band < 2; band++) {
            const baseY = b.y + skyH * (band === 0 ? 0.24 : 0.34);
            const ribH = skyH * (band === 0 ? 0.16 : 0.12);
            const phase = cycle * 0.35 + band * 1.9;
            ctx.fillStyle = band === 0 ? pal.auroraGreen : pal.auroraViolet;
            ctx.beginPath();
            for (let s = 0; s <= steps; s++) {
                const u = s / steps;
                const x = b.x + u * b.w;
                const wave = Math.sin(u * TAU * 1.5 + phase) * skyH * 0.035 + Math.cos(u * TAU * 3 - phase * 0.7) * skyH * 0.015;
                const y = baseY + wave;
                if (s === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            for (let s = steps; s >= 0; s--) {
                const u = s / steps;
                const x = b.x + u * b.w;
                const wave = Math.sin(u * TAU * 1.5 + phase) * skyH * 0.035 + Math.cos(u * TAU * 3 - phase * 0.7) * skyH * 0.015;
                const taper = Math.sin(u * Math.PI);
                ctx.lineTo(x, baseY + wave + ribH * taper);
            }
            ctx.closePath();
            ctx.fill();
        }
    }

    /** Mountain ranges, pine treeline, two-tier village, smoking chimneys, windows, church & town Christmas tree. */
    drawTown(
        ctx: CanvasRenderingContext2D, pal: ScenePalette, cycle: number, dy: number, crash: boolean,
        gust = 0, gustDir = 1,
    ): void {
        const b = this.b;
        const g = this.gy + Math.round(dy);

        // 1. Far snow-capped mountain range
        this.drawRidge(ctx, this.farRidge, g, pal.mountainFar);
        ctx.fillStyle = pal.mountainSnow;
        ctx.beginPath();
        tris(ctx, this.ridgeSnowTris, g);
        ctx.fill();

        // 2. Near mountain range & evergreen pine forest silhouette
        this.drawRidge(ctx, this.nearRidge, g, pal.mountainNear);
        ctx.fillStyle = pal.forest;
        ctx.beginPath();
        tris(ctx, this.forestTris, g);
        ctx.fill();

        // 3. Back-row hillside cottages & their windows
        ctx.fillStyle = pal.houseBack;
        ctx.beginPath();
        rects(ctx, this.backRects, g);
        tris(ctx, this.backTris, g);
        ctx.fill();
        ctx.strokeStyle = pal.cap;
        ctx.lineWidth = Math.max(1.5, Math.round(b.h * 0.004));
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        segs(ctx, this.backCaps, g);
        ctx.stroke();

        for (const lit of [true, false]) {
            ctx.fillStyle = lit ? pal.windowWarm : pal.windowDark;
            ctx.beginPath();
            for (const w of this.windows) {
                if (!w.back) continue;
                const on = w.always || crash || (Math.floor(cycle * 2 + w.house * 0.7) & 1) === 1;
                if (on === lit) ctx.rect(w.x, g + w.y, w.w, w.h);
            }
            ctx.fill();
        }

        // 4. Curling chimney smoke puffs rising behind the foreground roofs
        this.drawChimneySmoke(ctx, pal, cycle, g, gust, gustDir);

        // 5. Stone chimneys, foreground cottage walls, pitched roofs & timber trim
        ctx.fillStyle = pal.chimney;
        ctx.beginPath();
        rects(ctx, this.chimneyRects, g);
        ctx.fill();

        ctx.fillStyle = pal.house;
        ctx.beginPath();
        rects(ctx, this.houseRects, g);
        ctx.fill();

        ctx.fillStyle = pal.roof;
        ctx.beginPath();
        tris(ctx, this.roofTris, g);
        ctx.fill();

        ctx.strokeStyle = pal.houseTrim;
        ctx.lineWidth = Math.max(1, Math.round(b.h * 0.0022));
        ctx.beginPath();
        segs(ctx, this.trimSegs, g);
        ctx.stroke();

        // Doors & festive wreaths
        ctx.fillStyle = pal.houseTrim;
        ctx.beginPath();
        rects(ctx, this.doorRects, g);
        ctx.fill();
        ctx.strokeStyle = pal.tree;
        ctx.lineWidth = Math.max(1.5, b.h * 0.003);
        ctx.beginPath();
        for (let i = 0; i < this.wreaths.length; i += 3) {
            const wx = this.wreaths[i], wy = g + this.wreaths[i + 1], wr = this.wreaths[i + 2];
            ctx.moveTo(wx + wr, wy);
            ctx.arc(wx, wy, wr, 0, TAU);
        }
        ctx.stroke();
        ctx.fillStyle = pal.ornamentRed;
        ctx.beginPath();
        for (let i = 0; i < this.wreaths.length; i += 3) {
            ctx.rect(this.wreaths[i] - 1, g + this.wreaths[i + 1] - this.wreaths[i + 2] - 1, 2, 2);
        }
        ctx.fill();

        // 6. Thick snow caps on roofs and chimneys
        ctx.strokeStyle = pal.cap;
        ctx.lineWidth = Math.max(2, Math.round(b.h * 0.006));
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        segs(ctx, this.caps, g);
        ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';

        // 7. Windows: warm glow halos, lit panes, dark panes, mullions & snow sills
        ctx.fillStyle = pal.windowGlow;
        ctx.beginPath();
        for (const w of this.windows) {
            if (w.back) continue;
            const on = w.always || crash || (Math.floor(cycle * 2 + w.house * 0.7) & 1) === 1;
            if (!on) continue;
            const cx = w.x + w.w * 0.5, cy = g + w.y + w.h * 0.5;
            const r = Math.max(w.w, w.h) * 0.95;
            ctx.moveTo(cx + r, cy);
            ctx.arc(cx, cy, r, 0, TAU);
        }
        ctx.fill();

        for (const lit of [true, false]) {
            ctx.fillStyle = lit ? pal.window : pal.windowDark;
            ctx.beginPath();
            for (const w of this.windows) {
                if (w.back) continue;
                const on = w.always || crash || (Math.floor(cycle * 2 + w.house * 0.7) & 1) === 1;
                if (on !== lit) continue;
                ctx.rect(w.x, g + w.y, w.w, w.h);
                if (w.arched) {
                    const r = w.w * 0.5;
                    ctx.moveTo(w.x + w.w, g + w.y);
                    ctx.arc(w.x + r, g + w.y, r, Math.PI, 0);
                }
            }
            ctx.fill();
        }

        // Inner warm core & window mullions (+) on foreground windows
        ctx.strokeStyle = pal.house;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const w of this.windows) {
            if (w.back || w.w < 5 || w.h < 5) continue;
            const mx = Math.round(w.x + w.w * 0.5) + 0.5;
            const my = Math.round(g + w.y + w.h * 0.5) + 0.5;
            ctx.moveTo(mx, g + w.y);
            ctx.lineTo(mx, g + w.y + w.h);
            ctx.moveTo(w.x, my);
            ctx.lineTo(w.x + w.w, my);
        }
        ctx.stroke();

        // Snow sills under foreground windows
        ctx.fillStyle = pal.cap;
        ctx.beginPath();
        for (const w of this.windows) {
            if (!w.back) ctx.rect(w.x - 1, g + w.y + w.h, w.w + 2, Math.max(1, Math.round(b.h * 0.0025)));
        }
        ctx.fill();

        // 8. Church stained-glass rose window & illuminated steeple cross
        const rose = this.churchRose;
        if (rose.r > 0) {
            ctx.fillStyle = pal.windowGlow;
            ctx.beginPath();
            ctx.arc(rose.x, g + rose.y, rose.r * 1.8, 0, TAU);
            ctx.fill();
            ctx.fillStyle = pal.windowWarm;
            ctx.beginPath();
            ctx.arc(rose.x, g + rose.y, rose.r, 0, TAU);
            ctx.fill();
            ctx.strokeStyle = pal.house;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(rose.x, g + rose.y, rose.r, 0, TAU);
            ctx.moveTo(rose.x - rose.r, g + rose.y);
            ctx.lineTo(rose.x + rose.r, g + rose.y);
            ctx.moveTo(rose.x, g + rose.y - rose.r);
            ctx.lineTo(rose.x, g + rose.y + rose.r);
            ctx.stroke();
        }
        const cross = this.churchCross;
        if (cross.s > 0) {
            ctx.strokeStyle = pal.ornamentGold;
            ctx.lineWidth = Math.max(1.5, b.h * 0.0028);
            ctx.beginPath();
            ctx.moveTo(cross.x, g + cross.y - cross.s);
            ctx.lineTo(cross.x, g + cross.y + cross.s * 0.3);
            ctx.moveTo(cross.x - cross.s * 0.45, g + cross.y - cross.s * 0.55);
            ctx.lineTo(cross.x + cross.s * 0.45, g + cross.y - cross.s * 0.55);
            ctx.stroke();
        }

        // 9. Eave fairy lights & the Town Square Christmas Tree
        const bulbColors = [pal.ornamentRed, pal.ornamentGold, pal.ornamentCyan];
        const beat = Math.floor(cycle * 4);
        for (let c = 0; c < 3; c++) {
            ctx.fillStyle = bulbColors[c];
            ctx.beginPath();
            for (let i = 0; i < this.garlandBulbs.length; i += 3) {
                if (this.garlandBulbs[i + 2] !== c) continue;
                const twinkle = ((beat + i) & 3) === 0 ? 1 : 2;
                ctx.rect(this.garlandBulbs[i] - 1, g + this.garlandBulbs[i + 1], twinkle, twinkle);
            }
            ctx.fill();
        }

        this.drawPineTree(ctx, this.townTree, g, pal.tree, pal.cap);
        this.drawTownTreeLights(ctx, pal, cycle, g);
    }

    private drawRidge(ctx: CanvasRenderingContext2D, pts: number[], g: number, fill: string): void {
        if (pts.length < 4) return;
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.moveTo(pts[0], g + 2);
        for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i], g + pts[i + 1]);
        ctx.lineTo(pts[pts.length - 2], g + 2);
        ctx.closePath();
        ctx.fill();
    }

    private drawChimneySmoke(
        ctx: CanvasRenderingContext2D, pal: ScenePalette, cycle: number, g: number, gust: number, gustDir: number,
    ): void {
        const b = this.b;
        const maxRise = b.h * 0.065;
        const wind = (0.25 + gust * 0.9) * gustDir * b.w * 0.018;
        ctx.fillStyle = pal.smoke;
        ctx.beginPath();
        for (const ch of this.chimneys) {
            for (let p = 0; p < 4; p++) {
                const age = (cycle * 0.55 + p * 0.25 + ch.house * 0.17) % 1;
                const sx = ch.x + age * wind + Math.sin(cycle * TAU * 0.5 + ch.house + p * 1.4) * b.w * 0.004 * (0.4 + age);
                const sy = g + ch.y - age * maxRise - b.h * 0.004;
                const r = Math.max(2, ch.w * (0.42 + age * 0.95) * (1 - age * 0.35));
                ctx.moveTo(sx + r, sy);
                ctx.arc(sx, sy, r, 0, TAU);
            }
        }
        ctx.fill();
    }

    private drawPineTree(ctx: CanvasRenderingContext2D, t: PineTree, g: number, fill: string, snowFill: string): void {
        if (t.h <= 0) return;
        const baseY = g + t.baseY;
        const trunkW = Math.max(2, Math.round(t.w * 0.22));
        const trunkH = Math.round(t.h * 0.16);
        ctx.fillStyle = this.b.h > 0 ? '#1b1310' : fill;
        ctx.fillRect(t.x - Math.floor(trunkW / 2), baseY - trunkH, trunkW, trunkH);

        ctx.fillStyle = fill;
        ctx.beginPath();
        for (let i = 0; i < t.tiers; i++) {
            const u0 = i / t.tiers;
            const u1 = (i + 1.35) / (t.tiers + 0.35);
            const yBot = baseY - t.h * (0.12 + u0 * 0.72);
            const yTop = baseY - t.h * (0.12 + u1 * 0.88);
            const halfW = t.w * (1 - u0 * 0.68);
            ctx.moveTo(t.x - halfW, yBot);
            ctx.lineTo(t.x, yTop);
            ctx.lineTo(t.x + halfW, yBot);
            ctx.closePath();
        }
        ctx.fill();

        // Snow-laden bough tips
        ctx.strokeStyle = snowFill;
        ctx.lineWidth = Math.max(1.5, Math.round(this.b.h * 0.004));
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i < t.tiers; i++) {
            const u0 = i / t.tiers;
            const u1 = (i + 1.35) / (t.tiers + 0.35);
            const yBot = baseY - t.h * (0.12 + u0 * 0.72);
            const yTop = baseY - t.h * (0.12 + u1 * 0.88);
            const halfW = t.w * (1 - u0 * 0.68);
            ctx.moveTo(t.x - halfW, yBot);
            ctx.lineTo(t.x - halfW * 0.45, yBot - (yBot - yTop) * 0.42);
            ctx.moveTo(t.x + halfW, yBot);
            ctx.lineTo(t.x + halfW * 0.45, yBot - (yBot - yTop) * 0.42);
        }
        ctx.stroke();
        ctx.lineCap = 'butt';
    }

    private drawTownTreeLights(ctx: CanvasRenderingContext2D, pal: ScenePalette, cycle: number, g: number): void {
        const t = this.townTree;
        if (t.h <= 0) return;
        const topY = g + t.baseY - t.h;
        // Glowing star topper on the town tree
        const sr = Math.max(3, this.b.h * 0.008);
        ctx.fillStyle = pal.windowGlow;
        ctx.beginPath();
        ctx.arc(t.x, topY, sr * 2.4, 0, TAU);
        ctx.fill();
        ctx.fillStyle = pal.ornamentGold;
        ctx.beginPath();
        ctx.arc(t.x, topY, sr * 0.85, 0, TAU);
        ctx.fill();

        // Twinkling ornaments on the boughs
        const colors = [pal.ornamentRed, pal.ornamentGold, pal.ornamentCyan];
        const eighth = Math.floor(cycle * 8);
        for (let c = 0; c < 3; c++) {
            ctx.fillStyle = colors[c];
            ctx.beginPath();
            for (const o of this.ornaments) {
                if (o.color !== c) continue;
                const pulse = (hash32(eighth, o.seed) & 3) === 0 ? 1.35 : 0.95;
                const r = o.r * pulse;
                ctx.moveTo(o.x + r, g + o.y);
                ctx.arc(o.x, g + o.y, r, 0, TAU);
            }
            ctx.fill();
        }
    }

    /** The snowfield, warm window reflections, drifts, sleigh lane, and snow sparkles. */
    drawGround(ctx: CanvasRenderingContext2D, pal: ScenePalette, cycle: number, dy: number, crash: boolean): void {
        const b = this.b;
        const g = this.gy + Math.round(dy);
        ctx.fillStyle = crash ? pal.groundLit : pal.ground;
        ctx.fillRect(b.x, g, b.w, b.y + b.h - g);

        // Soft snowbank contour along the base of the village
        ctx.fillStyle = pal.drift;
        ctx.beginPath();
        ctx.moveTo(b.x, g + b.h * 0.015);
        for (let s = 0; s <= 16; s++) {
            const u = s / 16;
            const x = b.x + u * b.w;
            const y = g - Math.sin(u * TAU * 3 + 0.6) * b.h * 0.005 - b.h * 0.003;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(b.x + b.w, g + b.h * 0.015);
        ctx.closePath();
        ctx.fill();

        // Rolling snowdrifts across the field
        ctx.beginPath();
        const d = this.drifts;
        for (let i = 0; i < d.length; i += 4) {
            ctx.moveTo(d[i] + d[i + 2], g + d[i + 1]);
            ctx.ellipse(d[i], g + d[i + 1], d[i + 2], d[i + 3], 0, 0, TAU);
        }
        ctx.fill();

        // Warm golden light pools on the snow in front of lit cottages, the church & town tree
        ctx.fillStyle = pal.poolFaint;
        ctx.beginPath();
        for (let i = 0; i < this.houseCenters.length; i++) {
            const on = i === CHURCH || crash || (Math.floor(cycle * 2 + i * 0.7) & 1) === 1;
            if (!on) continue;
            const hx = this.houseCenters[i];
            const rx = b.w * (i === CHURCH ? 0.045 : 0.026);
            const ry = b.h * (i === CHURCH ? 0.012 : 0.007);
            const py = g + b.h * 0.012;
            ctx.moveTo(hx + rx, py);
            ctx.ellipse(hx, py, rx, ry, 0, 0, TAU);
        }
        if (this.townTree.h > 0) {
            const tx = this.townTree.x, py = g + b.h * 0.014;
            ctx.moveTo(tx + b.w * 0.03, py);
            ctx.ellipse(tx, py, b.w * 0.03, b.h * 0.009, 0, 0, TAU);
        }
        ctx.fill();

        // A quarter of the snow crystals sparkle on any quarter bar.
        const q = Math.floor(cycle * 4);
        ctx.fillStyle = pal.sparkle;
        ctx.beginPath();
        for (let i = 0; i < SPARKLES; i++) {
            if ((hash32(q + 9001, i) & 3) === 0) ctx.rect(this.sparkX[i], g + this.sparkY[i], 1, 1);
        }
        ctx.fill();
    }

    /** Foreground snow-laden pines, fence with snow caps, snowman, and Victorian streetlamp with warm light cone. */
    drawNear(ctx: CanvasRenderingContext2D, pal: ScenePalette, dy: number): void {
        const g = this.gy + Math.round(dy);
        const lamp = this.lamp;
        const b = this.b;

        // Warm snow pool under the streetlamp
        ctx.fillStyle = pal.poolFaint;
        ctx.beginPath();
        ctx.ellipse(lamp.x, g + lamp.base, b.w * 0.075, b.h * 0.022, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = pal.pool;
        ctx.beginPath();
        ctx.ellipse(lamp.x, g + lamp.base, b.w * 0.042, b.h * 0.012, 0, 0, TAU);
        ctx.fill();

        // Volumetric downward light cone from the streetlamp lantern
        ctx.fillStyle = pal.poolFaint;
        ctx.beginPath();
        ctx.moveTo(lamp.x - b.w * 0.005, g + lamp.y);
        ctx.lineTo(lamp.x + b.w * 0.005, g + lamp.y);
        ctx.lineTo(lamp.x + b.w * 0.055, g + lamp.base);
        ctx.lineTo(lamp.x - b.w * 0.055, g + lamp.base);
        ctx.closePath();
        ctx.fill();

        // Snow-laden evergreen pine trees in the foreground
        for (const p of this.nearPines) {
            this.drawPineTree(ctx, p, g, pal.treeDark, pal.cap);
        }

        // Fence posts, rails, bare winter tree & lamp post
        ctx.fillStyle = pal.near;
        ctx.beginPath();
        rects(ctx, this.nearRects, g);
        tris(ctx, this.nearTris, g);
        ctx.fill();
        ctx.strokeStyle = pal.near;
        ctx.lineWidth = Math.max(1, Math.round(b.h * 0.003));
        ctx.beginPath();
        segs(ctx, this.nearSegs, g);
        ctx.stroke();

        // Snow caps along the fence posts and top rails
        ctx.strokeStyle = pal.cap;
        ctx.lineWidth = Math.max(1.5, Math.round(b.h * 0.0035));
        ctx.lineCap = 'round';
        ctx.beginPath();
        segs(ctx, this.nearCaps, g);
        ctx.stroke();
        ctx.lineCap = 'butt';

        // Foreground Snowman by the fence
        this.drawSnowman(ctx, pal, g);

        // Victorian lantern head, finial & warm multi-ring glow
        const lr = Math.max(2.5, b.h * 0.0065);
        ctx.fillStyle = pal.poolFaint;
        ctx.beginPath();
        ctx.arc(lamp.x, g + lamp.y, lr * 4.5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = pal.pool;
        ctx.beginPath();
        ctx.arc(lamp.x, g + lamp.y, lr * 2.2, 0, TAU);
        ctx.fill();
        // Lantern roof cap & finial
        ctx.fillStyle = pal.near;
        ctx.beginPath();
        ctx.moveTo(lamp.x - lr * 1.6, g + lamp.y - lr * 0.6);
        ctx.lineTo(lamp.x, g + lamp.y - lr * 1.9);
        ctx.lineTo(lamp.x + lr * 1.6, g + lamp.y - lr * 0.6);
        ctx.closePath();
        ctx.fill();
        // Glowing lantern glass
        ctx.fillStyle = pal.window;
        ctx.fillRect(Math.round(lamp.x - lr), Math.round(g + lamp.y - lr * 0.5), Math.round(lr * 2), Math.round(lr * 1.6));
    }

    private drawSnowman(ctx: CanvasRenderingContext2D, pal: ScenePalette, g: number): void {
        const sm = this.snowman;
        if (sm.s <= 0) return;
        const x = sm.x, y = g + sm.y, s = sm.s;
        const r0 = s * 0.55, r1 = s * 0.40, r2 = s * 0.28;
        const y0 = y - r0, y1 = y0 - r0 - r1 * 0.7, y2 = y1 - r1 - r2 * 0.65;
        // Three snowballs
        ctx.fillStyle = pal.cap;
        ctx.beginPath();
        ctx.arc(x, y0, r0, 0, TAU);
        ctx.arc(x, y1, r1, 0, TAU);
        ctx.arc(x, y2, r2, 0, TAU);
        ctx.fill();
        // Red scarf
        ctx.fillStyle = pal.ornamentRed;
        ctx.fillRect(Math.round(x - r1 * 0.85), Math.round(y1 - r1 * 0.85), Math.round(r1 * 1.7), Math.max(2, Math.round(s * 0.16)));
        ctx.fillRect(Math.round(x + r1 * 0.25), Math.round(y1 - r1 * 0.75), Math.max(2, Math.round(s * 0.16)), Math.round(s * 0.42));
        // Dark stovepipe hat & twig arms
        ctx.fillStyle = pal.near;
        ctx.fillRect(Math.round(x - r2 * 1.2), Math.round(y2 - r2 * 0.95), Math.round(r2 * 2.4), Math.max(1.5, Math.round(s * 0.1)));
        ctx.fillRect(Math.round(x - r2 * 0.75), Math.round(y2 - r2 * 2.1), Math.round(r2 * 1.5), Math.round(r2 * 1.2));
        // Orange/gold carrot nose
        ctx.fillStyle = pal.ornamentGold;
        ctx.beginPath();
        ctx.moveTo(x, y2);
        ctx.lineTo(x + r2 * 1.35, y2 + r2 * 0.15);
        ctx.lineTo(x, y2 + r2 * 0.3);
        ctx.closePath();
        ctx.fill();
    }

    /** Three layers of snow, far to near, one batch each. Hats gust it sideways; near flakes streak in the gust. */
    drawSnow(ctx: CanvasRenderingContext2D, pal: ScenePalette, cycle: number, gust: number, gustDir: number): void {
        const {w, h} = this.b;
        const bx = Math.round(this.b.x), by = Math.round(this.b.y);
        const sway = gust * gustDir * w * 0.06;
        const fills = [pal.flakeFaint, pal.flakeDim, pal.flake];
        const streak = gust > 0.6 ? 2 : gust > 0.15 ? 1 : 0;
        for (let l = 0; l < FLAKES.length; l++) {
            const fx = this.flakeX[l], fy = this.flakeY[l], fv = this.flakeV[l], fs = this.flakeS[l];
            const wobble = WOBBLE[l], drift = sway * SWAY[l];
            ctx.fillStyle = fills[l];
            ctx.beginPath();
            for (let i = 0; i < fx.length; i++) {
                const y = Math.round(((fy[i] + cycle * fv[i]) % 1) * h);
                const wob = Math.sin(cycle * TAU * 0.5 + i) * wobble;
                const x = Math.round((((fx[i] * w + wob + drift + cycle * 4) % w) + w) % w);
                const s = fs[i];
                ctx.rect(bx + x, by + y, s, s);
                if (l === 2 && streak > 0) ctx.rect(bx + x - gustDir * streak, by + y - streak, s, s);
            }
            ctx.fill();
        }
    }
}

function rects(ctx: CanvasRenderingContext2D, r: number[], g: number): void {
    for (let i = 0; i < r.length; i += 4) ctx.rect(r[i], g + r[i + 1], r[i + 2], r[i + 3]);
}

function tris(ctx: CanvasRenderingContext2D, t: number[], g: number): void {
    for (let i = 0; i < t.length; i += 6) {
        ctx.moveTo(t[i], g + t[i + 1]);
        ctx.lineTo(t[i + 2], g + t[i + 3]);
        ctx.lineTo(t[i + 4], g + t[i + 5]);
        ctx.closePath();
    }
}

function segs(ctx: CanvasRenderingContext2D, s: number[], g: number): void {
    for (let i = 0; i < s.length; i += 4) {
        ctx.moveTo(s[i], g + s[i + 1]);
        ctx.lineTo(s[i + 2], g + s[i + 3]);
    }
}
