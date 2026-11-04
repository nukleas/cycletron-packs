/**
 * CHRISTMAS HOUSE — a NES house on a snowy night, forked from the Halloween
 * pack's HAUNTED HOUSE. Each floor is a register and pitch picks the window
 * (the tower takes notes from C6 up); a note lights its window warm gold
 * with a face in the glass in the track's colour: an elf, a snowman, a
 * reindeer, a gingerbread man, a penguin, a nutcracker or Mrs Claus. Kicks
 * open the door and spill its light on the snow, toms half-open it. Hats
 * light the lanterns on the steps and the bulbs on the firs, and step the
 * lights along the gable. Snares send up a firework in the track's colour,
 * a crash a bigger one with two rings, flashes the sky and puts Santa's face
 * in the attic for a bar. Held notes leave the chimney as smoke, other
 * percussion kicks the reindeer weathervane, and the snowman by the steps
 * nods on the beat. Snow falls in front of everything.
 *
 * Painted into a 320×180 buffer. The door, lanterns and bursts advance in
 * update(); the static house is baked once per palette.
 */

import type {VizMode, VizModeDef, VizServices} from '@cycletron/viz-sdk';
import {type FieldHap, type FieldTeam, type Rgb, HapField} from '@cycletron/viz-sdk';
import {clamp01, follow, hash32, rand01} from '@cycletron/viz-sdk';
import {drawSprite, frameRect, nearest, PW, PxScreen} from '@cycletron/viz-sdk';
import {roleOf} from '../../lib/roles.js';
import {drawSanta, drawWindowFace, windowFace} from './faces.js';
import {HOUSE, bakeShell, drawFirs, drawLights} from './house.js';
import {bakeLook, type Look} from './look.js';
import {type Burst, drawBurst, drawNight, drawPuff, drawSnowfall, dropBursts, makeBurst, skyFlash} from './sky.js';
import {slotFor} from './slots.js';
import {BAG_DARK, BAG_LIT, VANE_DEER} from './sprites.js';
import {type Role, isLong, registerPos} from '@naderlabs/pixel-kit/roles';

const LOOKAHEAD = 2;
const MAX_HAPS = 400;
const MAX_PER_TRACK = 64;
const DRUM_CAP = 16;
const IDLE_RATE = 0.25;
const EARLY = 0.05;
const MAX_BURSTS = 4;
const MAX_PUFFS = 12;
const LANTERNS = 5;
const TOWER_NOTE = 84;

interface Team extends FieldTeam {}

interface Light extends FieldHap<Team> {
    role: Role;
    long: boolean;
    win: number;
    flash: number;
}

const taken = new Uint8Array(12);
const DIRS: readonly (readonly [number, number])[] = [
    [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];

class ChristmasHouseMode implements VizMode {
    private readonly screen = new PxScreen();
    private readonly field = new HapField<Team, Light>({
        lookahead: LOOKAHEAD,
        maxHaps: MAX_HAPS,
        maxPerTrack: MAX_PER_TRACK,
        idleRate: IDLE_RATE,
        team: (base) => base,
        hap: (base) => this.makeLight(base),
        cap: (_team, note) => (Number.isFinite(note) ? Infinity : DRUM_CAP),
        keep: (h, cycle) => h.end + (h.long ? 1 : 0.1) >= cycle,
    });
    private readonly bursts: Burst[] = [];
    private readonly lanterns = new Float32Array(LANTERNS);
    private readonly lit = new Float32Array(HOUSE.windows.length);
    private readonly litBy: (Light | null)[] = HOUSE.windows.map(() => null);
    private readonly colors = new Map<number, string>();
    private door = 0;
    private doorHold = 0;
    private doorAmp = 1;
    private vaneKick = 0;
    private thump = 0;
    /** Steps the roof lights one place per hat. */
    private chase = 0;
    private santaUntil = 0;
    private santaRgb: Rgb = [255, 46, 77];
    private look!: Look;
    private shell!: HTMLCanvasElement;

    layout(s: VizServices): void {
        this.look = bakeLook(s.theme);
        this.shell = bakeShell(this.look);
        this.colors.clear();
        this.field.invalidate();
    }

    private makeLight(base: FieldHap<Team>): Light {
        const role = roleOf(base.team.name, base.note);
        const long = isLong(base.begin, base.end);
        let win = -1;
        if (role === 'bass' || role === 'mid' || role === 'lead') {
            const group = base.note >= TOWER_NOTE ? HOUSE.groups.tower : HOUSE.groups[role];
            const pos = base.note >= TOWER_NOTE ? clamp01((base.note - TOWER_NOTE) / 12) : registerPos(base.note);
            const want = Math.round(pos * (group.length - 1));
            const slots = taken.subarray(0, group.length);
            slots.fill(0);
            const lo = base.begin - EARLY;
            const hi = base.end + (long ? 1 : 0.1);
            for (const h of this.field.haps) {
                const at = h.win < 0 ? -1 : group.indexOf(h.win);
                if (at < 0) continue;
                if (h.begin - EARLY < hi && h.end + (h.long ? 1 : 0.1) > lo) slots[at] = 1;
            }
            const slot = slotFor(want, base.seed, slots);
            win = group[slot < 0 ? want : slot];
        }
        return {...base, role, long, win, flash: 0};
    }

    update(dt: number, s: VizServices): void {
        const field = this.field;
        field.update(dt, s);
        if (field.restarted) {
            this.bursts.length = 0;
            this.doorHold = 0;
            this.thump = 0;
            this.chase = 0;
            this.santaUntil = 0;
        }
        const cycle = field.cycle;
        for (const h of field.haps) {
            h.flash *= Math.exp(-dt * 4);
            if (!field.crossed(h)) continue;
            h.done = true;
            h.flash = 1;
            h.team.activity = 1;
            switch (h.role) {
                case 'kick': this.doorHold = 0.15; this.doorAmp = 1; this.thump = 1; break;
                case 'tom':
                    if (this.doorHold <= 0) { this.doorHold = 0.15; this.doorAmp = 0.5; }
                    break;
                case 'hat':
                    this.lanterns[h.seed % LANTERNS] = 1;
                    this.chase = (this.chase + 1) % 3;
                    break;
                case 'snare': this.launch(h, cycle, 1); break;
                case 'crash':
                    this.launch(h, cycle, 2);
                    this.santaUntil = cycle + 1;
                    this.santaRgb = [h.team.rgb[0], h.team.rgb[1], h.team.rgb[2]];
                    break;
                case 'perc': this.vaneKick = 1; break;
                default: break;
            }
        }
        this.door = follow(this.door, this.doorHold > 0 ? this.doorAmp : 0, dt, 18, 4);
        this.doorHold -= dt;
        const k = Math.exp(-dt * 7);
        for (let i = 0; i < LANTERNS; i++) this.lanterns[i] *= k;
        this.vaneKick *= Math.exp(-dt * 5);
        this.thump *= Math.exp(-dt * 9);
        dropBursts(this.bursts, cycle);
    }

    /** A firework over the house, x hashed in the old bolt range. */
    private launch(h: Light, cycle: number, rings: number): void {
        if (this.bursts.length >= MAX_BURSTS) return;
        const x = 64 + Math.round(rand01(hash32(h.seed, 9)) * 180);
        this.bursts.push(makeBurst(h.seed, x, cycle, [h.team.rgb[0], h.team.rgb[1], h.team.rgb[2]], rings));
    }

    render(ctx: CanvasRenderingContext2D, s: VizServices): void {
        const p = this.screen.ctx;
        const look = this.look;
        const ink = look.ink;
        const cycle = this.field.cycle;
        const flash = skyFlash(this.bursts, cycle);
        const hop = this.thump > 0.5 ? 1 : 0;
        p.setTransform(1, 0, 0, 1, 0, hop);
        p.imageSmoothingEnabled = false;
        drawNight(p, look, cycle, flash, 22, 16);
        for (const b of this.bursts) drawBurst(p, b, cycle, this.colorOf(b.rgb), ink.gold, ink.goldDark);
        p.drawImage(this.shell, 0, 0);
        let glow = 0;
        for (let i = 0; i < LANTERNS; i++) glow = Math.max(glow, this.lanterns[i]);
        drawFirs(p, look, glow);
        drawLights(p, look, this.chase);
        this.gather(cycle);
        this.drawWindows(p, cycle);
        this.drawDoor(p);
        this.drawLanterns(p);
        this.drawSnowman(p, cycle);
        this.drawSmoke(p, cycle);
        this.drawVane(p, cycle);
        p.setTransform(1, 0, 0, 1, 0, 0);
        drawSnowfall(p, cycle, ink.snow, ink.snowDim);
        if (hop) {
            p.fillStyle = look.skyDeep;
            p.fillRect(0, 0, PW, 1);
        }
        this.screen.blit(ctx, s.width, s.height, ink.bg);
    }

    private gather(cycle: number): void {
        this.lit.fill(0);
        this.litBy.fill(null);
        for (const h of this.field.haps) {
            if (h.win < 0 || cycle < h.begin - EARLY) continue;
            const sustaining = cycle >= h.begin && cycle < h.end;
            const early = cycle < h.begin ? 0.3 : 0;
            const lit = Math.max(h.flash, sustaining ? 0.7 : 0, early) * h.fade;
            if (lit > this.lit[h.win]) {
                this.lit[h.win] = lit;
                this.litBy[h.win] = h;
            }
        }
    }

    private drawWindows(ctx: CanvasRenderingContext2D, cycle: number): void {
        const ink = this.look.ink;
        const santa = cycle < this.santaUntil;
        const santaFrame = Math.floor(cycle * 4) % 3;
        const santaEyes = this.colorOf(this.santaRgb);
        const idle = this.field.locked ? -1 : hash32(Math.floor(cycle * 0.5), 3) % HOUSE.windows.length;
        for (let i = 0; i < HOUSE.windows.length; i++) {
            const w = HOUSE.windows[i];
            const attic = w.y <= 58;
            ctx.fillStyle = ink.night;
            ctx.fillRect(w.x, w.y, w.w, w.h);
            if (santa && attic) {
                drawSanta(ctx, w.x + 1, w.y + 1, w.w - 2, w.h - 2, santaFrame, santaEyes, ink);
            } else {
                let lit = this.lit[i];
                const by = this.litBy[i];
                if (i === idle) lit = Math.max(lit, 0.4);
                if (lit > 0.08) {
                    // Warm light: full gold while the note sounds, dim before and after.
                    ctx.fillStyle = lit > 0.5 ? ink.gold : ink.goldDark;
                    ctx.fillRect(w.x + 1, w.y + 1, w.w - 2, w.h - 2);
                }
                ctx.fillStyle = ink.brickDark;
                ctx.fillRect(w.x + (w.w >> 1), w.y, 1, w.h);
                ctx.fillRect(w.x, w.y + (w.h >> 1), w.w, 1);
                if (by && lit > 0.5 && !by.long) {
                    const frame = (Math.floor(cycle * 4) + (by.seed % 3)) % 3;
                    drawWindowFace(
                        ctx, windowFace(by.seed, by.role),
                        w.x + 1, w.y + 1, w.w - 2, w.h - 2,
                        frame, this.colorOf(by.team.rgb), ink,
                    );
                }
            }
            frameRect(ctx, w.x, w.y, w.w, w.h, ink.stone);
            ctx.fillStyle = ink.snow;
            ctx.fillRect(w.x - 1, w.y + w.h, w.w + 2, 1);
        }
    }

    private drawDoor(ctx: CanvasRenderingContext2D): void {
        const {x, y, w, h} = HOUSE.door;
        const ink = this.look.ink;
        const gap = Math.round(w * this.door);
        ctx.fillStyle = ink.gold;
        ctx.fillRect(x, y, w, h);
        const slab = w - gap;
        if (slab > 0) {
            ctx.fillStyle = ink.redDark;
            ctx.fillRect(x, y, slab, h);
            if (slab > 5) {
                ctx.fillStyle = ink.gold;
                ctx.fillRect(x + slab - 4, y + (h >> 1), 2, 2);
            }
        }
        if (slab >= w - 2) {
            // The wreath on the closed door: a green ring with a red bow.
            const cx = x + (slab >> 1) - 1, cy = y + 7;
            ctx.fillStyle = ink.green;
            ctx.fillRect(cx - 2, cy - 3, 6, 1);
            ctx.fillRect(cx - 2, cy + 3, 6, 1);
            ctx.fillRect(cx - 3, cy - 2, 1, 5);
            ctx.fillRect(cx + 4, cy - 2, 1, 5);
            ctx.fillStyle = ink.red;
            ctx.fillRect(cx - 1, cy + 3, 4, 2);
            ctx.fillRect(cx, cy + 5, 1, 1);
            ctx.fillRect(cx + 2, cy + 5, 1, 1);
        }
        frameRect(ctx, x, y, w, h, ink.line);
        if (this.door > 0.2) {
            // The spill on the snow: gold by the door, darker further out.
            const spill = 16 + gap * 2;
            const cx = x + (w >> 1);
            ctx.fillStyle = ink.goldDark;
            ctx.fillRect(cx - (spill >> 1) - 6, HOUSE.yard + 3, spill + 12, 4);
            ctx.fillStyle = ink.gold;
            ctx.fillRect(cx - (spill >> 1), HOUSE.yard, spill, 4);
        }
    }

    private drawLanterns(ctx: CanvasRenderingContext2D): void {
        const ink = this.look.ink;
        for (let i = 0; i < HOUSE.lanterns.length; i++) {
            const spot = HOUSE.lanterns[i];
            const lit = this.lanterns[i] > 0.25;
            drawSprite(ctx, lit ? BAG_LIT : BAG_DARK, spot.x, spot.y, [
                null, lit ? ink.gold : ink.snowDim, ink.stoneDark, ink.flameHot,
            ], {outline: ink.line});
        }
    }

    /** Three discs, coal, a carrot and a hat; the head nods on the beat. */
    private drawSnowman(ctx: CanvasRenderingContext2D, cycle: number): void {
        const ink = this.look.ink;
        const {x, y} = HOUSE.snowman;
        const nod = this.field.locked && (Math.floor(cycle * 4) & 1) === 0 ? 1 : 0;
        ctx.fillStyle = ink.snowDim;
        ctx.fillRect(x - 5, y - 1, 11, 1);
        ctx.fillStyle = ink.snow;
        ctx.fillRect(x - 4, y - 8, 9, 7);
        ctx.fillRect(x - 5, y - 6, 11, 4);
        ctx.fillRect(x - 3, y - 14, 7, 6);
        ctx.fillRect(x - 2 + nod, y - 19, 5, 5);
        ctx.fillStyle = ink.line;
        ctx.fillRect(x, y - 12, 1, 1);
        ctx.fillRect(x, y - 10, 1, 1);
        ctx.fillRect(x - 1 + nod, y - 18, 1, 1);
        ctx.fillRect(x + 1 + nod, y - 18, 1, 1);
        ctx.fillRect(x - 3 + nod, y - 20, 7, 1);
        ctx.fillRect(x - 2 + nod, y - 24, 5, 4);
        ctx.fillStyle = ink.red;
        ctx.fillRect(x - 2 + nod, y - 21, 5, 1);
        ctx.fillStyle = ink.flame;
        ctx.fillRect(x + 1 + nod, y - 17, 2, 1);
        ctx.fillStyle = ink.brown;
        ctx.fillRect(x - 7, y - 12, 3, 1);
        ctx.fillRect(x + 5, y - 13, 3, 1);
    }

    /** Held notes leave as smoke on the old ghosts' path. */
    private drawSmoke(ctx: CanvasRenderingContext2D, cycle: number): void {
        const ink = this.look.ink;
        const {chimney} = HOUSE;
        let n = 0;
        for (const h of this.field.haps) {
            if (!h.long || h.win < 0 || cycle < h.begin) continue;
            if (n++ >= MAX_PUFFS) break;
            const t = cycle - h.begin;
            const dur = h.end - h.begin;
            const k = clamp01(t / 0.2) * clamp01(1 - t / (dur + 1)) * h.fade;
            if (k < 0.08) continue;
            const sway = (Math.floor(cycle * 3 + h.seed) & 1) ? 1 : -1;
            const color = k < 0.35 ? ink.snowDim : this.colorOf(h.team.rgb);
            drawPuff(ctx, chimney.x + 4 + sway - t * 16, chimney.y - 4 - t * 18, k < 0.35 || t < 0.15 ? 1 : 2, color);
        }
    }

    /** Eight headings. A full turn across the first quarter of the bar. */
    private drawVane(ctx: CanvasRenderingContext2D, cycle: number): void {
        const ink = this.look.ink;
        const {x, y} = HOUSE.vane;
        const bar = Math.floor(cycle);
        const turn = smoother(Math.min(1, (cycle - bar) / 0.25));
        let d = Math.floor(turn * 8) % 8;
        if (this.vaneKick > 0.45) d = (d + 1) & 7;
        const [dx, dy] = DIRS[d];
        ctx.fillStyle = ink.stone;
        ctx.fillRect(x, y, 2, 10);
        const ax = x;
        const ay = y - 6;
        for (let i = 1; i <= 5; i++) ctx.fillRect(ax + dx * i, ay + dy * i, 1, 1);
        const tx = ax + dx * 5, ty = ay + dy * 5;
        drawSprite(ctx, VANE_DEER, tx - 3, ty - 3, [null, ink.sil], {flip: dx < 0});
    }

    private colorOf(rgb: readonly [number, number, number]): string {
        return nearest(rgb, this.look.ink.pool, this.colors);
    }
}

function smoother(t: number): number {
    const x = clamp01(t);
    return x * x * x * (x * (x * 6 - 15) + 10);
}

export const christmasHouseDef: VizModeDef = {
    id: 'christmas-house',
    name: 'CHRISTMAS HOUSE',
    create: () => new ChristmasHouseMode(),
};
