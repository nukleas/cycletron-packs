/**
 * GHOST IN THE MACHINE — an imagined machine self-portrait, performed by haps.
 * Incoming notes dock on onset; held voices deform the face and released voices
 * leave it. Drum hits articulate the geometry. Audio adds scope/spectrum detail.
 * Everything is sampled at the current cycle, with no frame-history trails.
 */
import {type FieldHap, type FieldTeam, HapField, mixRgb, rgbOf,
    type VizMode, type VizModeDef, type VizServices} from '@cycletron/viz-sdk';
import {css, greenest} from '@naderlabs/kit/color';
import {held, strike} from '@naderlabs/kit/timing';
import {halloweenRole} from '../../lib/roles.js';
import type {Role} from '@naderlabs/kit/roles';
import {FLIGHT, RELEASE, flightAt, poseAt, type Pose} from './motion.js';
import {makeTraces, tracePoint, type Point} from './circuit.js';

const W = 640;
const H = 360;
const TAU = Math.PI * 2;
interface Signal extends FieldHap<FieldTeam> { role: Role; address: number }
interface Port { x: number; y: number; level: number; color: string }
const MASK: readonly Point[] = [[320, 42], [365, 48], [394, 77], [405, 118], [398, 169],
    [382, 192], [373, 239], [349, 274], [320, 288], [289, 274],
    [267, 239], [258, 192], [242, 169], [235, 118], [247, 77], [276, 48]];

function path(p: CanvasRenderingContext2D, points: readonly Point[], close = false): void {
    p.beginPath();
    p.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) p.lineTo(points[i][0], points[i][1]);
    if (close) p.closePath();
}

function ports(): Port[] {
    return Array.from({length: 36}, (_, address) => {
        const register = Math.floor(address / 12);
        const pitch = address % 12;
        const side = pitch < 6 ? -1 : 1;
        const index = pitch % 6;
        return {
            x: 320 + side * (register === 0 ? 15 + index * 6 : register === 1 ? 44 + index * 6 : 14 + index * 10),
            y: register === 0 ? 257 - index * 3 : register === 1 ? 196 - index * 4 : 62 + index * 7,
            level: 0, color: '',
        };
    });
}

class GhostMachineMode implements VizMode {
    private readonly field = new HapField<FieldTeam, Signal>({
        lookahead: 2, maxHaps: 384, maxPerTrack: 64, idleRate: 0,
        team: (base) => base,
        hap: (base) => {
            const role = halloweenRole(base.team.name, base.note);
            const register = role === 'bass' ? 0 : role === 'mid' ? 1 : 2;
            return {...base, role, address: register * 12 + ((Math.round(base.note) % 12) + 12) % 12};
        },
        keep: (h, cycle) => h.end + FLIGHT >= cycle,
    });
    private readonly ports = ports();
    private readonly traces = makeTraces();
    private readonly wave = new Float32Array(64);
    private readonly spectrum = new Float32Array(24);
    private pose: Pose = poseAt([], 0);
    private bg = '';
    private dark = '';
    private dim = '';
    private green = '';
    private bright = '';
    private violet = '';
    private warning = '';
    private cycle = 0;
    private energy = 0;

    layout(s: VizServices): void {
        const t = s.theme;
        const phosphor = greenest(t.accentPool, rgbOf(t.neon, [124, 255, 63]));
        this.bg = t.bg;
        this.dark = css(mixRgb(t.bgRgb, phosphor, 0.035));
        this.dim = css(mixRgb(t.bgRgb, phosphor, 0.28));
        this.green = css(phosphor);
        this.bright = css(mixRgb(phosphor, [255, 255, 255], 0.72));
        this.violet = t.neonSecondary;
        this.warning = t.neon;
        this.field.invalidate();
    }

    update(dt: number, s: VizServices): void {
        this.field.update(dt, s);
        this.cycle = this.field.locked ? this.field.cycle : 0;
        this.pose = poseAt(this.field.locked ? this.field.haps : [], this.cycle);
        for (const port of this.ports) { port.level = 0; port.color = this.green; }
        this.wave.fill(0);
        this.spectrum.fill(0);
        this.energy = 0;
        if (!this.field.locked) return;
        this.energy = Math.min(1, Math.max(0, (s.low + s.mid + s.high) / 3));
        const wave = s.timeData;
        if (wave?.length) {
            for (let i = 0; i < this.wave.length; i++) {
                this.wave[i] = Math.max(-1, Math.min(1, wave[Math.floor(i * wave.length / this.wave.length)] * 3));
            }
        }
        const freq = s.freqData;
        if (freq?.length) {
            // Log bands: broad low-frequency detail without spending most bins on hiss.
            for (let i = 0; i < this.spectrum.length; i++) {
                const lo = Math.floor(freq.length ** (i / this.spectrum.length)) - 1;
                const hi = Math.min(freq.length, Math.ceil(freq.length ** ((i + 1) / this.spectrum.length)));
                let sum = 0;
                for (let b = lo; b < hi; b++) sum += freq[b] / 255;
                this.spectrum[i] = sum / (hi - lo);
            }
        }
        for (const h of this.field.haps) {
            if (!h.seen || !Number.isFinite(h.note)) continue;
            const level = Math.max(strike(this.cycle, h.begin), held(this.cycle, h.begin, h.end, RELEASE) * 0.65);
            const port = this.ports[h.address];
            if (level > port.level) { port.level = level; port.color = h.team.css; }
        }
    }

    /** Lift the flat facial landmarks into a curved, articulated vector surface. */
    private project(x: number, y: number, extraZ = 0): Point {
        const pose = this.pose;
        let px = x - 320;
        let py = y - 165;
        const cheek = Math.max(0, 1 - Math.abs(y - 174) / 75);
        px += Math.sign(px) * cheek * pose.split * 25;
        // The lower jaw hinges down and forward; the forehead retracts before kicks.
        const jaw = Math.max(0, Math.min(1, (y - 211) / 65));
        py += jaw * (pose.jaw * 23 + pose.kick * 9);
        py += pose.ready * 4 - pose.kick * 7;
        py -= Math.max(0, (130 - y) / 88) * pose.crown * 9;
        const z = Math.sqrt(Math.max(0, 1 - ((x - 320) / 95) ** 2)) * 38
            + Math.max(0, 1 - Math.abs(y - 185) / 40) * 13 + extraZ;
        const yaw = pose.yaw + Math.sin(this.cycle * TAU) * pose.chord * 0.09;
        const rx = px * Math.cos(yaw) + z * Math.sin(yaw);
        const rz = z * Math.cos(yaw) - px * Math.sin(yaw);
        const perspective = 440 / (440 - rz);
        const roll = Math.sin(this.cycle * Math.PI) * pose.split * 0.065;
        return [320 + (rx * Math.cos(roll) - py * Math.sin(roll)) * perspective,
            168 + (py * Math.cos(roll) + rx * Math.sin(roll)) * perspective * 0.94];
    }

    private facePath(p: CanvasRenderingContext2D, points: readonly Point[], close = false, z = 0): void {
        path(p, points.map(([x, y]) => this.project(x, y, z)), close);
    }

    render(ctx: CanvasRenderingContext2D, s: VizServices): void {
        ctx.save();
        ctx.fillStyle = this.bg;
        ctx.fillRect(0, 0, s.width, s.height);
        const scale = Math.min(s.width / W, s.height / H);
        ctx.translate((s.width - W * scale) / 2, (s.height - H * scale) / 2);
        ctx.scale(scale, scale);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        this.drawChassis(ctx);
        ctx.save();
        ctx.beginPath();
        ctx.rect(25, 36, 590, 288);
        ctx.clip();
        this.drawHalo(ctx);
        this.drawFlights(ctx, false);
        this.drawMask(ctx);
        this.drawFeatures(ctx);
        this.drawPorts(ctx);
        this.drawFlights(ctx, true);
        ctx.restore();
        this.drawReadout(ctx);
        ctx.restore();
    }

    private drawChassis(p: CanvasRenderingContext2D): void {
        // Two copper layers cover the board, leaving the central processor readable.
        p.lineWidth = 0.75;
        for (let i = 0; i < this.traces.length; i++) {
            const trace = this.traces[i];
            const port = this.ports[i];
            p.strokeStyle = port.level > 0.01 ? port.color : i % 3 === 0 ? this.violet : this.green;
            p.globalAlpha = port.level > 0.01 ? 0.23 + port.level * 0.32 : 0.2;
            path(p, trace.points);
            p.stroke();
            for (const point of [trace.points[1], trace.points[trace.points.length - 1]]) {
                p.beginPath();
                p.arc(point[0], point[1], 2, 0, TAU);
                p.stroke();
            }
        }
        // Edge buses turn through 45-degree elbows into the crown and spinal socket.
        for (const side of [-1, 1]) {
            const mirror = (x: number) => side < 0 ? x : W - x;
            for (let i = 0; i < 10; i++) {
                const x = 160 + i * 10;
                p.strokeStyle = i % 3 === 0 ? this.violet : this.green;
                p.globalAlpha = 0.15 + (i % 3) * 0.035;
                for (const top of [true, false]) {
                    const y = top ? 0 : H;
                    const sign = top ? 1 : -1;
                    const endY = top ? 60 + i * 3 : 294 - i * 2;
                    path(p, [[mirror(x - 55), y], [mirror(x - 55), y + sign * (28 + i * 3)],
                        [mirror(x), y + sign * (83 + i * 3)], [mirror(x), endY]]);
                    p.stroke();
                    p.beginPath();
                    p.arc(mirror(x), endY, 1.8, 0, TAU);
                    p.stroke();
                }
            }
            // Small interconnects and memory dies occupy the spaces between buses.
            for (let bank = 0; bank < 3; bank++) {
                const x = mirror(96);
                const y = 76 + bank * 86;
                const register = 2 - bank;
                let activity = 0;
                for (let n = 0; n < 6; n++) activity = Math.max(activity, this.ports[register * 12 + (side < 0 ? 0 : 6) + n].level);
                p.globalAlpha = 1;
                p.fillStyle = this.bg;
                p.fillRect(x - 22, y - 23, 44, 44);
                p.strokeStyle = activity > 0.1 ? this.green : this.dim;
                p.lineWidth = 0.8;
                p.strokeRect(x - 22, y - 23, 44, 44);
                p.globalAlpha = 0.5;
                p.strokeRect(x - 17, y - 18, 34, 34);
                for (let pin = 0; pin < 6; pin++) {
                    const py = y - 15 + pin * 6;
                    path(p, [[x - 27, py], [x - 22, py]]); p.stroke();
                    path(p, [[x + 22, py], [x + 27, py]]); p.stroke();
                }
                p.fillStyle = this.green;
                for (let bit = 0; bit < 12; bit++) {
                    const level = this.spectrum[(bank * 8 + bit) % this.spectrum.length];
                    p.globalAlpha = 0.16 + level * 0.55 + activity * (bit % 3 === 0 ? 0.25 : 0);
                    p.fillRect(x - 12 + bit % 4 * 7, y - 11 + Math.floor(bit / 4) * 7, 3, 3);
                }
                p.globalAlpha = 0.45;
                p.font = '6px monospace';
                p.fillText(['CTX', 'MEM', 'IO'][bank], x - 8, y + 33);
                // Parallel return paths around each chip.
                for (let row = 0; row < 3; row++) {
                    const yy = y + 31 + row * 6;
                    p.strokeStyle = row === 1 ? this.violet : this.dim;
                    path(p, [[mirror(0), yy], [mirror(46), yy], [mirror(58), yy + 12],
                        [mirror(124 + row * 7), yy + 12], [mirror(137 + row * 7), yy - 1]]);
                    p.stroke();
                }
            }
        }
        p.globalAlpha = 1;
        // Opaque nameplate strips keep the edge-to-edge PCB out of the typography.
        p.fillStyle = this.bg;
        p.fillRect(19, 10, 240, 18);
        p.fillRect(421, 10, 200, 18);
        p.fillRect(19, 331, 212, 19);
        p.fillRect(440, 331, 181, 19);
    }

    private drawHalo(p: CanvasRenderingContext2D): void {
        // A broken armillary cage; chords unfold it and hats advance its contacts.
        const spread = 1 + this.pose.chord * 0.16;
        for (let ring = 0; ring < 3; ring++) {
            p.strokeStyle = ring === 1 ? this.violet : this.dim;
            p.globalAlpha = ring === 1 ? 0.45 : 0.8;
            p.lineWidth = 0.7;
            const angle = (ring - 1) * 0.5 + Math.sin(this.cycle * Math.PI) * this.pose.chord * 0.18;
            const points: Point[] = [];
            for (let j = 0; j <= 80; j++) {
                const t = j / 80 * TAU;
                const x = Math.cos(t) * (116 + ring * 9) * spread;
                const y = Math.sin(t) * (135 - ring * 27);
                points.push([320 + x * Math.cos(angle) - y * Math.sin(angle), 171 + y * Math.cos(angle) + x * Math.sin(angle)]);
            }
            path(p, points);
            p.stroke();
        }
        p.globalAlpha = 1;
        if (!this.field.locked) return;
        for (const h of this.field.haps) {
            if (!h.seen) continue;
            const age = this.cycle - h.begin;
            if (age < 0 || age > 0.4) continue;
            if (h.role === 'kick') {
                // A shock ring travels outward after the exact onset frame.
                const t = age / 0.4;
                p.strokeStyle = h.team.css;
                p.globalAlpha = (1 - t) * 0.75;
                p.lineWidth = 1.6 - t;
                p.beginPath();
                p.ellipse(320, 190, 75 + t * 160, 36 + t * 82, 0, 0, TAU);
                p.stroke();
            } else if (h.role === 'hat' || h.role === 'tom' || h.role === 'perc') {
                const angle = (h.begin * 4 % 12) / 12 * TAU - Math.PI / 2;
                const radius = 134 + age * 65;
                const x = 320 + Math.cos(angle) * radius;
                const y = 171 + Math.sin(angle) * radius * 0.83;
                p.strokeStyle = h.team.css;
                p.globalAlpha = 1 - age / 0.4;
                path(p, [[x - 3, y], [x, y - 4], [x + 3, y], [x, y + 4]], true);
                p.stroke();
            }
        }
        p.globalAlpha = 1;
    }

    /** Each note has its own trajectory, so fast runs remain visibly separate. */
    private flightPoint(h: Signal, time: number): Point {
        const port = this.ports[h.address];
        const target = this.project(port.x, port.y, 7);
        const flight = flightAt(time, h.begin, h.end);
        return tracePoint(this.traces[h.address], target, 1 - Math.abs(flight));
    }

    private drawFlights(p: CanvasRenderingContext2D, foreground: boolean): void {
        if (!this.field.locked) return;
        for (const h of this.field.haps) {
            if (!h.seen || !Number.isFinite(h.note)) continue;
            const age = this.cycle - h.begin;
            if (age < -FLIGHT || this.cycle > h.end + FLIGHT) continue;
            const docked = age >= 0 && this.cycle <= h.end;
            if (docked !== foreground) continue;
            p.strokeStyle = h.team.css;
            p.fillStyle = h.team.css;
            if (docked) {
                const port = this.ports[h.address];
                const strikeLevel = strike(this.cycle, h.begin, 1 / 20);
                const center = this.project(port.x, port.y, 8);
                const radius = 4 + strikeLevel * 11;
                p.globalAlpha = 0.5 + strikeLevel * 0.5;
                p.lineWidth = 1;
                p.beginPath();
                p.arc(center[0], center[1], radius, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, (h.end - this.cycle) / Math.max(0.001, h.end - h.begin)));
                p.stroke();
            } else {
                const flight = flightAt(this.cycle, h.begin, h.end);
                p.globalAlpha = Math.min(1, (1 - Math.abs(flight)) * 4);
                const points: Point[] = [];
                // Sample the same path at past times: no accumulating particle state.
                for (let i = 8; i >= 0; i--) points.push(this.flightPoint(h, this.cycle - i * 0.009));
                p.lineWidth = 1.5;
                path(p, points);
                p.stroke();
                const [x, y] = this.flightPoint(h, this.cycle);
                path(p, [[x - 4, y], [x, y - 3], [x + 4, y], [x, y + 3]], true);
                p.fill();
            }
        }
        p.globalAlpha = 1;
    }

    private drawMask(p: CanvasRenderingContext2D): void {
        this.facePath(p, MASK, true);
        p.fillStyle = this.dark;
        p.fill();
        p.strokeStyle = this.green;
        p.globalAlpha = 0.65;
        p.lineWidth = 1;
        p.stroke();
        // Coarse contour mesh reads as a turning volume rather than CRT wallpaper.
        for (let y = 55; y < 282; y += 10) {
            const half = y < 136 ? 74 * Math.sqrt(Math.max(0, 1 - ((y - 123) / 82) ** 2)) : 76 - (y - 136) * 0.31;
            const points: Point[] = [];
            for (let i = 0; i <= 12; i++) {
                const x = 320 - half + half * 2 * i / 12;
                const arch = Math.sin(i / 12 * Math.PI) * 7;
                points.push(this.project(x, y - arch));
            }
            p.globalAlpha = y < 132 ? 0.22 : 0.15;
            p.lineWidth = 0.65;
            path(p, points);
            p.stroke();
        }
        p.globalAlpha = 0.2;
        for (let meridian = -2; meridian <= 2; meridian++) {
            const points: Point[] = [];
            for (let y = 58; y < 278; y += 10) {
                const half = y < 136 ? 68 * Math.sqrt(Math.max(0, 1 - ((y - 123) / 82) ** 2)) : 72 - (y - 136) * 0.31;
                points.push(this.project(320 + meridian / 3 * half, y));
            }
            path(p, points);
            p.stroke();
        }
        p.globalAlpha = 1;
        // Snare-owned cheek plates shear away, revealing the violet inner structure.
        for (const side of [-1, 1]) {
            const plane: Point[] = [[320 + side * 72, 174], [320 + side * 39, 195],
                [320 + side * 35, 217], [320 + side * 58, 200]];
            this.facePath(p, plane, true, this.pose.split * 24);
            p.fillStyle = this.bg;
            p.fill();
            p.strokeStyle = this.pose.split > 0.25 ? this.violet : this.green;
            p.lineWidth = 1.1;
            p.stroke();
        }
    }

    /** A lens is a layered sensor, projected with the rest of the machine. */
    private drawLens(p: CanvasRenderingContext2D, x: number, y: number, radius: number, phase: number): void {
        p.fillStyle = this.bg;
        const outline: Point[] = [];
        for (let i = 0; i < 8; i++) {
            const a = i / 8 * TAU + Math.PI / 8;
            outline.push([x + Math.cos(a) * (radius + 5), y + Math.sin(a) * (radius + 5)]);
        }
        this.facePath(p, outline, true, 12);
        p.fill();
        p.strokeStyle = this.green;
        p.lineWidth = 1;
        p.stroke();
        for (let ring = 0; ring < 3; ring++) {
            const r = radius * (1 - ring * 0.24);
            const points: Point[] = [];
            for (let i = 0; i <= 32; i++) {
                const a = phase * (ring % 2 ? -1 : 1) + i / 32 * TAU * 0.82;
                points.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
            }
            p.strokeStyle = ring === 1 ? this.violet : this.green;
            this.facePath(p, points, false, 14 + ring * 2);
            p.stroke();
        }
        const pupil = 2 + this.pose.chord * 2 - this.pose.hat * 0.7;
        p.fillStyle = this.bright;
        this.facePath(p, [[x - pupil + this.pose.gaze * 3, y], [x + this.pose.gaze * 3, y - pupil],
            [x + pupil + this.pose.gaze * 3, y], [x + this.pose.gaze * 3, y + pupil]], true, 20);
        p.fill();
    }

    private drawFeatures(p: CanvasRenderingContext2D): void {
        const phase = this.cycle * Math.PI * 0.5;
        // Asymmetric perception: one large aperture and a three-sensor cluster.
        this.drawLens(p, 276, 146, 21 + this.pose.chord * 3, phase);
        this.drawLens(p, 357, 132, 11, -phase);
        this.drawLens(p, 376, 153, 8, phase + 2);
        this.drawLens(p, 349, 160, 7, phase + 4);

        // An open geometric kernel replaces a nose: two counter-rotating tetrahedra.
        const radius = 17 + this.pose.kick * 8 + this.pose.chord * 5 - this.pose.ready * 4;
        p.fillStyle = this.bg;
        this.facePath(p, [[292, 167], [320, 156], [348, 176], [343, 207], [320, 220], [297, 204]], true, 12);
        p.fill();
        for (let layer = 0; layer < 2; layer++) {
            const vertices: Point[] = [];
            const angle = phase * (layer ? -1 : 1) + layer * Math.PI;
            for (let i = 0; i < 3; i++) {
                const a = angle + i / 3 * TAU;
                vertices.push(this.project(320 + Math.cos(a) * radius, 188 + Math.sin(a) * radius * 0.6, 20 + Math.sin(a) * radius * 0.7));
            }
            vertices.push(this.project(320, 188 + (layer ? 1 : -1) * radius, 25));
            p.strokeStyle = layer ? this.violet : this.bright;
            p.lineWidth = 0.9;
            for (let i = 0; i < 4; i++) {
                for (let j = i + 1; j < 4; j++) { path(p, [vertices[i], vertices[j]]); p.stroke(); }
            }
        }
        // A cognitive lattice: no single face owns the thought, several nodes do.
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 5; col++) {
                const x = 286 + col * 17;
                const y = 66 + row * 15;
                const port = this.ports[24 + (row * 5 + col) % 12];
                p.strokeStyle = port.level > 0.1 ? port.color : this.dim;
                p.lineWidth = 0.7;
                if (col < 4) { this.facePath(p, [[x, y], [x + 17, y]], false, 9); p.stroke(); }
                if (row < 2) { this.facePath(p, [[x, y], [x, y + 15]], false, 9); p.stroke(); }
                const size = 1.4 + port.level * 2.5;
                this.facePath(p, [[x - size, y - size], [x + size, y - size], [x + size, y + size], [x - size, y + size]], true, 12);
                p.fillStyle = port.level > 0.1 ? this.bright : this.green;
                p.fill();
            }
        }
        // The lower face is a speech field: woven waveforms in a bass-opened socket.
        p.fillStyle = this.bg;
        this.facePath(p, [[282, 220], [306, 214], [338, 217], [357, 226], [344, 256], [320, 266], [295, 255]], true, 12);
        p.fill();
        p.strokeStyle = this.dim;
        p.stroke();
        for (let strand = 0; strand < 5; strand++) {
            const points: Point[] = [];
            for (let i = 0; i < this.wave.length; i++) {
                const t = i / (this.wave.length - 1);
                const weave = Math.sin(t * TAU * 2 + phase * 2 + strand * 0.8) * this.pose.jaw * 3;
                points.push(this.project(289 + t * 62, 225 + strand * 6 + this.wave[i] * 7 + weave, 15));
            }
            p.strokeStyle = strand === 2 ? this.bright : strand % 2 ? this.violet : this.green;
            p.globalAlpha = strand === 2 ? 1 : 0.55;
            p.lineWidth = strand === 2 ? 1.1 : 0.65;
            path(p, points);
            p.stroke();
        }
        p.globalAlpha = 1;
        // Signal pathways bind the perceptual organs to the kernel and speech field.
        p.strokeStyle = this.green;
        p.lineWidth = 0.8;
        for (const points of [
            [[296, 146], [308, 158], [308, 173]],
            [[347, 167], [336, 174]],
            [[320, 107], [320, 154]],
            [[309, 211], [309, 219]],
            [[331, 211], [331, 220]],
            [[320, 268], [320, 290], [306, 304]],
        ]) {
            const line: Point[] = points.map(([x, y]) => [x, y]);
            this.facePath(p, line, false, 14); p.stroke();
        }
    }

    private drawPorts(p: CanvasRenderingContext2D): void {
        for (let i = 0; i < this.ports.length; i++) {
            const port = this.ports[i];
            const register = Math.floor(i / 12);
            const side = port.x < 320 ? -1 : 1;
            const extension = port.level * (register === 2 ? 25 : 15);
            const [x, y] = this.project(port.x, port.y, 8);
            const tip = this.project(port.x + side * extension, port.y - (register === 2 ? extension : 0), 8 + extension);
            p.strokeStyle = port.level > 0.01 ? port.color : this.dim;
            p.globalAlpha = port.level > 0.01 ? 0.8 : 0.5;
            p.lineWidth = 1.2;
            path(p, [[x - 2, y + 2], tip, [x + 2, y - 2]]);
            p.stroke();
            if (port.level > 0.01) {
                p.fillStyle = this.bright;
                p.fillRect(tip[0] - 1.2, tip[1] - 1.2, 2.4, 2.4);
            }
        }
        p.globalAlpha = 1;
    }

    private drawReadout(p: CanvasRenderingContext2D): void {
        p.font = '9px monospace';
        p.textBaseline = 'top';
        p.fillStyle = this.green;
        p.fillText('CYCLETRON // SYNTHETIC SELF', 28, 17);
        p.fillStyle = this.warning;
        p.textAlign = 'right';
        p.fillText(this.field.locked ? `POSSESSION // ${String(this.pose.active).padStart(2, '0')} VOICES` : 'SIGNAL LOST', 612, 17);
        p.textAlign = 'left';
        p.fillStyle = this.green;
        p.fillText('GHOST IN THE MACHINE', 28, 337);
        p.textAlign = 'right';
        p.fillStyle = this.dim;
        p.fillText('CONTAINMENT // FAILED', 612, 337);
        p.textAlign = 'left';
        p.strokeStyle = this.green;
        p.globalAlpha = 0.35 + this.energy * 0.5;
        p.lineWidth = 1;
        path(p, [[264, 341], [264 + this.energy * 111, 341]]);
        p.stroke();
        p.globalAlpha = 1;
    }
}

export const ghostFogDef: VizModeDef = {
    id: 'ghost-fog',
    name: 'GHOST IN THE MACHINE',
    create: () => new GhostMachineMode(),
};
