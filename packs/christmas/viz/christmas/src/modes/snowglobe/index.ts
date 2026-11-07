/**
 * REC ROOM: station STN-05 of the SLEIGHCON ops room: a North Pole rave
 * inside an ornate glass snowglobe on the break-room console. The dome sits
 * centred in the whole body; a readout strip across the bottom reads DANCERS,
 * TILES lit/total, LASERS active, VORTEX rpm, TURB (meter) and STROBE.
 *
 * Inside the glass dome: a 6×6 illuminated isometric disco floor nestled in a
 * contoured snowbank base with mini snow-dusted pines. At the back of the
 * floor stand a three-tiered Rave Christmas Tree with twinkling ornaments and
 * a star topper alongside an ice-block DJ booth where a DJ Elf spins on dual
 * turntables. Across the tiles, a crowd of isometric North Pole ravers
 * (glowstick-waving elves, a top-hat snowman, Rudolph, a gingerbread dancer
 * and the Yeti) bobs on the kick and sways on the beat. Above them hangs a
 * rotating faceted mirror disco ball and laser rig that sweeps dual spotlight
 * cones on the hats and fires pitch-angled laser beams that refract at the
 * glass rim. Kicks and bass spin up the 3D snow vortex; snare fills or
 * SLEIGHCON transitions shake the globe and whip the snow into a blizzard;
 * SLEIGHCON 1 strobes the dome on the kick.
 */

import type {Theme, VizMode, VizModeDef, VizServices} from '@cycletron/viz-sdk';
import {type FieldHap, type FieldTeam, HapField} from '@cycletron/viz-sdk';
import {
    alphaRamp, clamp01, drawLabel, follow, hash32, lerpRgb, mixRgb, rampAt, rand01, rgbOf, TAU,
} from '@cycletron/viz-sdk';
import {Alert} from '../../lib/console/alert.js';
import {
    alertColor, bakeConsoleInk, type ConsoleInk, type ConsoleLayout, drawConsole, layoutConsole, type Rect,
    type Station,
} from '../../lib/console/chrome.js';
import {brackets, pad} from '../../lib/console/panel.js';
import {drawStrip, pictureRect} from '../../lib/console/strip.js';
import {box, cone, diamond, type Shade, star, View} from '../../lib/iso.js';

const LOOKAHEAD = 1;
const MAX_HAPS = 240;
const MAX_PER_TRACK = 32;
const DRUM_CAP = 16;
const IDLE_RATE = 0.25;
const FLAKES = 260;
/** Dancefloor is GRID × GRID iso tiles. */
const GRID = 6;
const MAX_BEAMS = 18;
const BEAM_LIFE = 0.48;
/** Snare-family hits inside FILL_WINDOW cycles that count as a drum fill. */
const FILL_HITS = 6;
const FILL_WINDOW = 0.5;
const WHITE: [number, number, number] = [255, 255, 255];
const STATION: Station = {code: 'STN-05', name: 'REC ROOM'};

interface Team extends FieldTeam {}
interface Hap extends FieldHap<Team> {
    pitched: boolean;
}

/**
 * 3D snowflake inside the unit sphere:
 * x, y in [-1, 1] (+y down), z in [-1, 1] (+z toward viewer),
 * r0 is its natural 3D radial shell so centrifugal force never clumps all snow on the glass wall.
 */
interface Flake {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    r0: number;
    y0: number;
    size: number;
    sparkle: boolean;
}

/** A laser from the disco rig: angle from straight down, radians. */
interface Beam {
    age: number;
    angle: number;
    css: string;
    width: number;
}

type DancerKind = 'elf' | 'snowman' | 'reindeer' | 'gingerbread' | 'yeti';

interface DancerSpot {
    i: number;
    j: number;
    kind: DancerKind;
    hatIdx: number;
    seed: number;
}

/** Pre-placed dancers across the 6×6 disco floor, sorted back-to-front in painter's order. */
const DANCERS: readonly DancerSpot[] = ([
    {i: 1.35, j: 2.15, kind: 'elf', hatIdx: 0, seed: 11},
    {i: 2.55, j: 1.85, kind: 'snowman', hatIdx: 1, seed: 23},
    {i: 4.15, j: 1.65, kind: 'elf', hatIdx: 2, seed: 37},
    {i: 1.25, j: 3.55, kind: 'gingerbread', hatIdx: 3, seed: 41},
    {i: 2.65, j: 3.15, kind: 'elf', hatIdx: 1, seed: 53},
    {i: 3.95, j: 2.95, kind: 'reindeer', hatIdx: 0, seed: 67},
    {i: 5.05, j: 2.55, kind: 'elf', hatIdx: 4, seed: 71},
    {i: 1.55, j: 4.85, kind: 'yeti', hatIdx: 2, seed: 83},
    {i: 3.05, j: 4.55, kind: 'elf', hatIdx: 0, seed: 97},
    {i: 4.55, j: 4.35, kind: 'elf', hatIdx: 3, seed: 109},
] satisfies DancerSpot[]).sort((a, b) => a.i + a.j - (b.i + b.j));

interface Palette {
    line: string;
    glassTop: string;
    glassBot: string;
    glassEdge: string;
    glassRim: string;
    shine: string;
    snowBedTop: string;
    snowBedMid: string;
    snowBedDeep: string;
    plinthWood: Shade;
    plinthDark: Shade;
    brass: Shade;
    stageBase: Shade;
    tile: Shade;
    tileAlt: Shade;
    tileLit: string[];
    hats: Shade[];
    tree: Shade;
    treeLight: Shade;
    tunic: Shade;
    red: Shade;
    gold: Shade;
    snowShade: Shade;
    skin: Shade;
    wood: Shade;
    yetiShade: Shade;
    iceShade: Shade;
    darkMetal: Shade;
    flakeBack: string;
    flakeFront: string;
    spot: string[];
    spotAlt: string[];
    strobe: string;
}

class SnowglobeMode implements VizMode {
    private readonly field = new HapField<Team, Hap>({
        lookahead: LOOKAHEAD,
        maxHaps: MAX_HAPS,
        maxPerTrack: MAX_PER_TRACK,
        idleRate: IDLE_RATE,
        team: (base) => base,
        hap: (base) => ({...base, pitched: Number.isFinite(base.note)}),
        cap: (_team, note) => (Number.isFinite(note) ? Infinity : DRUM_CAP),
        keep: (h, cycle) => h.end + 0.1 >= cycle,
    });
    private readonly alert = new Alert();
    private readonly view = new View();
    private readonly flakes: Flake[] = [];
    private readonly beams: Beam[] = [];
    /** Per tile: light 0..1 and the colour index it lit with. */
    private readonly tiles = new Float32Array(GRID * GRID);
    private readonly tileInk = new Uint8Array(GRID * GRID);
    private readonly snares: number[] = [];
    private pal!: Palette;
    private cink!: ConsoleInk;
    private lay!: ConsoleLayout;
    private pic: Rect = {x: 0, y: 0, w: 1, h: 1};
    /** Dome centre and radius, px. */
    private cx = 0;
    private cy = 0;
    private r = 1;
    private thump = 0;
    private swirl = 0;
    private shake = 0;
    private strobe = 0;
    private hatEnv = 0;
    private sweep = 0;
    private lastChange = -Infinity;
    private totalBeams = 0;

    layout(s: VizServices): void {
        this.lay = layoutConsole(s);
        const p = (this.pic = pictureRect(this.lay));
        // The dome, plinth and the line under it span cy - 1.08r .. cy + 1.28r + 1.4 small.
        const textH = this.lay.small * 1.4;
        this.r = Math.max(1, Math.min(p.w * 0.39, (p.h * 0.94 - textH) / 2.36));
        this.cx = p.x + p.w * 0.5;
        this.cy = p.y + (p.h - this.r * 2.36 - textH) * 0.5 + this.r * 1.08;
        this.pal = bakePalette(s.theme);
        this.cink = bakeConsoleInk(s.theme);
        this.view.line = this.pal.line;
        // Fit the 6×6 isometric dancefloor generously in the lower hemisphere of the dome.
        const fr = this.r * 0.76;
        this.view.fit(
            {x: this.cx - fr, y: this.cy - this.r * 0.10, w: 2 * fr, h: this.r * 0.78},
            [0, 0, 0, GRID, 0, 0, 0, GRID, 0, GRID, GRID, 0, 0, 0, 2.8],
        );
        this.field.invalidate();
        if (this.flakes.length === 0) this.seedFlakes(1);
    }

    update(dt: number, s: VizServices): void {
        this.alert.update(dt, s);
        const field = this.field;
        field.update(dt, s);
        if (field.restarted) {
            this.beams.length = 0;
            this.snares.length = 0;
            this.tiles.fill(0);
            this.thump = this.swirl = this.shake = this.strobe = this.hatEnv = 0;
            this.totalBeams = 0;
            this.seedFlakes(hash32(Math.floor(field.cycle), 3));
        }
        const cycle = field.cycle;
        const drop = this.alert.level === 1;
        for (const h of field.haps) {
            if (!field.crossed(h)) continue;
            h.done = true;
            h.team.activity = 1;
            this.lightTile(h);
            if (h.pitched) {
                this.fireBeam(h);
                continue;
            }
            switch (h.team.family) {
                case 'kick':
                    this.thump = 1;
                    this.swirl = Math.min(1.6, this.swirl + 0.35);
                    if (drop) this.strobe = 1;
                    break;
                case 'snare':
                    this.snares.push(h.begin);
                    break;
                case 'hat':
                    this.hatEnv = Math.min(1, this.hatEnv + 0.42);
                    break;
                default:
                    break;
            }
        }

        // Fill: a burst of snare-family hits in a short window shakes the globe.
        while (this.snares.length > 0 && this.snares[0] < cycle - FILL_WINDOW) this.snares.shift();
        if (this.snares.length >= FILL_HITS) {
            this.shakeGlobe(cycle);
            this.snares.length = 0;
        }
        if (this.alert.changedAt !== this.lastChange) {
            if (Number.isFinite(this.lastChange)) this.shakeGlobe(cycle);
            this.lastChange = this.alert.changedAt;
        }

        this.swirl = follow(this.swirl, 0.22 + 0.55 * clamp01(s.low), dt, 0.5, 0.8);
        this.thump *= Math.exp(-dt * 7.5);
        this.shake *= Math.exp(-dt * 3);
        this.strobe *= Math.exp(-dt * 12);
        this.hatEnv *= Math.exp(-dt * 4);
        this.sweep += dt * (0.45 + 2.5 * this.hatEnv);
        for (let n = 0; n < this.tiles.length; n++) this.tiles[n] *= Math.exp(-dt * 2.8);
        for (let n = this.beams.length - 1; n >= 0; n--) {
            this.beams[n].age += dt;
            if (this.beams[n].age >= BEAM_LIFE) this.beams.splice(n, 1);
        }
        this.stepSnow(dt, cycle);
    }

    render(ctx: CanvasRenderingContext2D, s: VizServices): void {
        const pal = this.pal;
        const b = this.pic;
        const cycle = this.field.cycle;
        const wob = this.shake * this.r * 0.038;
        const ox = Math.sin(cycle * 37) * wob, oy = Math.cos(cycle * 29) * wob * 0.5;

        ctx.save();
        ctx.fillStyle = this.cink.bg;
        ctx.fillRect(0, 0, s.width, s.height);
        ctx.beginPath();
        ctx.rect(b.x, b.y, b.w, b.h);
        ctx.clip();

        this.drawViewportHud(ctx);

        ctx.save();
        ctx.translate(ox, oy);

        // Refracted outer laser beams behind the glass rim
        this.drawBeams(ctx, 0);

        // Inside the snowglobe sphere
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.cx, this.cy, this.r, 0, TAU);
        ctx.clip();

        // Deep winter night gradient inside the dome
        const bgGrad = ctx.createLinearGradient(this.cx, this.cy - this.r, this.cx, this.cy + this.r);
        bgGrad.addColorStop(0, pal.glassTop);
        bgGrad.addColorStop(0.65, pal.glassBot);
        bgGrad.addColorStop(1, pal.snowBedDeep);
        ctx.fillStyle = bgGrad;
        ctx.fillRect(this.cx - this.r, this.cy - this.r, 2 * this.r, 2 * this.r);

        // Background snow layer (behind the stage & tree)
        this.drawSnow(ctx, false, cycle);
        // Sweeping spotlights from the disco ball
        this.drawSpots(ctx, s);
        // Contoured snowbank base & mini snow-dusted pines inside the globe bottom
        this.drawSnowbed(ctx);
        // Illuminated 6×6 isometric dancefloor, tree, DJ booth, and North Pole ravers
        this.drawFloor(ctx, s, cycle);
        // Internal laser beams and rotating mirror disco ball rig
        this.drawBeams(ctx, 1);
        this.drawDiscoRig(ctx, cycle);
        // Foreground snow layer (in front of the dancers & lasers)
        this.drawSnow(ctx, true, cycle);

        if (this.strobe > 0.02) {
            ctx.globalAlpha = this.strobe * 0.42;
            ctx.fillStyle = pal.strobe;
            ctx.fillRect(this.cx - this.r, this.cy - this.r, 2 * this.r, 2 * this.r);
            ctx.globalAlpha = 1;
        }
        ctx.restore();

        // Thick glass sphere reflections and ornate wooden/brass pedestal
        this.drawGlass(ctx);
        this.drawPlinth(ctx, cycle);
        ctx.restore();

        ctx.restore();

        this.drawCells(ctx, cycle);
        drawConsole(ctx, s, this.lay, this.cink, this.alert, STATION);
    }

    // ---- events ---------------------------------------------------------

    private lightTile(h: Hap): void {
        const n = hash32(h.seed, 9) % (GRID * GRID);
        const inkIdx = h.team.slot % this.pal.tileLit.length;
        this.tiles[n] = 1;
        this.tileInk[n] = inkIdx;
        // On strong or low notes, also splash adjacent tiles so the floor feels alive.
        if (!h.pitched || h.note < 55) {
            const adj = (n + 1 + (hash32(h.seed, 17) % (GRID - 1))) % (GRID * GRID);
            this.tiles[adj] = Math.max(this.tiles[adj], 0.75);
            this.tileInk[adj] = (inkIdx + 1) % this.pal.tileLit.length;
        }
    }

    private fireBeam(h: Hap): void {
        if (this.beams.length >= MAX_BEAMS) this.beams.shift();
        // Low notes lean left, high notes right, across ±62 degrees.
        const angle = (clamp01((h.note - 36) / 60) - 0.5) * (TAU * 0.34);
        this.beams.push({
            age: 0,
            angle,
            css: lerpRgb(h.team.rgb, WHITE, 0.28),
            width: h.end - h.begin > 0.45 ? 2.8 : 1.6,
        });
        this.totalBeams++;
    }

    private shakeGlobe(cycle: number): void {
        this.shake = 1;
        this.swirl = Math.min(1.8, this.swirl + 0.65);
        const dir = rand01(hash32(Math.floor(cycle * 16), 5)) * TAU;
        for (let i = 0; i < this.flakes.length; i++) {
            const f = this.flakes[i];
            const jitter = rand01(hash32(i, 91)) - 0.5;
            const vJitter = rand01(hash32(i, 97)) - 0.52;
            f.vx += Math.cos(dir + jitter) * 0.9;
            f.vy += vJitter * 1.1;
            f.vz += Math.sin(dir + jitter) * 0.9;
        }
    }

    // ---- snow -----------------------------------------------------------

    private seedFlakes(seed: number): void {
        this.flakes.length = 0;
        for (let n = 0; n < FLAKES; n++) {
            // Distribute evenly inside the 3D sphere using cube-root radial distribution
            const u = rand01(hash32(seed, n * 5 + 1));
            const v = rand01(hash32(seed, n * 5 + 2));
            const theta = u * TAU;
            const phi = Math.acos(2 * v - 1);
            const r0 = 0.14 + 0.80 * Math.cbrt(rand01(hash32(seed, n * 5 + 3)));
            const x = r0 * Math.sin(phi) * Math.cos(theta);
            const y = -0.82 + 1.48 * v;
            const z = r0 * Math.sin(phi) * Math.sin(theta);
            const size = 0.7 + 1.7 * rand01(hash32(seed, n * 5 + 4));
            this.flakes.push({
                x,
                y,
                z,
                vx: 0,
                vy: 0,
                vz: 0,
                r0,
                y0: y,
                size,
                sparkle: (n & 3) === 0,
            });
        }
    }

    /**
     * 3D cylindrical vortex swirl around the vertical y-axis with centripetal
     * shell restoration so flakes never pile up on the outer glass wall, plus
     * steady snowfall across the full vertical span of the dome.
     */
    private stepSnow(dt: number, cycle: number): void {
        const omega = 0.55 + this.swirl * 1.65;
        for (let i = 0; i < this.flakes.length; i++) {
            const f = this.flakes[i];
            const rho = Math.hypot(f.x, f.z) + 1e-5;
            const maxRhoAtY = Math.sqrt(Math.max(0.04, 0.88 - f.y * f.y * 0.82));
            const targetRho = Math.min(maxRhoAtY, f.r0);
            // Tangential swirl in the horizontal (x, z) plane + radial spring toward targetRho
            const tx = -f.z / rho;
            const tz = f.x / rho;
            const radialPull = (targetRho - rho) * 2.4;
            const rx = (f.x / rho) * radialPull;
            const rz = (f.z / rho) * radialPull;

            f.vx += (tx * omega + rx - f.vx * 2.0) * dt;
            f.vz += (tz * omega + rz - f.vz * 2.0) * dt;
            // Steady downward snowfall + gentle wave + floor kick puff
            const fallSpeed = 0.18 + f.size * 0.05;
            const waveY = Math.sin(cycle * TAU + i * 0.43) * 0.08;
            const updraft = this.thump > 0.7 && f.y > 0.45 ? -0.45 * this.thump : 0;
            f.vy += (fallSpeed + waveY + updraft - f.vy * 2.2) * dt;

            f.x += f.vx * dt;
            f.y += f.vy * dt;
            f.z += f.vz * dt;

            // Recycle flakes that settle into the lower snowbed back to the top of the dome
            if (f.y > 0.66) {
                f.y = -0.82 - (i % 9) * 0.012;
                const ang = (i * 2.39996 + cycle) % TAU;
                const rad = 0.12 + 0.48 * ((i % 13) / 13);
                f.x = Math.cos(ang) * rad;
                f.z = Math.sin(ang) * rad;
                f.vy = fallSpeed;
            } else if (f.y < -0.86) {
                f.y = -0.86;
                f.vy = Math.abs(f.vy) * 0.4;
            }

            // Keep strictly inside the sphere radius
            const r3 = Math.hypot(f.x, f.y, f.z);
            if (r3 > 0.93) {
                const s = 0.91 / r3;
                f.x *= s;
                f.y *= s;
                f.z *= s;
                f.vx *= -0.25;
                f.vy *= -0.25;
                f.vz *= -0.25;
            }
        }
    }

    // ---- drawing --------------------------------------------------------

    private drawSnow(ctx: CanvasRenderingContext2D, front: boolean, cycle: number): void {
        ctx.fillStyle = front ? this.pal.flakeFront : this.pal.flakeBack;
        const baseScale = this.r * 0.0065;
        for (let i = 0; i < this.flakes.length; i++) {
            const f = this.flakes[i];
            if ((f.z >= 0) !== front) continue;
            const depthScale = 0.75 + 0.35 * ((f.z + 1) * 0.5);
            const x = this.cx + f.x * this.r;
            const y = this.cy + f.y * this.r;
            const z = Math.max(1.2, f.size * baseScale * depthScale);
            ctx.fillRect(x - z * 0.5, y - z * 0.5, z, z);
            if (front && f.sparkle && ((i + Math.floor(cycle * 8)) & 7) === 0) {
                ctx.fillRect(x - z * 1.1, y - 0.5, z * 2.2, 1);
                ctx.fillRect(x - 0.5, y - z * 1.1, 1, z * 2.2);
            }
        }
    }

    /** Contoured snowy hill cushion inside the bottom of the globe, plus mini snow-dusted pines. */
    private drawSnowbed(ctx: CanvasRenderingContext2D): void {
        const {cx, cy, r, pal} = this;
        const bedY = cy + r * 0.44;

        // Back snowdrift contour
        ctx.fillStyle = pal.snowBedMid;
        ctx.beginPath();
        ctx.moveTo(cx - r, bedY + r * 0.08);
        ctx.quadraticCurveTo(cx - r * 0.45, bedY - r * 0.08, cx, bedY - r * 0.02);
        ctx.quadraticCurveTo(cx + r * 0.48, bedY - r * 0.10, cx + r, bedY + r * 0.06);
        ctx.lineTo(cx + r, cy + r);
        ctx.lineTo(cx - r, cy + r);
        ctx.closePath();
        ctx.fill();

        // Front snowbank cushion under the isometric stage
        ctx.fillStyle = pal.snowBedTop;
        ctx.beginPath();
        ctx.moveTo(cx - r, bedY + r * 0.18);
        ctx.quadraticCurveTo(cx, bedY + r * 0.04, cx + r, bedY + r * 0.16);
        ctx.lineTo(cx + r, cy + r);
        ctx.lineTo(cx - r, cy + r);
        ctx.closePath();
        ctx.fill();

        // Miniature snow-dusted pine trees flanking the dancefloor inside the globe
        this.drawMiniPine(ctx, cx - r * 0.68, bedY + r * 0.04, r * 0.16);
        this.drawMiniPine(ctx, cx - r * 0.55, bedY + r * 0.12, r * 0.12);
        this.drawMiniPine(ctx, cx + r * 0.66, bedY + r * 0.03, r * 0.16);
        this.drawMiniPine(ctx, cx + r * 0.53, bedY + r * 0.11, r * 0.12);
    }

    private drawMiniPine(ctx: CanvasRenderingContext2D, x: number, footY: number, h: number): void {
        const {pal} = this;
        const w = h * 0.58;
        ctx.fillStyle = pal.wood.right;
        ctx.fillRect(x - w * 0.12, footY - h * 0.18, w * 0.24, h * 0.18);
        for (let tier = 0; tier < 3; tier++) {
            const ty = footY - h * (0.15 + tier * 0.26);
            const tw = w * (1 - tier * 0.22);
            const th = h * 0.42;
            ctx.fillStyle = pal.tree.left;
            ctx.beginPath();
            ctx.moveTo(x, ty - th);
            ctx.lineTo(x - tw, ty);
            ctx.lineTo(x + tw, ty);
            ctx.closePath();
            ctx.fill();
            // Snow cap on tip
            ctx.fillStyle = pal.snowShade.top;
            ctx.beginPath();
            ctx.moveTo(x, ty - th);
            ctx.lineTo(x - tw * 0.38, ty - th * 0.62);
            ctx.lineTo(x + tw * 0.38, ty - th * 0.62);
            ctx.closePath();
            ctx.fill();
        }
    }

    /** Dual sweeping spotlight cones from the mirror ball rig, widened by the mids. */
    private drawSpots(ctx: CanvasRenderingContext2D, s: VizServices): void {
        const top = this.cy - this.r * 0.78;
        const width = 0.11 + 0.11 * clamp01(s.mid);
        for (let k = 0; k < 2; k++) {
            const baseAng = k === 0 ? -0.24 : 0.24;
            const a = baseAng + Math.sin(this.sweep * (k === 0 ? 1 : -1.15) + k * 1.3) * 0.36;
            const len = this.r * 1.85;
            const ramp = k === 0 ? this.pal.spot : this.pal.spotAlt;
            ctx.fillStyle = rampAt(ramp, 0.09 + 0.20 * this.hatEnv);
            ctx.beginPath();
            ctx.moveTo(this.cx, top);
            ctx.lineTo(this.cx + Math.sin(a - width) * len, top + Math.cos(a - width) * len);
            ctx.lineTo(this.cx + Math.sin(a + width) * len, top + Math.cos(a + width) * len);
            ctx.closePath();
            ctx.fill();
        }
    }

    /**
     * Lasers from the overhead disco rig. Pass 1 draws inside the glass; pass 0
     * draws the refracted continuation outside the sphere using Snell's law at
     * the glass rim normal.
     */
    private drawBeams(ctx: CanvasRenderingContext2D, inside: 0 | 1): void {
        const top = this.cy - this.r * 0.78;
        ctx.lineCap = 'round';
        for (const beam of this.beams) {
            const t = beam.age / BEAM_LIFE;
            const dx = Math.sin(beam.angle), dy = Math.cos(beam.angle);
            const px = 0, py = top - this.cy;
            const bq = px * dx + py * dy;
            const exit = -bq + Math.sqrt(Math.max(0, bq * bq - (px * px + py * py - this.r * this.r)));
            const ex = this.cx + dx * exit, ey = top + dy * exit;
            ctx.strokeStyle = beam.css;
            if (inside === 1) {
                ctx.globalAlpha = (1 - t) * 0.92;
                ctx.lineWidth = beam.width;
                ctx.beginPath();
                ctx.moveTo(this.cx, top);
                ctx.lineTo(ex, ey);
                ctx.stroke();
            } else {
                // Outward surface normal at (ex, ey) and Snell refraction into air
                const nx = (ex - this.cx) / this.r;
                const ny = (ey - this.cy) / this.r;
                const normAng = Math.atan2(nx, ny);
                const inc = beam.angle - normAng;
                const sinRef = Math.max(-0.96, Math.min(0.96, Math.sin(inc) * 1.32));
                const bent = normAng + Math.asin(sinRef);
                ctx.globalAlpha = (1 - t) * 0.34;
                ctx.lineWidth = beam.width * 2.1;
                ctx.beginPath();
                ctx.moveTo(ex, ey);
                ctx.lineTo(ex + Math.sin(bent) * this.r * 0.42, ey + Math.cos(bent) * this.r * 0.42);
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
        ctx.lineCap = 'butt';
    }

    /** Rotating faceted mirror disco ball and upper mounting truss at the top of the dome. */
    private drawDiscoRig(ctx: CanvasRenderingContext2D, cycle: number): void {
        const {cx, cy, r, pal} = this;
        const rigTop = cy - r;
        const ballY = cy - r * 0.78;
        const ballR = Math.max(6, r * 0.072);

        // Truss rod & mounting collar at apex
        ctx.strokeStyle = pal.brass.top;
        ctx.lineWidth = Math.max(2, r * 0.014);
        ctx.beginPath();
        ctx.moveTo(cx, rigTop);
        ctx.lineTo(cx, ballY - ballR);
        ctx.stroke();

        // Soft glow halo around the mirror ball
        const glowR = ballR * (1.8 + this.thump * 0.7);
        const g = ctx.createRadialGradient(cx, ballY, ballR * 0.2, cx, ballY, glowR);
        g.addColorStop(0, pal.shine);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, ballY, glowR, 0, TAU);
        ctx.fill();

        // Mirror ball sphere body
        ctx.fillStyle = pal.darkMetal.left;
        ctx.beginPath();
        ctx.arc(cx, ballY, ballR, 0, TAU);
        ctx.fill();

        // Rotating mirror facet grid
        const spin = (cycle * 1.5) % 1;
        const rows = 4, cols = 6;
        for (let rowIdx = 0; rowIdx < rows; rowIdx++) {
            const v = (rowIdx + 0.5) / rows;
            const lat = (v - 0.5) * Math.PI * 0.85;
            const ry = Math.sin(lat) * ballR;
            const ringR = Math.cos(lat) * ballR;
            for (let colIdx = 0; colIdx < cols; colIdx++) {
                const u = ((colIdx + spin) / cols) * Math.PI - Math.PI * 0.5;
                const rx = Math.sin(u) * ringR;
                const fw = Math.max(1.5, Math.cos(u) * ballR * 0.28);
                const fh = Math.max(1.5, ballR * 0.28);
                const flash = ((rowIdx * 7 + colIdx * 3 + Math.floor(cycle * 8)) & 3) === 0;
                ctx.fillStyle = flash
                    ? '#ffffff'
                    : (rowIdx + colIdx) & 1
                        ? pal.snowShade.top
                        : pal.iceShade.top;
                ctx.fillRect(cx + rx - fw * 0.5, ballY + ry - fh * 0.5, fw, fh);
            }
        }

        ctx.strokeStyle = pal.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, ballY, ballR, 0, TAU);
        ctx.stroke();
    }

    /**
     * The 6×6 illuminated isometric disco dancefloor, 3-tier Rave Christmas Tree,
     * Ice DJ Booth with DJ Elf, and 10 North Pole ravers sorted back-to-front.
     */
    private drawFloor(ctx: CanvasRenderingContext2D, s: VizServices, cycle: number): void {
        const v = this.view;
        const pal = this.pal;
        const beat = (cycle * 4) % 1;
        const beatIdx = Math.floor(cycle * 4);

        // Dark bevelled stage platform skirt beneath the 6×6 tile grid
        box(ctx, v, -0.08, -0.08, -0.18, GRID + 0.16, GRID + 0.16, 0.18, pal.stageBase);

        // 6×6 illuminated disco floor tiles
        for (let i = 0; i < GRID; i++) {
            for (let j = 0; j < GRID; j++) {
                const n = i * GRID + j;
                let lit = this.tiles[n];
                let colorIdx = this.tileInk[n];
                // Subtle rhythmic chaser pattern on the outer ring when locked
                if (this.field.locked && lit < 0.18 && ((i + j + beatIdx) & 3) === 0) {
                    lit = 0.22 * (1 - beat * 0.7);
                    colorIdx = (i + j + beatIdx) % pal.tileLit.length;
                }
                const baseTile = (i + j) & 1 ? pal.tile : pal.tileAlt;
                const css = pal.tileLit[colorIdx % pal.tileLit.length];
                const shade: Shade = lit > 0.04
                    ? {
                        top: rampAt(alphaRamp(rgbOf(css, WHITE)), 0.35 + 0.65 * clamp01(lit)),
                        left: baseTile.left,
                        right: baseTile.right,
                    }
                    : baseTile;
                box(ctx, v, i, j, 0, 1, 1, 0.16, shade);

                // Inner glowing neon pad on active tiles
                if (lit > 0.12) {
                    const inner: Shade = {top: css, left: css, right: css};
                    box(ctx, v, i + 0.16, j + 0.16, 0.16, 0.68, 0.68, 0.015, inner, false);
                }
            }
        }

        // Back-left (0.72, 0.72): 3-tier decorated Rave Christmas Tree with star topper
        this.drawHolidayTree(ctx, 0.75, 0.75, cycle);

        // Back-right (2.55, 0.55): Ice-block DJ Booth & DJ Elf spinning on dual turntables
        this.drawDjBooth(ctx, 2.55, 0.52, s, cycle);

        // Foreground & mid-floor crowd of North Pole ravers in strict isometric painter's order
        for (let idx = 0; idx < DANCERS.length; idx++) {
            const d = DANCERS[idx];
            this.drawDancer(ctx, d, idx, cycle);
        }
    }

    private drawHolidayTree(ctx: CanvasRenderingContext2D, i: number, j: number, cycle: number): void {
        const v = this.view;
        const pal = this.pal;
        diamond(ctx, v, i, j, 0.55, pal.line);
        // Trunk & festive tree stand
        box(ctx, v, i - 0.18, j - 0.18, 0.16, 0.36, 0.36, 0.10, pal.red);
        box(ctx, v, i - 0.11, j - 0.11, 0.26, 0.22, 0.22, 0.18, pal.wood);
        // Three stacked evergreen tiers
        cone(ctx, v, i, j, 0.36, 0.62, 0.95, pal.tree);
        cone(ctx, v, i, j, 0.92, 0.48, 0.85, pal.treeLight);
        cone(ctx, v, i, j, 1.44, 0.34, 0.75, pal.tree);
        // Twinkling ornament baubles on the boughs
        const ornSpots: readonly [number, number, number][] = [
            [i + 0.25, j + 0.10, 0.62],
            [i - 0.10, j + 0.26, 0.68],
            [i + 0.18, j + 0.18, 1.12],
            [i - 0.08, j + 0.20, 1.22],
            [i + 0.12, j + 0.08, 1.62],
        ];
        const beatStep = Math.floor(cycle * 4);
        for (let n = 0; n < ornSpots.length; n++) {
            const [oi, oj, ok] = ornSpots[n];
            const sh = (n + beatStep) % 3 === 0 ? pal.gold : (n + beatStep) % 3 === 1 ? pal.red : pal.iceShade;
            box(ctx, v, oi, oj, ok, 0.11, 0.11, 0.11, sh, false);
        }
        // Wrapped gifts tucked at the base of the tree
        box(ctx, v, i + 0.38, j - 0.12, 0.16, 0.28, 0.28, 0.22, pal.red);
        box(ctx, v, i + 0.48, j - 0.13, 0.16, 0.08, 0.30, 0.23, pal.gold, false);
        box(ctx, v, i - 0.15, j + 0.38, 0.16, 0.25, 0.25, 0.19, pal.iceShade);
        box(ctx, v, i - 0.06, j + 0.37, 0.16, 0.07, 0.27, 0.20, pal.snowShade, false);
        // Radiant 5-point Star Topper
        star(ctx, v, i, j, 2.22, 0.24, pal.gold.top, Math.max(1.5, v.scale * 2.2));
    }

    private drawDjBooth(ctx: CanvasRenderingContext2D, i: number, j: number, s: VizServices, cycle: number): void {
        const v = this.view;
        const pal = this.pal;
        const bob = this.thump * 0.08 + Math.max(0, Math.sin(cycle * TAU * 2)) * 0.04;

        // DJ Elf standing behind the booth (drawn first so the booth overlaps the lower legs)
        const di = i + 0.62, dj = j + 0.12;
        const dk = 0.16 + bob;
        box(ctx, v, di - 0.16, dj - 0.14, dk, 0.32, 0.28, 0.46, pal.tunic);
        box(ctx, v, di - 0.17, dj - 0.15, dk + 0.44, 0.34, 0.30, 0.06, pal.snowShade, false);
        // Head with dark rave sunglasses & headphones
        const hk = dk + 0.50;
        box(ctx, v, di - 0.14, dj - 0.13, hk, 0.28, 0.26, 0.25, pal.skin);
        // Headphones earcups & band
        box(ctx, v, di - 0.19, dj - 0.04, hk + 0.06, 0.07, 0.12, 0.14, pal.red, false);
        box(ctx, v, di + 0.12, dj - 0.04, hk + 0.06, 0.07, 0.12, 0.14, pal.red, false);
        // Dark rave shades on the front face
        box(ctx, v, di - 0.11, dj + 0.11, hk + 0.10, 0.22, 0.04, 0.07, pal.darkMetal, false);
        // Hat brim & cone hat
        box(ctx, v, di - 0.16, dj - 0.15, hk + 0.24, 0.32, 0.30, 0.07, pal.snowShade);
        cone(ctx, v, di, dj, hk + 0.31, 0.18, 0.44, pal.red);
        // Left arm on the decks, right arm pumping in the air with a glowstick!
        const pump = Math.sin(cycle * TAU * 2) * 0.12 + this.thump * 0.16;
        box(ctx, v, di + 0.14, dj + 0.02, dk + 0.36 + pump, 0.11, 0.11, 0.22, pal.tunic, false);
        box(ctx, v, di + 0.16, dj + 0.04, dk + 0.58 + pump, 0.07, 0.07, 0.24, pal.gold, false);

        // Ice-block DJ console table in front of the DJ Elf
        const bj = j + 0.38;
        box(ctx, v, i, bj, 0.16, 1.28, 0.52, 0.48, pal.iceShade);
        box(ctx, v, i - 0.03, bj - 0.03, 0.62, 1.34, 0.58, 0.06, pal.snowShade);
        // Glowing EQ bars on the front (+j) face of the DJ booth
        const bands = [clamp01(s.low), clamp01(s.mid), clamp01(s.high), clamp01((s.low + s.high) * 0.6)];
        for (let b = 0; b < bands.length; b++) {
            const bh = Math.max(0.06, bands[b] * 0.34);
            const sh = b % 2 === 0 ? pal.red : pal.gold;
            box(ctx, v, i + 0.14 + b * 0.26, bj + 0.49, 0.20, 0.18, 0.04, bh, sh, false);
        }
        // Dual vinyl turntables & mixer on top of the DJ console
        box(ctx, v, i + 0.14, bj + 0.10, 0.68, 0.34, 0.34, 0.05, pal.darkMetal);
        box(ctx, v, i + 0.27, bj + 0.23, 0.73, 0.08, 0.08, 0.03, pal.gold, false);
        box(ctx, v, i + 0.54, bj + 0.12, 0.68, 0.20, 0.30, 0.06, pal.stageBase, false);
        box(ctx, v, i + 0.80, bj + 0.10, 0.68, 0.34, 0.34, 0.05, pal.darkMetal);
        box(ctx, v, i + 0.93, bj + 0.23, 0.73, 0.08, 0.08, 0.03, pal.red, false);
    }

    /**
     * One North Pole raver on the dancefloor: elves waving neon glowsticks,
     * a top-hat snowman, Rudolph with his glowing red nose, a gingerbread dancer,
     * and the frost Yeti.
     */
    private drawDancer(ctx: CanvasRenderingContext2D, d: DancerSpot, idx: number, cycle: number): void {
        const v = this.view;
        const pal = this.pal;
        const sway = Math.sin(cycle * TAU + idx * 1.1) * 0.06;
        const bounce = Math.abs(Math.sin(cycle * TAU * 2 + idx * 0.7)) * 0.10 + this.thump * 0.18 * (0.7 + 0.3 * ((idx & 1)));
        const i = d.i + sway;
        const j = d.j - sway * 0.5;
        const k0 = 0.16 + bounce;

        // Ground shadow on the dancefloor tile
        diamond(ctx, v, d.i, d.j, 0.24, pal.line);

        if (d.kind === 'snowman') {
            // Three stacked snow spheres, red scarf, carrot nose, black top hat & waving arms
            box(ctx, v, i - 0.18, j - 0.18, k0, 0.36, 0.36, 0.26, pal.snowShade);
            box(ctx, v, i - 0.15, j - 0.15, k0 + 0.26, 0.30, 0.30, 0.22, pal.snowShade);
            box(ctx, v, i - 0.16, j - 0.16, k0 + 0.46, 0.32, 0.32, 0.06, pal.red, false);
            box(ctx, v, i - 0.13, j - 0.13, k0 + 0.52, 0.26, 0.26, 0.22, pal.snowShade);
            box(ctx, v, i + 0.08, j + 0.08, k0 + 0.59, 0.10, 0.10, 0.06, pal.gold, false);
            box(ctx, v, i - 0.16, j - 0.16, k0 + 0.74, 0.32, 0.32, 0.05, pal.darkMetal);
            box(ctx, v, i - 0.11, j - 0.11, k0 + 0.79, 0.22, 0.22, 0.18, pal.darkMetal);
            return;
        }

        if (d.kind === 'reindeer') {
            // Dancing Rudolph with brown coat, red harness, golden antlers & glowing red nose
            box(ctx, v, i - 0.11, j - 0.09, k0, 0.09, 0.09, 0.16, pal.darkMetal, false);
            box(ctx, v, i + 0.02, j + 0.01, k0, 0.09, 0.09, 0.16, pal.darkMetal, false);
            box(ctx, v, i - 0.16, j - 0.15, k0 + 0.14, 0.32, 0.30, 0.34, pal.wood);
            box(ctx, v, i - 0.17, j - 0.16, k0 + 0.38, 0.34, 0.32, 0.07, pal.red, false);
            box(ctx, v, i - 0.13, j - 0.13, k0 + 0.48, 0.26, 0.26, 0.24, pal.wood);
            box(ctx, v, i + 0.08, j + 0.08, k0 + 0.54, 0.10, 0.10, 0.10, pal.red, false);
            // Golden antlers
            box(ctx, v, i - 0.14, j - 0.05, k0 + 0.72, 0.06, 0.06, 0.20, pal.gold, false);
            box(ctx, v, i + 0.08, j - 0.05, k0 + 0.72, 0.06, 0.06, 0.20, pal.gold, false);
            return;
        }

        if (d.kind === 'yeti') {
            // Frost-blue Yeti raver with white fur belly and horns
            box(ctx, v, i - 0.20, j - 0.18, k0, 0.40, 0.36, 0.52, pal.yetiShade);
            box(ctx, v, i - 0.12, j + 0.14, k0 + 0.08, 0.24, 0.06, 0.34, pal.snowShade, false);
            box(ctx, v, i - 0.17, j - 0.15, k0 + 0.52, 0.34, 0.30, 0.26, pal.yetiShade);
            box(ctx, v, i - 0.18, j - 0.06, k0 + 0.76, 0.08, 0.08, 0.14, pal.snowShade, false);
            box(ctx, v, i + 0.10, j - 0.06, k0 + 0.76, 0.08, 0.08, 0.14, pal.snowShade, false);
            return;
        }

        if (d.kind === 'gingerbread') {
            // Gingerbread dancer with white icing trim and red gumdrop buttons
            box(ctx, v, i - 0.16, j - 0.14, k0, 0.32, 0.28, 0.44, pal.wood);
            box(ctx, v, i - 0.17, j - 0.15, k0 + 0.20, 0.34, 0.30, 0.05, pal.snowShade, false);
            box(ctx, v, i - 0.04, j + 0.12, k0 + 0.30, 0.08, 0.05, 0.08, pal.red, false);
            box(ctx, v, i - 0.14, j - 0.12, k0 + 0.44, 0.28, 0.26, 0.25, pal.wood);
            box(ctx, v, i - 0.15, j - 0.13, k0 + 0.67, 0.30, 0.28, 0.05, pal.snowShade, false);
            return;
        }

        // Default ('elf'): Raver Elf with candy-striped legs, belted tunic, pointed ears, cone hat & neon glowsticks!
        const hat = pal.hats[d.hatIdx % pal.hats.length];
        const glowL = pal.hats[(d.hatIdx + 1) % pal.hats.length];
        const glowR = pal.hats[(d.hatIdx + 2) % pal.hats.length];

        // Boots & striped stockings
        box(ctx, v, i - 0.12, j - 0.05, k0, 0.10, 0.11, 0.08, pal.darkMetal, false);
        box(ctx, v, i + 0.02, j + 0.01, k0, 0.10, 0.11, 0.08, pal.darkMetal, false);
        box(ctx, v, i - 0.11, j - 0.04, k0 + 0.08, 0.09, 0.09, 0.08, pal.snowShade, false);
        box(ctx, v, i + 0.02, j + 0.02, k0 + 0.08, 0.09, 0.09, 0.08, pal.red, false);

        // Tunic body, red hem, belt & white collar
        const tk = k0 + 0.15;
        box(ctx, v, i - 0.16, j - 0.15, tk, 0.32, 0.30, 0.38, pal.tunic);
        box(ctx, v, i - 0.17, j - 0.16, tk, 0.34, 0.32, 0.06, pal.red, false);
        box(ctx, v, i - 0.17, j - 0.16, tk + 0.16, 0.34, 0.32, 0.05, pal.darkMetal, false);
        box(ctx, v, i - 0.04, j + 0.12, tk + 0.15, 0.09, 0.05, 0.07, pal.gold, false);
        box(ctx, v, i - 0.17, j - 0.16, tk + 0.36, 0.34, 0.32, 0.05, pal.snowShade, false);

        // Head, pointed ears, hat brim, cone hat & pompom
        const hk = tk + 0.41;
        box(ctx, v, i - 0.20, j - 0.03, hk + 0.07, 0.07, 0.07, 0.08, pal.skin, false);
        box(ctx, v, i - 0.13, j - 0.12, hk, 0.26, 0.25, 0.23, pal.skin);
        box(ctx, v, i + 0.13, j + 0.01, hk + 0.07, 0.07, 0.07, 0.08, pal.skin, false);
        box(ctx, v, i - 0.16, j - 0.15, hk + 0.22, 0.32, 0.30, 0.07, pal.snowShade);
        cone(ctx, v, i, j, hk + 0.29, 0.17, 0.44, hat);
        box(ctx, v, i - 0.05, j - 0.05, hk + 0.71, 0.10, 0.10, 0.10, pal.snowShade, false);

        // Raised rave arms waving twin neon glowsticks in alternating phase
        const wave = Math.sin(cycle * TAU * 2 + idx * 1.7) * 0.14;
        // Left arm & glowstick
        box(ctx, v, i - 0.24, j - 0.04, tk + 0.26 - wave, 0.09, 0.09, 0.16, pal.tunic, false);
        box(ctx, v, i - 0.23, j - 0.03, tk + 0.42 - wave, 0.06, 0.06, 0.22, glowL, false);
        // Right arm & glowstick
        box(ctx, v, i + 0.15, j + 0.02, tk + 0.26 + wave, 0.09, 0.09, 0.16, pal.tunic, false);
        box(ctx, v, i + 0.17, j + 0.04, tk + 0.42 + wave, 0.06, 0.06, 0.22, glowR, false);
    }

    /** Ornate tiered wooden and brass snowglobe pedestal with an engraved nameplate. */
    private drawPlinth(ctx: CanvasRenderingContext2D, cycle: number): void {
        const {cx, cy, r, pal} = this;
        const wTop = r * 1.24;
        const wBot = r * 1.56;
        const h = r * 0.34;
        const y0 = cy + r * 0.80;

        // Ground shadow under pedestal
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.ellipse(cx, y0 + h * 1.22, wBot * 0.56, h * 0.18, 0, 0, TAU);
        ctx.fill();

        // Upper brass collar ring clasping the bottom of the glass sphere
        const collarH = h * 0.16;
        ctx.fillStyle = pal.brass.left;
        ctx.fillRect(cx - wTop * 0.48, y0 - collarH * 0.5, wTop * 0.96, collarH);
        ctx.fillStyle = pal.brass.top;
        ctx.fillRect(cx - wTop * 0.48, y0 - collarH * 0.5, wTop * 0.96, collarH * 0.35);

        // Main bevelled wooden plinth body (3-face shading: left highlight, center face, right shadow)
        ctx.fillStyle = pal.plinthWood.left;
        ctx.beginPath();
        ctx.moveTo(cx - wTop * 0.5, y0);
        ctx.lineTo(cx + wTop * 0.5, y0);
        ctx.lineTo(cx + wBot * 0.5, y0 + h);
        ctx.lineTo(cx - wBot * 0.5, y0 + h);
        ctx.closePath();
        ctx.fill();

        // Right-side shadow facet on the bevelled plinth
        ctx.fillStyle = pal.plinthWood.right;
        ctx.beginPath();
        ctx.moveTo(cx + wTop * 0.22, y0);
        ctx.lineTo(cx + wTop * 0.5, y0);
        ctx.lineTo(cx + wBot * 0.5, y0 + h);
        ctx.lineTo(cx + wBot * 0.24, y0 + h);
        ctx.closePath();
        ctx.fill();

        // Upper and lower brass trim moldings on the plinth
        ctx.fillStyle = pal.brass.top;
        ctx.fillRect(cx - wTop * 0.5, y0, wTop, Math.max(1.5, h * 0.06));
        ctx.fillStyle = pal.plinthDark.right;
        ctx.fillRect(cx - wBot * 0.53, y0 + h, wBot * 1.06, h * 0.20);
        ctx.fillStyle = pal.plinthWood.top;
        ctx.fillRect(cx - wBot * 0.53, y0 + h, wBot * 1.06, h * 0.06);

        // Recessed brass nameplate with corner rivets & status LEDs
        const pw = wTop * 0.72, ph = h * 0.48;
        const px = cx - pw * 0.5, py = y0 + (h - ph) * 0.52;
        ctx.fillStyle = pal.plinthDark.right;
        ctx.fillRect(px - 2, py - 2, pw + 4, ph + 4);
        ctx.fillStyle = pal.brass.left;
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeStyle = pal.brass.top;
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);

        // Four corner rivets on the brass plaque
        ctx.fillStyle = pal.plinthDark.right;
        const rv = Math.max(1.5, r * 0.01);
        ctx.fillRect(px + 3, py + 3, rv, rv);
        ctx.fillRect(px + pw - 3 - rv, py + 3, rv, rv);
        ctx.fillRect(px + 3, py + ph - 3 - rv, rv, rv);
        ctx.fillRect(px + pw - 3 - rv, py + ph - 3 - rv, rv, rv);

        const labelSz = Math.max(7, Math.round(ph * 0.33));
        drawLabel(ctx, 'NORTH POLE · REC ROOM', cx, py + ph * 0.52, pal.plinthDark.right, labelSz, 'center');

        // Blinking beat indicator LEDs flanking the plaque
        const beatOn = (Math.floor(cycle * 4) & 1) === 0;
        ctx.fillStyle = beatOn ? pal.red.top : pal.gold.top;
        ctx.fillRect(px - r * 0.06, py + ph * 0.38, r * 0.025, ph * 0.24);
        ctx.fillStyle = beatOn ? pal.gold.top : pal.red.top;
        ctx.fillRect(px + pw + r * 0.035, py + ph * 0.38, r * 0.025, ph * 0.24);
    }

    /** Thick glass sphere shading, outer rim, primary top-left crescent shine and bottom-right reflection. */
    private drawGlass(ctx: CanvasRenderingContext2D): void {
        const {cx, cy, r, pal} = this;
        const g = ctx.createRadialGradient(cx - r * 0.15, cy - r * 0.15, r * 0.55, cx, cy, r);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.82, 'rgba(0,0,0,0)');
        g.addColorStop(1, pal.glassEdge);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, TAU);
        ctx.fill();

        // Outer glass rim stroke
        ctx.strokeStyle = pal.glassRim;
        ctx.lineWidth = Math.max(1.5, r * 0.014);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, TAU);
        ctx.stroke();

        // Primary upper-left specular reflection arc
        ctx.strokeStyle = pal.shine;
        ctx.lineWidth = Math.max(2.5, r * 0.032);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.89, Math.PI * 1.07, Math.PI * 1.39);
        ctx.stroke();
        // Secondary specular dot
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.89, Math.PI * 1.44, Math.PI * 1.465);
        ctx.stroke();

        // Subtle lower-right counter-reflection arc
        ctx.lineWidth = Math.max(1.5, r * 0.016);
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.91, Math.PI * 0.12, Math.PI * 0.30);
        ctx.stroke();
        ctx.lineCap = 'butt';
    }

    /** Technical ops-room brackets and status telemetry beneath the snowglobe. */
    private drawViewportHud(ctx: CanvasRenderingContext2D): void {
        const {cx, cy, r, cink} = this;
        const {small} = this.lay;
        // Framing brackets around the snowglobe viewport
        const bw = r * 2.28, bh = r * 2.36;
        brackets(ctx, cx - bw * 0.5, cy - r * 1.08, bw, bh, small * 1.4, cink.frame);

        // Two-line ops telemetry strip beneath the plinth
        const y = cy + r * 1.28 + small * 0.9;
        const sweepDeg = Math.round(((Math.sin(this.sweep) * 0.68) / TAU) * 360 + 180) % 360;
        const rpm = Math.round(18 + this.swirl * 95);
        drawLabel(
            ctx,
            `DOME Ø 420 MM · RIG 12W RGB · SWEEP ${pad(sweepDeg, 3)}° · VORTEX ${pad(rpm, 3)} RPM`,
            cx,
            y,
            cink.labelDim,
            small,
            'center',
        );
    }

    /** The readout strip under the picture. */
    private drawCells(ctx: CanvasRenderingContext2D, cycle: number): void {
        const ink = this.cink;
        const level = this.alert.level;
        const hot = level <= 2;
        const locked = this.field.locked;
        const alertInk = alertColor(ink, level);
        const flashOn = (Math.floor(cycle * 8) & 1) === 0;
        const value = hot && flashOn ? alertInk : ink.value;

        let litCount = 0;
        for (let n = 0; n < this.tiles.length; n++) {
            if (this.tiles[n] > 0.08) litCount++;
        }
        const rpm = Math.round(18 + this.swirl * 95);
        const firing = this.strobe > 0.12;
        const strobeState = firing ? 'FIRING' : level === 1 ? 'ARMED' : 'STANDBY';

        drawStrip(ctx, this.lay, ink, [
            {label: 'DANCERS', value: `${DANCERS.length}+DJ`, color: value},
            {label: 'TILES', value: `${pad(litCount, 2)}/${GRID * GRID}`, color: value},
            {label: 'LASERS', value: pad(this.beams.length, 2), color: value},
            {label: 'VORTEX', value: locked ? `${rpm} RPM` : 'SETTLED', color: locked ? value : ink.labelDim},
            {label: 'TURB', meter: clamp01(this.swirl * 0.55 + this.shake * 0.6), color: alertColor(ink, level, 0.85)},
            {label: 'STROBE', value: strobeState, color: firing ? alertInk : value},
        ]);
    }
}

function bakePalette(theme: Theme): Palette {
    const neon = rgbOf(theme.neon, [71, 246, 255]);
    const sec = rgbOf(theme.neonSecondary, [61, 220, 132]);
    const act = rgbOf(theme.active, [255, 209, 102]);
    const violet = rgbOf(theme.violet, [27, 67, 50]);
    const red = rgbOf(theme.red, [230, 57, 70]);
    const bg = theme.bgRgb;
    const text = theme.textRgb;
    const shade = (rgb: readonly [number, number, number]): Shade => ({
        top: lerpRgb(rgb, WHITE, 0.16),
        left: lerpRgb(rgb, bg, 0.28),
        right: lerpRgb(rgb, bg, 0.55),
    });
    const greenRgb: [number, number, number] = [46, 158, 92];
    const woodRgb: [number, number, number] = [138, 82, 46];
    const brassRgb = mixRgb(act, [215, 165, 60], 0.45);
    const snowRgb = mixRgb(text, WHITE, 0.65);
    const iceRgb: [number, number, number] = [110, 220, 245];

    const poolColors = [neon, sec, act, red, ...theme.accentPool];

    return {
        line: lerpRgb(bg, [0, 0, 0], 0.65),
        glassTop: lerpRgb(bg, violet, 0.18),
        glassBot: lerpRgb(bg, violet, 0.34),
        glassEdge: rampAt(alphaRamp(mixRgb(neon, iceRgb, 0.5)), 0.22),
        glassRim: rampAt(alphaRamp(WHITE), 0.42),
        shine: rampAt(alphaRamp(WHITE), 0.38),
        snowBedTop: lerpRgb(snowRgb, bg, 0.22),
        snowBedMid: lerpRgb(snowRgb, bg, 0.38),
        snowBedDeep: lerpRgb(snowRgb, bg, 0.55),
        plinthWood: shade(woodRgb),
        plinthDark: shade(mixRgb(woodRgb, bg, 0.5)),
        brass: shade(brassRgb),
        stageBase: shade(mixRgb(bg, text, 0.16)),
        tile: shade(mixRgb(bg, text, 0.14)),
        tileAlt: shade(mixRgb(bg, text, 0.22)),
        tileLit: poolColors.map((c) => lerpRgb(c, WHITE, 0.08)),
        hats: [
            shade(red),
            shade(sec),
            shade(act),
            shade(iceRgb),
            shade(neon),
        ],
        tree: shade(mixRgb(greenRgb, sec, 0.25)),
        treeLight: shade(mixRgb(greenRgb, act, 0.22)),
        tunic: shade(mixRgb(greenRgb, sec, 0.35)),
        red: shade(red),
        gold: shade(act),
        snowShade: shade(snowRgb),
        skin: shade([242, 198, 162]),
        wood: shade(woodRgb),
        yetiShade: shade([135, 205, 238]),
        iceShade: shade(iceRgb),
        darkMetal: shade(mixRgb(bg, text, 0.26)),
        flakeBack: rampAt(alphaRamp(snowRgb), 0.45),
        flakeFront: lerpRgb(snowRgb, WHITE, 0.5),
        spot: alphaRamp(mixRgb(act, WHITE, 0.35)),
        spotAlt: alphaRamp(mixRgb(sec, WHITE, 0.35)),
        strobe: lerpRgb(red, WHITE, 0.75),
    };
}

export const snowglobeDef: VizModeDef = {
    id: 'snowglobe',
    name: 'REC ROOM',
    create: () => new SnowglobeMode(),
};
