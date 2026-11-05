/**
 * PARADE — a Thanksgiving parade down Main Street, seen from the curb. Floats
 * and marching bands take turns going by, one block of street per bar, and
 * the band steps on every beat. Pitched notes are the band playing: pitch
 * picks the file across the band, low on the left of the march and high on
 * the right, and that player lifts their horn and it flares in the track
 * colour while the note holds. Kicks hit the bass drum at the front, which
 * flashes, and the whole band stomps. Snares and crashes throw confetti from
 * the rooftops, hats bounce the crowd on the far kerb, and the bass level
 * lifts the balloons on their ropes.
 */

import type {VizMode, VizModeDef, VizServices} from '@cycletron/viz-sdk';
import {type FieldHap, type FieldTeam, HapField} from '@cycletron/viz-sdk';
import {clamp01, hash32, rand01, SeededRandom, TAU} from '@cycletron/viz-sdk';
import {
    BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, DynamicDrawUsage, Float32BufferAttribute,
    InstancedMesh, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D,
    PlaneGeometry, SphereGeometry,
} from 'three';
import {type Role} from '@naderlabs/kit/roles';
import {bakeHarvest, type Harvest} from '../../lib/colors.js';
import {setRgb} from '@naderlabs/kit/gl';
import {GLOW_QUAD, glowMaterial} from '../../lib/glow.js';
import {age, hide, markDirty} from '../../lib/instances.js';
import {harvestRole} from '../../lib/roles.js';
import {SkyDome} from '../../lib/sky.js';
import {Stage} from '../../lib/stage.js';
import {acorn, type Balloon, type BalloonMats, pumpkinFloat, turkey} from './balloons.js';

const LOOKAHEAD = 1;
/** Street travelled per bar, and the gap between parade units. */
const SPEED = 7;
const UNIT = 24;
const VIEW = 42;
/** The band: files across the march, ranks along it. */
const FILES = 3;
const RANKS = 5;
const PLAYERS = FILES * RANKS;
const MAX_BANDS = 3;
const MAX_PEOPLE = MAX_BANDS * PLAYERS + 3 * 4;
/** The crowd: a row on the far kerb, then a few heads in front of the camera. */
const FAR = 46;
const NEAR = 12;
const CROWD = FAR + NEAR;
const MAX_CONFETTI = 260;
const CONFETTI_LIFE = 3.2;
const TAIL = 0.4;
const KERB = -7.4;
const FACADE = -10;

interface Team extends FieldTeam {}

interface Note extends FieldHap<Team> {
    role: Role;
}

interface Bit {
    age: number;
    x: number;
    y: number;
    z: number;
    vx: number;
    vz: number;
    seed: number;
}

interface Building {
    x: number;
    w: number;
    h: number;
    tint: number;
}

class ParadeMode implements VizMode {
    private readonly stage = new Stage(46, 0.3, 500, 40, 160);
    private readonly sky = new SkyDome(350);
    private readonly field = new HapField<Team, Note>({
        lookahead: LOOKAHEAD,
        maxHaps: 200,
        maxPerTrack: 40,
        idleRate: 0.25,
        team: (base) => base,
        hap: (base) => ({...base, role: harvestRole(base.team.name, base.note)}),
        keep: (h, cycle) => h.end + TAIL >= cycle,
    });
    private readonly dummy = new Object3D();
    private readonly tint = new Color();
    private readonly hot = new Color();
    private readonly confetti: Bit[] = [];
    private readonly crowdHop = new Float32Array(CROWD);
    /** Per band slot and player: how lit the horn is and in which colour. */
    private readonly horn = new Float32Array(MAX_BANDS * PLAYERS);
    private readonly hornJump = new Float32Array(MAX_BANDS * PLAYERS);
    private readonly hornRgb = new Float32Array(MAX_BANDS * PLAYERS * 3);
    private readonly buildings: Building[] = [];
    private colors: Harvest | null = null;
    private bass = 0;
    private drum = 0;

    private readonly uniformMat = new MeshLambertMaterial({flatShading: true});
    private readonly legs: InstancedMesh;
    private readonly torsos: InstancedMesh;
    private readonly heads: InstancedMesh;
    private readonly hats: InstancedMesh;
    private readonly plumes: InstancedMesh;
    private readonly horns: InstancedMesh;
    private readonly hornGlow: InstancedMesh;
    private readonly drums: InstancedMesh;
    private readonly crowdBodies: InstancedMesh;
    private readonly crowdHeads: InstancedMesh;
    private readonly bits: InstancedMesh;
    private readonly blocks: InstancedMesh;
    private readonly cornices: InstancedMesh;
    private readonly windows: InstancedMesh;
    private readonly pennants: InstancedMesh;
    private readonly balloons: Balloon[];
    private readonly ropes: LineSegments;
    private readonly ropePos: Float32BufferAttribute;
    private readonly ropeMat = new LineBasicMaterial();
    private readonly roadMat = new MeshLambertMaterial();
    private readonly walkMat = new MeshLambertMaterial();
    private readonly lineMat = new MeshBasicMaterial();
    private readonly windowMat = new MeshBasicMaterial();
    private readonly mats: BalloonMats = {
        body: lambert(), tail: [lambert(), lambert(), lambert(), lambert(), lambert()], beak: lambert(), wattle: lambert(),
        pumpkin: lambert(), stem: lambert(), nut: lambert(), cap: lambert(),
    };

    constructor() {
        const {scene} = this.stage;
        scene.add(this.sky.mesh);

        const legGeo = new BoxGeometry(0.16, 0.85, 0.16);
        legGeo.translate(0, -0.42, 0);
        this.legs = new InstancedMesh(legGeo, this.uniformMat, MAX_PEOPLE * 2);
        this.torsos = new InstancedMesh(new CylinderGeometry(0.3, 0.36, 0.95, 6), lambert(), MAX_PEOPLE);
        this.heads = new InstancedMesh(new SphereGeometry(0.24, 7, 5), lambert(), MAX_PEOPLE);
        this.hats = new InstancedMesh(new CylinderGeometry(0.22, 0.2, 0.5, 6), lambert(), MAX_PEOPLE);
        this.plumes = new InstancedMesh(new ConeGeometry(0.09, 0.4, 5), lambert(), MAX_PEOPLE);
        const hornGeo = new ConeGeometry(0.2, 0.6, 7, 1, true);
        this.horns = new InstancedMesh(hornGeo, new MeshLambertMaterial({flatShading: true, side: DoubleSide}), MAX_PEOPLE);
        this.hornGlow = new InstancedMesh(GLOW_QUAD, glowMaterial(), MAX_BANDS * PLAYERS);
        const drumGeo = new CylinderGeometry(0.7, 0.7, 0.5, 12);
        drumGeo.rotateX(Math.PI / 2);
        this.drums = new InstancedMesh(drumGeo, lambert(), MAX_BANDS);
        scene.add(this.legs, this.torsos, this.heads, this.hats, this.plumes, this.horns, this.hornGlow, this.drums);

        this.crowdBodies = new InstancedMesh(new CylinderGeometry(0.3, 0.38, 1.3, 6), lambert(), CROWD);
        this.crowdHeads = new InstancedMesh(new SphereGeometry(0.25, 7, 5), lambert(), CROWD);
        scene.add(this.crowdBodies, this.crowdHeads);

        const bitGeo = new PlaneGeometry(0.22, 0.14);
        this.bits = new InstancedMesh(bitGeo, new MeshLambertMaterial({side: DoubleSide}), MAX_CONFETTI);
        scene.add(this.bits);

        // The street, kerbs and the facades across it.
        const road = plane(200, 15, this.roadMat);
        road.position.set(0, 0, 0);
        const walkFar = plane(200, 6, this.walkMat);
        walkFar.position.set(0, 0.12, -10.5);
        const walkNear = plane(200, 10, this.walkMat);
        walkNear.position.set(0, 0.12, 12.5);
        const stripe = plane(200, 0.18, this.lineMat);
        stripe.position.set(0, 0.02, 2.2);
        scene.add(road, walkFar, walkNear, stripe);

        const rnd = new SeededRandom(5);
        for (let x = -90; x < 90;) {
            const w = rnd.range(6, 11);
            this.buildings.push({x: x + w / 2, w, h: rnd.range(6, 15), tint: rnd.next()});
            x += w + 0.15;
        }
        const nb = this.buildings.length;
        const boxGeo = new BoxGeometry(1, 1, 1);
        boxGeo.translate(0, 0.5, -0.5);
        this.blocks = new InstancedMesh(boxGeo, lambert(), nb);
        this.cornices = new InstancedMesh(boxGeo, lambert(), nb);
        let nWin = 0;
        for (const b of this.buildings) nWin += Math.floor((b.w - 1) / 1.6) * Math.floor((b.h - 2) / 2.2);
        this.windows = new InstancedMesh(new PlaneGeometry(0.8, 1.1), this.windowMat, nWin);
        this.buildings.forEach((b, i) => {
            this.place(b.x, 0, FACADE - 0.1, b.w, b.h, 8);
            this.blocks.setMatrixAt(i, this.dummy.matrix);
            this.place(b.x, b.h, FACADE + 0.2, b.w + 0.3, 0.45, 8.6);
            this.cornices.setMatrixAt(i, this.dummy.matrix);
        });
        let w = 0;
        this.buildings.forEach((b) => {
            const cols = Math.floor((b.w - 1) / 1.6);
            const rows = Math.floor((b.h - 2) / 2.2);
            for (let r = 0; r < rows; r++) {
                for (let k = 0; k < cols; k++) {
                    this.place(b.x + (k - (cols - 1) / 2) * 1.6, 2.6 + r * 2.2, FACADE + 0.01, 1, 1, 1);
                    this.windows.setMatrixAt(w++, this.dummy.matrix);
                }
            }
        });
        scene.add(this.blocks, this.cornices, this.windows);

        // Bunting along the far kerb, sagging between poles.
        const pennantGeo = new BufferGeometry();
        pennantGeo.setAttribute('position', new Float32BufferAttribute([-0.3, 0, 0, 0.3, 0, 0, 0, -0.65, 0], 3));
        pennantGeo.computeVertexNormals();
        this.pennants = new InstancedMesh(pennantGeo, new MeshLambertMaterial({side: DoubleSide}), 120);
        scene.add(this.pennants);

        this.balloons = [turkey(this.mats), pumpkinFloat(this.mats), acorn(this.mats)];
        for (const b of this.balloons) {
            b.group.scale.setScalar(1.3);
            scene.add(b.group);
        }
        this.ropePos = new Float32BufferAttribute(new Float32Array(this.balloons.length * 4 * 2 * 3), 3);
        this.ropePos.setUsage(DynamicDrawUsage);
        const ropeGeo = new BufferGeometry();
        ropeGeo.setAttribute('position', this.ropePos);
        this.ropes = new LineSegments(ropeGeo, this.ropeMat);
        this.ropes.frustumCulled = false;
        scene.add(this.ropes);

        const cam = this.stage.camera;
        cam.position.set(0, 4.4, 20);
        cam.lookAt(0, 5.1, -4);
        this.stage.sun.position.set(-20, 30, 25);
        this.stage.uncull();
    }

    private place(x: number, y: number, z: number, sx: number, sy: number, sz: number): void {
        const d = this.dummy;
        d.position.set(x, y, z);
        d.rotation.set(0, 0, 0);
        d.scale.set(sx, sy, sz);
        d.updateMatrix();
    }

    layout(s: VizServices): void {
        const c = bakeHarvest(s.theme);
        this.colors = c;
        const horizon = c.sun.clone().lerp(c.cream, 0.3);
        const zenith = c.sky.clone().lerp(c.violet, 0.4).lerp(c.cream, 0.25);
        this.sky.paint(zenith, horizon, horizon);
        this.stage.fit(s, horizon.clone().lerp(zenith, 0.3), c.cream.clone().lerp(c.sun, 0.5), c.soil);
        this.stage.sun.intensity = 2.3;
        this.stage.fill.intensity = 1.5;
        const asphalt = new Color(s.theme.bg).lerp(c.violet, 0.3);
        this.roadMat.color.copy(asphalt).lerp(c.cream, 0.08);
        this.walkMat.color.copy(c.cream).lerp(c.ground, 0.55);
        this.lineMat.color.copy(c.leaves[2]);
        this.windowMat.color.copy(c.cream).lerp(c.leaves[2], 0.35).multiplyScalar(0.9);
        this.ropeMat.color.copy(c.cream).multiplyScalar(0.8);
        this.uniformMat.color.copy(c.cream).multiplyScalar(0.95);
        const m = this.mats;
        m.body.color.copy(c.bark).lerp(c.leaves[3], 0.3);
        m.tail.forEach((mat, i) => mat.color.copy(c.leaves[i % c.leaves.length]));
        m.beak.color.copy(c.leaves[2]);
        m.wattle.color.copy(c.leaves[1]);
        m.pumpkin.color.copy(c.pumpkin);
        m.stem.color.copy(c.leaves[4]);
        m.nut.color.copy(c.straw).lerp(c.bark, 0.45);
        m.cap.color.copy(c.bark).lerp(c.soil, 0.3);

        const facade = [c.leaves[3], c.cream, c.leaves[1], c.bark, c.straw];
        this.buildings.forEach((b, i) => {
            this.tint.copy(facade[Math.floor(b.tint * facade.length)]).lerp(c.ground, 0.3);
            this.blocks.setColorAt(i, this.tint);
            this.cornices.setColorAt(i, this.tint.multiplyScalar(0.7));
        });
        for (let i = 0; i < CROWD; i++) {
            this.tint.copy(c.leaves[hash32(i, 3) % c.leaves.length]).lerp(c.ground, 0.25);
            if (i >= FAR) this.tint.lerp(c.soil, 0.55);
            this.crowdBodies.setColorAt(i, this.tint);
            this.crowdHeads.setColorAt(i, i >= FAR ? this.tint.copy(c.bark).lerp(c.soil, 0.5) : this.skin(c));
        }
        for (let i = 0; i < 120; i++) this.pennants.setColorAt(i, c.leaves[i % 3 === 2 ? 2 : i % 3]);
        for (let i = 0; i < MAX_CONFETTI; i++) this.bits.setColorAt(i, i % 4 === 3 ? c.cream : c.leaves[i % c.leaves.length]);
        for (const mesh of [this.blocks, this.cornices, this.crowdBodies, this.crowdHeads, this.pennants, this.bits]) markDirty(mesh);
        this.field.invalidate();
    }

    private skin(c: Harvest): Color {
        return this.hot.copy(c.cream).lerp(c.pumpkin, 0.25);
    }

    update(dt: number, s: VizServices): void {
        const field = this.field;
        field.update(dt, s);
        const cycle = field.cycle;
        if (field.restarted) {
            this.confetti.length = 0;
            this.crowdHop.fill(0);
            this.drum = 0;
        }
        for (const h of field.haps) {
            if (!field.crossed(h)) continue;
            h.done = true;
            h.team.activity = 1;
            switch (h.role) {
                case 'kick':
                    this.drum = 1;
                    break;
                case 'snare':
                    this.throwConfetti(h.seed, 10);
                    break;
                case 'crash':
                    this.throwConfetti(h.seed, 26);
                    break;
                case 'hat':
                    for (let k = 0; k < 4; k++) this.crowdHop[hash32(h.seed, k) % CROWD] = 1;
                    break;
                default:
                    break;
            }
        }
        for (const b of this.confetti) {
            b.vx *= Math.exp(-dt * 1.2);
            b.vz *= Math.exp(-dt * 1.2);
            b.x += (b.vx + Math.sin(b.age * 3 + (b.seed & 15)) * 0.6) * dt;
            b.z += b.vz * dt;
            b.y = Math.max(0.05, b.y - (b.age < 0.3 ? -2 : 1.4) * dt);
        }
        age(this.confetti, dt, CONFETTI_LIFE);
        const k = Math.exp(-dt * 7);
        for (let i = 0; i < CROWD; i++) this.crowdHop[i] *= k;
        this.drum *= Math.exp(-dt * 6);
        this.bass += (s.low - this.bass) * (1 - Math.exp(-dt * 5));

        this.lightHorns(cycle);
        this.pose(cycle);
    }

    private throwConfetti(seed: number, n: number): void {
        const r = (k: number) => rand01(hash32(seed, k));
        const x0 = (r(1) - 0.5) * 36;
        const b = this.buildings[Math.floor(clamp01((x0 + 90) / 180) * (this.buildings.length - 1))];
        for (let i = 0; i < n; i++) {
            if (this.confetti.length >= MAX_CONFETTI) this.confetti.shift();
            const q = (k: number) => rand01(hash32(seed, i * 16 + k + 3));
            this.confetti.push({age: 0, x: x0 + (q(1) - 0.5) * 3, y: (b ? b.h : 10) + 0.5, z: FACADE + 0.4,
                vx: (q(2) - 0.5) * 6, vz: 1.5 + q(3) * 4, seed: hash32(seed, i)});
        }
    }

    /** The band slot (0..MAX_BANDS) for unit k, or -1 when k isn't a band. */
    private bandSlot(k: number): number {
        return (k & 1) === 1 ? (((k - 1) / 2) % MAX_BANDS + MAX_BANDS) % MAX_BANDS : -1;
    }

    /** The band nearest the middle of the view at `cycle`. */
    private centreBand(cycle: number): number {
        // Unit k is centred at k * UNIT + cycle * SPEED; bands are the odd units.
        return Math.round((-cycle * SPEED / UNIT - 1) / 2) * 2 + 1;
    }

    /** Each player's horn: lit by a pitched note of the band nearest the middle when it sounded. */
    private lightHorns(cycle: number): void {
        this.horn.fill(0);
        this.hornJump.fill(0);
        for (const h of this.field.haps) {
            if (h.role !== 'bass' && h.role !== 'mid' && h.role !== 'lead') continue;
            const t = cycle - h.begin;
            if (t < 0) continue;
            const over = cycle - h.end;
            const level = (over <= 0 ? 1 : 1 - over / TAIL) * h.fade;
            if (level <= 0) continue;
            const slot = this.bandSlot(this.centreBand(h.begin));
            const file = Math.round(clamp01((h.note - 36) / 48) * (FILES - 1));
            const rank = hash32(h.seed, 7) % RANKS;
            const i = slot * PLAYERS + rank * FILES + file;
            if (level <= this.horn[i]) continue;
            this.horn[i] = level;
            this.hornJump[i] = Math.exp(-t * 10);
            setRgb(this.tint, h.team.rgb);
            this.hornRgb[i * 3] = this.tint.r;
            this.hornRgb[i * 3 + 1] = this.tint.g;
            this.hornRgb[i * 3 + 2] = this.tint.b;
        }
    }

    private pose(cycle: number): void {
        const c = this.colors;
        if (!c) return;
        const d = this.dummy;
        const beat = cycle * 4;
        const stepPhase = beat * Math.PI;
        const sc = cycle * SPEED;
        const kFirst = Math.ceil((-VIEW - sc) / UNIT);
        const kLast = Math.floor((VIEW - sc) / UNIT);
        let people = 0;
        let glows = 0;
        let drums = 0;
        for (const b of this.balloons) b.group.visible = false;
        this.ropePos.array.fill(0);

        for (let k = kFirst; k <= kLast; k++) {
            const ux = k * UNIT + sc;
            const slot = this.bandSlot(k);
            if (slot >= 0) {
                for (let rank = 0; rank < RANKS; rank++) {
                    for (let file = 0; file < FILES; file++) {
                        const i = slot * PLAYERS + rank * FILES + file;
                        const x = ux + (RANKS / 2 - rank) * 1.7;
                        const z = (file - (FILES - 1) / 2) * 2.2 + 0.5;
                        const lit = this.horn[i];
                        const jump = this.hornJump[i] * 0.45;
                        const stomp = this.drum * 0.08;
                        const p = people++;
                        const y = 0.85 + Math.abs(Math.sin(stepPhase)) * 0.1 + jump - stomp;
                        this.person(p, x, y, z, 0, stepPhase, c.leaves[1], c.cream);
                        // The horn: held level, lifted and flaring while its note sounds.
                        const lift = lit * 0.9;
                        d.position.set(x + 0.45, y + 1.0 + lift * 0.3, z + 0.12);
                        d.rotation.set(0, 0, -Math.PI / 2 + lift);
                        d.scale.setScalar(1);
                        d.updateMatrix();
                        this.horns.setMatrixAt(p, d.matrix);
                        this.hot.setRGB(this.hornRgb[i * 3], this.hornRgb[i * 3 + 1], this.hornRgb[i * 3 + 2]);
                        this.tint.copy(c.leaves[2]).lerp(c.cream, 0.2);
                        if (lit > 0) this.tint.lerp(this.hot, 0.6).multiplyScalar(1 + lit * 1.5);
                        this.horns.setColorAt(p, this.tint);
                        if (lit > 0 && glows < MAX_BANDS * PLAYERS) {
                            d.position.set(x + 0.85 + lift * 0.1, y + 1.0 + lift * 0.55, z + 0.3);
                            d.quaternion.copy(this.stage.camera.quaternion);
                            const gs = 1.1 + lit * 0.7 + this.hornJump[i] * 1.2;
                            d.scale.set(gs, gs, 1);
                            d.updateMatrix();
                            this.hornGlow.setMatrixAt(glows, d.matrix);
                            this.hornGlow.setColorAt(glows, this.hot.multiplyScalar(lit * 0.7));
                            glows++;
                        }
                    }
                }
                if (drums < MAX_BANDS) {
                    // The bass drummer leads the band.
                    const x = ux + (RANKS / 2 + 1) * 1.7;
                    const p = people++;
                    const y = 0.85 + Math.abs(Math.sin(stepPhase)) * 0.1 + this.drum * 0.15;
                    this.person(p, x, y, 0.5, 0, stepPhase, c.leaves[1], c.cream);
                    hide(this.horns, p);
                    d.position.set(x + 0.6, y + 0.55, 0.5);
                    d.rotation.set(0, Math.PI / 2, this.drum * 0.2);
                    d.scale.setScalar(1 + this.drum * 0.12);
                    d.updateMatrix();
                    this.drums.setMatrixAt(drums, d.matrix);
                    this.tint.copy(c.cream).lerp(c.leaves[2], 0.3).multiplyScalar(0.9 + this.drum * 1.6);
                    this.drums.setColorAt(drums, this.tint);
                    drums++;
                }
                continue;
            }
            const type = ((k / 2) % 3 + 3) % 3;
            const balloon = this.balloons[type];
            const g = balloon.group;
            g.visible = true;
            const bob = Math.sin(cycle * TAU * 0.5 + k) * 0.35 + clamp01(this.bass) * 0.9;
            const by = 6.8 + bob;
            g.position.set(ux, by, 0.5);
            g.rotation.set(Math.sin(cycle * TAU * 0.25 + k) * 0.05, balloon.yaw + Math.sin(cycle * TAU * 0.125) * 0.12, Math.sin(cycle * TAU * 0.5 + k) * 0.06);
            // Four handlers walk the ropes.
            for (let h = 0; h < 4; h++) {
                const hx = ux + (h < 2 ? -2.2 : 2.2);
                const hz = 0.5 + (h % 2 === 0 ? -2.6 : 2.6);
                const p = people++;
                this.person(p, hx, 0.85 + Math.abs(Math.sin(stepPhase)) * 0.06, hz, 0.2, stepPhase, c.leaves[2], c.leaves[3]);
                hide(this.horns, p);
                const at = (type * 4 + h) * 6;
                const arr = this.ropePos.array;
                arr[at] = hx + 0.3; arr[at + 1] = 2.1; arr[at + 2] = hz;
                arr[at + 3] = ux + (hx - ux) * 0.35; arr[at + 4] = by + balloon.ropeY * 1.3; arr[at + 5] = 0.5 + (hz - 0.5) * 0.35;
            }
        }
        for (let p = people; p < MAX_PEOPLE; p++) {
            for (const mesh of [this.torsos, this.heads, this.hats, this.plumes, this.horns]) hide(mesh, p);
            hide(this.legs, p * 2);
            hide(this.legs, p * 2 + 1);
        }
        for (let i = glows; i < MAX_BANDS * PLAYERS; i++) hide(this.hornGlow, i);
        for (let i = drums; i < MAX_BANDS; i++) hide(this.drums, i);
        this.ropePos.needsUpdate = true;

        this.poseCrowd(cycle);
        this.poseBunting(cycle);
        this.poseConfetti();
        for (const mesh of [this.legs, this.torsos, this.heads, this.hats, this.plumes, this.horns, this.hornGlow, this.drums,
            this.crowdBodies, this.crowdHeads, this.pennants, this.bits]) markDirty(mesh);
    }

    /** One marcher: legs swinging with `step`, a uniform, a shako and a plume. */
    private person(p: number, x: number, y: number, z: number, yaw: number, step: number, coat: Color, hat: Color): void {
        const d = this.dummy;
        const c = this.colors;
        if (!c) return;
        for (const side of [0, 1]) {
            d.position.set(x, y, z + (side === 0 ? -0.13 : 0.13));
            d.rotation.set(0, yaw, Math.sin(step + side * Math.PI) * 0.45);
            d.scale.setScalar(1);
            d.updateMatrix();
            this.legs.setMatrixAt(p * 2 + side, d.matrix);
        }
        d.rotation.set(0, yaw, 0);
        d.position.set(x, y + 0.45, z);
        d.updateMatrix();
        this.torsos.setMatrixAt(p, d.matrix);
        this.torsos.setColorAt(p, coat);
        d.position.set(x, y + 1.15, z);
        d.updateMatrix();
        this.heads.setMatrixAt(p, d.matrix);
        this.heads.setColorAt(p, this.skin(c));
        d.position.set(x, y + 1.5, z);
        d.updateMatrix();
        this.hats.setMatrixAt(p, d.matrix);
        this.hats.setColorAt(p, hat);
        d.position.set(x, y + 1.9, z);
        d.updateMatrix();
        this.plumes.setMatrixAt(p, d.matrix);
        this.plumes.setColorAt(p, c.leaves[2]);
    }

    private poseCrowd(cycle: number): void {
        const d = this.dummy;
        for (let i = 0; i < CROWD; i++) {
            const near = i >= FAR;
            const x = near ? -10 + ((i - FAR) / NEAR) * 21 + (rand01(hash32(i, 1)) - 0.5) * 1.5
                : -38 + (i / FAR) * 76 + (rand01(hash32(i, 1)) - 0.5) * 1.2;
            const z = near ? 11 + rand01(hash32(i, 2)) * 1.2 : KERB - 1 - rand01(hash32(i, 2)) * 1.6;
            const sway = Math.sin(cycle * TAU + i) * 0.04;
            const hop = this.crowdHop[i] * 0.35;
            const tall = 0.9 + rand01(hash32(i, 4)) * 0.25;
            const wide = near ? 1.5 : 1;
            d.position.set(x, 0.12 + 0.65 * tall + hop, z);
            d.rotation.set(0, 0, sway);
            d.scale.set(wide, tall, wide);
            d.updateMatrix();
            this.crowdBodies.setMatrixAt(i, d.matrix);
            d.position.y += 0.65 * tall + 0.25 * wide;
            d.scale.setScalar(wide);
            d.updateMatrix();
            this.crowdHeads.setMatrixAt(i, d.matrix);
        }
    }

    private poseBunting(cycle: number): void {
        const d = this.dummy;
        const flutter = 0.1 + clamp01(this.bass) * 0.35;
        for (let i = 0; i < 120; i++) {
            const x = -60 + i;
            const span = ((x % 8) + 8) % 8;
            const sag = Math.sin((span / 8) * Math.PI) * 0.9;
            d.position.set(x, 5.6 - sag, KERB - 0.2);
            d.rotation.set(Math.sin(cycle * TAU * 2 + i * 0.7) * flutter, 0, 0);
            d.scale.setScalar(1);
            d.updateMatrix();
            this.pennants.setMatrixAt(i, d.matrix);
        }
    }

    private poseConfetti(): void {
        const d = this.dummy;
        for (let i = 0; i < MAX_CONFETTI; i++) {
            const b = this.confetti[i];
            if (!b) { hide(this.bits, i); continue; }
            const s = b.age * 6;
            d.position.set(b.x, b.y, b.z);
            d.rotation.set(s + (b.seed & 7), s * 0.7, s * 1.3 + (b.seed & 15));
            const fade = clamp01((CONFETTI_LIFE - b.age) / 0.6);
            d.scale.setScalar(fade);
            d.updateMatrix();
            this.bits.setMatrixAt(i, d.matrix);
        }
    }

    render(ctx: CanvasRenderingContext2D, s: VizServices): void {
        this.stage.draw(ctx, s);
    }
}

function lambert(): MeshLambertMaterial {
    return new MeshLambertMaterial({flatShading: true});
}

function plane(w: number, d: number, mat: MeshLambertMaterial | MeshBasicMaterial): Mesh {
    const g = new PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    return new Mesh(g, mat);
}

export const paradeDef: VizModeDef = {
    id: 'parade',
    name: 'PARADE',
    create: () => new ParadeMode(),
};
