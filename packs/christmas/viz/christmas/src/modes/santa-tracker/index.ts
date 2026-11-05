/**
 * SANTA TRACKER — a situation display in the NORAD style. A wireframe globe
 * turns once per 32 bars under a radar sweep that goes round once per bar.
 * Every pitched note is a contact on the globe: pitch class picks the
 * longitude, register the latitude, snapped to the nearest city and tinted
 * with the track's colour. The highest note of each onset is a stop on the
 * route, and the sleigh flies the great circle from stop to stop in time with
 * the music. Kick: the ring around the sleigh pulses. Snare: a radar blip
 * opens at a seeded spot. Hat: a tick on the sweep's rim. Other percussion
 * (bells, tambourine): the frame flashes. The globe fills the console body,
 * centred, with its grid and contact counts under it. The readout strip below
 * reads TRACK (tracking or standby), the sleigh's real LAT and LON, ALT and
 * SPD (hashes of the bar on slow sines), the NEXT stop and its ETA.
 *
 * Spin, sweep and the sleigh are functions of the field's clock: the song's
 * cycle while it plays, coasting while it is stopped.
 */

import type {Theme, VizMode, VizModeDef, VizServices} from '@cycletron/viz-sdk';
import {
    type FieldHap, type FieldTeam, HapField, TAU, alphaRamp, clamp01, drawLabel, hash32, mixRgb, rampAt, rand01,
    rgbOf,
} from '@cycletron/viz-sdk';
import {
    CITIES, CITY_VERTS, type Coast, GRID_VERTS, LAT_RINGS, MERIDIANS, RING_STEPS, RING_STRIDE, coastVerts,
    fmtLat, fmtLon, gridVerts, latOf, lonOf, nearestCity, project, slerp, toVec, viewMatrix,
} from './globe.js';
import {Alert} from '../../lib/console/alert.js';
import {bakeConsoleInk, type ConsoleInk, type ConsoleLayout, drawConsole, layoutConsole, type Station} from '../../lib/console/chrome.js';
import {group, pad} from '../../lib/console/panel.js';
import {drawStrip, pictureRect, type StripCell} from '../../lib/console/strip.js';
import {css} from '@naderlabs/kit/color';

const LOOKAHEAD = 2;
const MAX_HAPS = 96;
const MAX_PER_TRACK = 24;
const DRUM_CAP = 8;
const IDLE_RATE = 0.25;
/** Bars a flown stop stays on the globe. */
const PAST = 1;
const SPIN_BARS = 32;
const MAX_BLIPS = 16;
const BLIP_LIFE = 0.9;
const MAX_TICKS = 24;
const TICK_LIFE = 0.6;
const SWEEP_TRAIL = 0.8;
const SWEEP_STEPS = 18;
const ARC_STEPS = 10;
/** Bars a contact's ping ring lasts. */
const PING = 0.5;
const NORTH_POLE = 0;
const STATION: Station = {code: 'STN-01', name: 'SITUATION DISPLAY'};

interface Team extends FieldTeam {}

interface Stop extends FieldHap<Team> {
    pitched: boolean;
    city: number;
    /** Cycle the onset was crossed, NaN before. */
    hitAt: number;
    /** The route stop of its onset. */
    lead: boolean;
}

interface Blip {
    age: number;
    x: number;
    y: number;
    z: number;
}

interface Tick {
    age: number;
    ang: number;
}

interface Palette {
    bg: string;
    disc: string;
    neon: string[];
    sec: string[];
    act: string[];
    red: string[];
    text: string[];
    back: string;
    grid: string;
    coast: string;
    rim: string;
    frame: string;
    label: string;
    labelDim: string;
    value: string;
    head: string;
    track: string;
}

class SantaTrackerMode implements VizMode {
    private readonly field = new HapField<Team, Stop>({
        lookahead: LOOKAHEAD,
        maxHaps: MAX_HAPS,
        maxPerTrack: MAX_PER_TRACK,
        idleRate: IDLE_RATE,
        team: (base) => base,
        hap: (base) => makeStop(base),
        cap: (_team, note) => (Number.isFinite(note) ? Infinity : DRUM_CAP),
        keep: (h, cycle) => (h.pitched ? h.begin + PAST : h.end + 0.1) >= cycle,
    });
    private readonly grid = gridVerts();
    private readonly coast: Coast = coastVerts();
    private readonly gridP = new Float32Array(GRID_VERTS * 3);
    private readonly coastP: Float32Array;
    private readonly m = new Float32Array(9);
    private readonly v3 = new Float32Array(3);
    private readonly p3 = new Float32Array(3);
    private readonly sleighV = new Float32Array(3);
    private readonly sleighP = new Float32Array(3);
    private readonly nextP = new Float32Array(3);
    private readonly route: Stop[] = [];
    private readonly blips: Blip[] = [];
    private readonly ticks: Tick[] = [];
    private readonly alert = new Alert();
    private pal!: Palette;
    private cink!: ConsoleInk;
    private lay!: ConsoleLayout;
    private w = 1;
    private h = 1;
    private cx = 0;
    private cy = 0;
    private r = 1;
    private small = 8;
    private thump = 0;
    private flash = 0;

    constructor() {
        this.coastP = new Float32Array(this.coast.count * 3);
    }

    layout(s: VizServices): void {
        this.w = s.width;
        this.h = s.height;
        const lay = layoutConsole(s);
        this.lay = lay;
        // The globe centred in the picture, as big as it fits with the
        // crosshair (1.3 r each way) above and the two text lines below.
        const pic = pictureRect(lay);
        const small = lay.small;
        const text = small * 3.4;
        const room = pic.h - text - small;
        this.r = Math.min(pic.w, room) / 2.7;
        this.cx = pic.x + pic.w / 2;
        this.cy = pic.y + small * 0.5 + room / 2;
        this.small = small;
        this.pal = bakePalette(s.theme);
        this.cink = bakeConsoleInk(s.theme);
        this.field.invalidate();
    }

    update(dt: number, s: VizServices): void {
        this.alert.update(dt, s);
        const field = this.field;
        field.update(dt, s);
        if (field.restarted) {
            this.blips.length = 0;
            this.ticks.length = 0;
            this.thump = 0;
            this.flash = 0;
        }
        this.buildRoute();

        const cycle = field.cycle;
        for (const h of field.haps) {
            if (!field.crossed(h)) continue;
            h.done = true;
            h.hitAt = cycle;
            h.team.activity = 1;
            if (h.pitched) continue;
            switch (h.team.family) {
                case 'kick':
                    this.thump = 1;
                    break;
                case 'snare':
                    this.spawnBlip(h.seed, cycle);
                    break;
                case 'hat':
                    if (this.ticks.length < MAX_TICKS) this.ticks.push({age: 0, ang: (cycle % 1) * TAU});
                    break;
                default:
                    this.flash = 1;
                    break;
            }
        }
        for (let i = this.blips.length - 1; i >= 0; i--) {
            this.blips[i].age += dt;
            if (this.blips[i].age >= BLIP_LIFE) this.blips.splice(i, 1);
        }
        for (let i = this.ticks.length - 1; i >= 0; i--) {
            this.ticks[i].age += dt;
            if (this.ticks[i].age >= TICK_LIFE) this.ticks.splice(i, 1);
        }
        this.thump *= Math.exp(-dt * 7);
        this.flash *= Math.exp(-dt * 9);
    }

    /** The route: one stop per onset, the highest note, in time order. */
    private buildRoute(): void {
        const route = this.route;
        route.length = 0;
        for (const h of this.field.haps) {
            if (!h.pitched) continue;
            h.lead = false;
            route.push(h);
        }
        route.sort((a, b) => a.begin - b.begin || b.note - a.note || a.team.slot - b.team.slot);
        let n = 0;
        let lastKey = -1;
        for (const h of route) {
            const key = Math.round(h.begin * 16);
            if (key === lastKey) continue;
            lastKey = key;
            h.lead = true;
            route[n++] = h;
        }
        route.length = n;
    }

    /** A blip at a seeded spot on the side facing the viewer. */
    private spawnBlip(seed: number, cycle: number): void {
        if (this.blips.length >= MAX_BLIPS) return;
        const lat = -55 + 110 * rand01(hash32(seed, 5));
        let lon = -180 + 360 * rand01(hash32(seed, 6));
        viewMatrix(spinOf(cycle), this.m);
        const v = this.v3, m = this.m;
        toVec(lat, lon, v, 0);
        if (m[6] * v[0] + m[7] * v[1] + m[8] * v[2] < 0.2) {
            lon += 180;
            toVec(lat, lon, v, 0);
        }
        this.blips.push({age: 0, x: v[0], y: v[1], z: v[2]});
    }

    render(ctx: CanvasRenderingContext2D, s: VizServices): void {
        const {w, h, pal, cx, cy, r, m} = this;
        const cycle = this.field.cycle;
        ctx.save();
        ctx.fillStyle = pal.bg;
        ctx.fillRect(0, 0, w, h);
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        viewMatrix(spinOf(cycle), m);
        project(this.grid, GRID_VERTS, m, cx, cy, r, this.gridP);
        project(this.coast.verts, this.coast.count, m, cx, cy, r, this.coastP);
        const seg = this.sleighAt(cycle);

        this.drawCrosshair(ctx);
        this.drawGlobe(ctx);
        this.drawRoute(ctx, cycle, seg);
        this.drawContacts(ctx, cycle);
        this.drawBlips(ctx);
        this.drawSleigh(ctx, seg);
        this.drawSweep(ctx, cycle);
        this.drawReadout(ctx, cycle);
        drawStrip(ctx, this.lay, this.cink, this.stripCells(s, cycle, seg));
        drawConsole(ctx, s, this.lay, this.cink, this.alert, STATION);

        if (this.flash > 0.02) {
            ctx.fillStyle = rampAt(pal.act, this.flash * 0.12);
            ctx.fillRect(0, 0, w, h);
        }
        ctx.restore();
    }

    /**
     * Where the sleigh is: on the route segment `i` at fraction `u`, eased so
     * it lands at each stop. Writes the unit vector and its projection.
     */
    private sleighAt(cycle: number) {
        const route = this.route;
        const v = this.sleighV;
        let i = -1, u = 0;
        if (route.length === 0 || cycle <= route[0].begin) {
            if (route.length === 0) {
                v.set(CITY_VERTS.subarray(NORTH_POLE * 3, NORTH_POLE * 3 + 3));
            } else {
                v.set(CITY_VERTS.subarray(route[0].city * 3, route[0].city * 3 + 3));
                i = 0;
            }
        } else {
            i = route.length - 1;
            for (let k = 0; k < route.length - 1; k++) {
                if (route[k + 1].begin > cycle) {
                    i = k;
                    break;
                }
            }
            if (i >= route.length - 1) {
                v.set(CITY_VERTS.subarray(route[i].city * 3, route[i].city * 3 + 3));
            } else {
                const a = route[i], b = route[i + 1];
                const t = clamp01((cycle - a.begin) / Math.max(1e-6, b.begin - a.begin));
                u = t * t * (3 - 2 * t);
                slerp(CITY_VERTS, a.city * 3, CITY_VERTS, b.city * 3, u, v, 0);
            }
        }
        project(v, 1, this.m, this.cx, this.cy, this.r, this.sleighP);
        return {i, u};
    }

    private drawCrosshair(ctx: CanvasRenderingContext2D): void {
        const pal = this.pal;
        // Crosshair through the globe centre, outside the rim.
        const {cx, cy, r} = this;
        ctx.strokeStyle = pal.rim;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - r * 1.3, cy); ctx.lineTo(cx - r * 1.12, cy);
        ctx.moveTo(cx + r * 1.12, cy); ctx.lineTo(cx + r * 1.3, cy);
        ctx.moveTo(cx, cy - r * 1.3); ctx.lineTo(cx, cy - r * 1.12);
        ctx.moveTo(cx, cy + r * 1.12); ctx.lineTo(cx, cy + r * 1.3);
        ctx.stroke();
    }

    private drawGlobe(ctx: CanvasRenderingContext2D): void {
        const {pal, cx, cy, r, gridP: p} = this;
        ctx.fillStyle = pal.disc;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, TAU);
        ctx.fill();

        // Grid: back segments dim, front bright, one path each.
        ctx.lineWidth = 1;
        for (let pass = 0; pass < 2; pass++) {
            const front = pass === 1;
            ctx.strokeStyle = front ? pal.grid : pal.back;
            ctx.beginPath();
            for (let ring = 0; ring < LAT_RINGS + MERIDIANS; ring++) {
                const base = ring * RING_STRIDE * 3;
                let open = false;
                for (let i = 0; i < RING_STEPS; i++) {
                    const a = base + i * 3, b = a + 3;
                    const onFront = p[a + 2] + p[b + 2] >= 0;
                    if (onFront !== front) {
                        open = false;
                        continue;
                    }
                    if (!open) {
                        ctx.moveTo(p[a], p[a + 1]);
                        open = true;
                    }
                    ctx.lineTo(p[b], p[b + 1]);
                }
            }
            ctx.stroke();
        }

        // Coastlines, the facing side only.
        const c = this.coast, q = this.coastP;
        ctx.strokeStyle = pal.coast;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        for (let k = 0; k < c.start.length; k++) {
            const from = c.start[k], n = c.len[k];
            let open = false;
            for (let i = 1; i < n; i++) {
                const a = (from + i - 1) * 3, b = a + 3;
                if (q[a + 2] < 0.03 || q[b + 2] < 0.03) {
                    open = false;
                    continue;
                }
                if (!open) {
                    ctx.moveTo(q[a], q[a + 1]);
                    open = true;
                }
                ctx.lineTo(q[b], q[b + 1]);
            }
        }
        ctx.stroke();

        // Rim and the pole mark.
        ctx.strokeStyle = pal.rim;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.06, 0, TAU);
        ctx.stroke();
        const v = this.v3, pp = this.p3;
        v[0] = 0; v[1] = 1; v[2] = 0;
        project(v, 1, this.m, cx, cy, r, pp);
        if (pp[2] > 0) drawLabel(ctx, 'N', pp[0], pp[1] - this.small, pal.label, this.small, 'center');
    }

    private drawRoute(ctx: CanvasRenderingContext2D, cycle: number, seg: {i: number; u: number}): void {
        const route = this.route;
        if (route.length < 2) return;
        const {pal, cx, cy, r, m} = this;
        const v = this.v3, p = this.p3;
        // Three strokes: flown (front), ahead (front, dashed), and the back side.
        for (let pass = 0; pass < 3; pass++) {
            ctx.strokeStyle = pass === 0 ? rampAt(pal.sec, 0.85) : pass === 1 ? rampAt(pal.neon, 0.5) : pal.back;
            ctx.lineWidth = pass === 2 ? 1 : 1.5;
            ctx.setLineDash(pass === 1 ? [3, 4] : []);
            ctx.beginPath();
            for (let k = 0; k < route.length - 1; k++) {
                if (route[k].begin < cycle - PAST) continue;
                const flownAll = route[k + 1].begin <= cycle;
                let open = false;
                let px = 0, py = 0;
                for (let i = 0; i <= ARC_STEPS; i++) {
                    const t = i / ARC_STEPS;
                    slerp(CITY_VERTS, route[k].city * 3, CITY_VERTS, route[k + 1].city * 3, t, v, 0);
                    project(v, 1, m, cx, cy, r, p);
                    const flown = flownAll || (k === seg.i && t <= seg.u);
                    const want = pass === 2 ? p[2] < 0 : p[2] >= 0 && (pass === 0) === flown;
                    if (i === 0 || !want) {
                        open = want;
                        if (want) ctx.moveTo(p[0], p[1]);
                        px = p[0]; py = p[1];
                        continue;
                    }
                    if (!open) {
                        ctx.moveTo(px, py);
                        open = true;
                    }
                    ctx.lineTo(p[0], p[1]);
                    px = p[0]; py = p[1];
                }
            }
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }

    private drawContacts(ctx: CanvasRenderingContext2D, cycle: number): void {
        const {cx, cy, r, m} = this;
        const p = this.p3;
        const sz = Math.max(2, r * 0.018);
        for (const h of this.field.haps) {
            if (!h.pitched) continue;
            project(CITY_VERTS.subarray(h.city * 3, h.city * 3 + 3), 1, m, cx, cy, r, p);
            if (p[2] < 0) continue;
            const past = h.begin <= cycle;
            const alpha = (past ? 0.9 * clamp01(1 - (cycle - h.begin) / PAST) : 0.5) * h.fade;
            if (alpha <= 0.02) continue;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = h.team.css;
            ctx.fillRect(p[0] - sz / 2, p[1] - sz / 2, sz, sz);
            if (h.lead && !past) {
                ctx.strokeStyle = h.team.css;
                ctx.lineWidth = 1;
                ctx.strokeRect(p[0] - sz * 1.6, p[1] - sz * 1.6, sz * 3.2, sz * 3.2);
            }
            const age = cycle - h.hitAt;
            if (age >= 0 && age < PING) {
                const t = age / PING;
                ctx.globalAlpha = (1 - t) * h.fade;
                ctx.strokeStyle = h.team.css;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(p[0], p[1], sz + t * r * 0.14, 0, TAU);
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
    }

    private drawBlips(ctx: CanvasRenderingContext2D): void {
        const {pal, cx, cy, r, m} = this;
        const v = this.v3, p = this.p3;
        ctx.lineWidth = 1.5;
        for (const b of this.blips) {
            v[0] = b.x; v[1] = b.y; v[2] = b.z;
            project(v, 1, m, cx, cy, r, p);
            if (p[2] < 0) continue;
            const t = b.age / BLIP_LIFE;
            ctx.strokeStyle = rampAt(pal.red, (1 - t) * 0.9);
            ctx.beginPath();
            ctx.arc(p[0], p[1], r * (0.02 + 0.2 * t), 0, TAU);
            ctx.stroke();
            ctx.fillStyle = rampAt(pal.red, (1 - t));
            ctx.fillRect(p[0] - 1.5, p[1] - 1.5, 3, 3);
        }
    }

    private drawSleigh(ctx: CanvasRenderingContext2D, seg: {i: number; u: number}): void {
        const {pal, r} = this;
        const p = this.sleighP;
        const behind = p[2] < 0;
        const alpha = behind ? 0.3 : 1;
        const x = p[0], y = p[1];
        const sz = Math.max(3, r * 0.03);
        ctx.globalAlpha = alpha;
        // Heading line toward the next stop.
        const route = this.route;
        if (seg.i >= 0 && seg.i < route.length - 1) {
            project(CITY_VERTS.subarray(route[seg.i + 1].city * 3, route[seg.i + 1].city * 3 + 3), 1, this.m, this.cx, this.cy, r, this.nextP);
            const dx = this.nextP[0] - x, dy = this.nextP[1] - y;
            const len = Math.hypot(dx, dy) || 1;
            ctx.strokeStyle = rampAt(pal.sec, 0.7);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + (dx / len) * r * 0.14, y + (dy / len) * r * 0.14);
            ctx.stroke();
        }
        // Ring, pulsing on the kick.
        ctx.strokeStyle = rampAt(pal.sec, 0.9);
        ctx.lineWidth = 1 + this.thump * 1.5;
        ctx.beginPath();
        ctx.arc(x, y, sz * (2 + this.thump * 1.6), 0, TAU);
        ctx.stroke();
        // Diamond.
        ctx.fillStyle = pal.value;
        ctx.beginPath();
        ctx.moveTo(x, y - sz);
        ctx.lineTo(x + sz, y);
        ctx.lineTo(x, y + sz);
        ctx.lineTo(x - sz, y);
        ctx.closePath();
        ctx.fill();
        drawLabel(ctx, 'SANTA-1', x + sz * 3, y - sz * 2, pal.head, this.small, 'left');
        ctx.globalAlpha = 1;
    }

    private drawSweep(ctx: CanvasRenderingContext2D, cycle: number): void {
        const {pal, cx, cy, r} = this;
        const head = (cycle - Math.floor(cycle)) * TAU - Math.PI / 2;
        for (let k = SWEEP_STEPS - 1; k >= 0; k--) {
            const a0 = head - (SWEEP_TRAIL * (k + 1)) / SWEEP_STEPS;
            const a1 = head - (SWEEP_TRAIL * k) / SWEEP_STEPS;
            const f = 1 - k / SWEEP_STEPS;
            ctx.fillStyle = rampAt(pal.neon, 0.3 * f * f);
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r, a0, a1);
            ctx.closePath();
            ctx.fill();
        }
        ctx.strokeStyle = rampAt(pal.neon, 0.95);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(head) * r * 1.06, cy + Math.sin(head) * r * 1.06);
        ctx.stroke();
        // Hat ticks on the rim.
        ctx.lineWidth = 2.5;
        for (const t of this.ticks) {
            const a = t.ang - Math.PI / 2;
            const ca = Math.cos(a), sa = Math.sin(a);
            const f = 1 - t.age / TICK_LIFE;
            ctx.strokeStyle = rampAt(pal.act, f);
            ctx.beginPath();
            ctx.moveTo(cx + ca * r * 1.07, cy + sa * r * 1.07);
            ctx.lineTo(cx + ca * r * (1.12 + 0.08 * f), cy + sa * r * (1.12 + 0.08 * f));
            ctx.stroke();
        }
    }

    /** The grid and contact lines under the globe. */
    private drawReadout(ctx: CanvasRenderingContext2D, cycle: number): void {
        const {pal, cx, cy, r, small} = this;
        const y = cy + r * 1.3 + small;
        const spin = ((spinOf(cycle) / TAU) * 360) % 360;
        const sweep = Math.floor((cycle - Math.floor(cycle)) * 360);
        drawLabel(ctx, `GRID 15° · VIEW ${spin.toFixed(1).padStart(5, '0')}° · SWEEP ${pad(sweep, 3)}°`, cx, y, pal.labelDim, small, 'center');
        let contacts = 0;
        for (const h of this.field.haps) if (h.pitched) contacts++;
        drawLabel(ctx, `CONTACTS ${pad(contacts, 3)} · STOPS ${pad(this.route.length, 3)} · WINDOW -${PAST}/+${LOOKAHEAD} BARS`, cx, y + small * 1.6, pal.labelDim, small, 'center');
    }

    /** The strip: track state, the sleigh's position, altitude and speed, the next stop and its ETA. */
    private stripCells(s: VizServices, cycle: number, seg: {i: number; u: number}): StripCell[] {
        const pal = this.pal;
        const locked = this.field.locked;
        const v = this.sleighV;
        const lat = latOf(v[0], v[1], v[2]);
        const lon = lonOf(v[0], v[2]);
        const route = this.route;
        const next = seg.i >= 0 && seg.i < route.length - 1 ? route[seg.i + 1] : null;
        const tick = Math.floor(cycle * 8);
        const alt = 9000 + 1800 * Math.sin(cycle * 0.37) + 400 * Math.sin(cycle * 2.9) + 90 * rand01(hash32(tick, 1));
        const spd = 1100 + 240 * Math.sin(cycle * 0.53 + 1) + 60 * rand01(hash32(tick, 2));
        const secondsPerBar = 240 / Math.max(1, s.bpm);
        const eta = next ? Math.max(0, next.begin - cycle) * secondsPerBar : 0;
        return [
            {label: 'TRACK', value: locked ? 'TRACKING' : 'STANDBY', color: locked ? pal.value : pal.labelDim},
            {label: 'LAT', value: locked ? fmtLat(lat) : '--.-'},
            {label: 'LON', value: locked ? fmtLon(lon) : '---.-'},
            {label: 'ALT', value: `${group(alt)} M`},
            {label: 'SPD', value: `${group(spd)} KM/H`},
            {label: 'NEXT', value: next ? CITIES[next.city].name : locked ? 'HOLDING' : '--'},
            {label: 'ETA', value: next ? `T-${eta.toFixed(1)} S` : '--'},
        ];
    }
}

function spinOf(cycle: number): number {
    return (cycle / SPIN_BARS) * TAU;
}

function makeStop(base: FieldHap<Team>): Stop {
    const pitched = Number.isFinite(base.note);
    let city = -1;
    if (pitched) {
        const pc = ((Math.round(base.note) % 12) + 12) % 12;
        const lon = pc * 30 - 165;
        const lat = -40 + 105 * clamp01((base.note - 36) / 60);
        city = nearestCity(lat, lon);
    }
    return {...base, pitched, city, hitAt: NaN, lead: false};
}

function bakePalette(theme: Theme): Palette {
    const neon = rgbOf(theme.neon, [71, 246, 255]);
    const sec = rgbOf(theme.neonSecondary, [255, 80, 200]);
    const act = rgbOf(theme.active, [255, 230, 90]);
    const vio = rgbOf(theme.violet, [120, 80, 200]);
    const red = rgbOf(theme.red, [255, 60, 60]);
    const text = theme.textRgb;
    const bg = theme.bgRgb;
    const neonRamp = alphaRamp(neon);
    const textRamp = alphaRamp(text);
    return {
        bg: theme.bg,
        disc: css(mixRgb(bg, vio, 0.3)),
        neon: neonRamp,
        sec: alphaRamp(sec),
        act: alphaRamp(act),
        red: alphaRamp(red),
        text: textRamp,
        back: rampAt(alphaRamp(mixRgb(vio, neon, 0.35)), 0.5),
        grid: rampAt(neonRamp, 0.45),
        coast: rampAt(neonRamp, 0.9),
        rim: rampAt(neonRamp, 0.35),
        frame: rampAt(neonRamp, 0.4),
        label: rampAt(textRamp, 0.9),
        labelDim: rampAt(textRamp, 0.55),
        value: theme.active,
        head: theme.neonSecondary,
        track: css(mixRgb(bg, text, 0.18)),
    };
}

export const santaTrackerDef: VizModeDef = {
    id: 'santa-tracker',
    name: 'SITUATION DISPLAY',
    create: () => new SantaTrackerMode(),
};
