import {
    AmbientLight, BoxGeometry, CylinderGeometry, DirectionalLight, Fog, Group, IcosahedronGeometry,
    Mesh, MeshBasicMaterial, MeshLambertMaterial, RingGeometry, Scene, TorusGeometry,
} from 'three';
import type {Stance} from '@naderlabs/kit/timing';
import type {Ink} from '../../lib/ink.js';

export class Warehouse {
    readonly platform = new Group();
    private readonly steel = new MeshLambertMaterial({flatShading: true});
    private readonly floor = new MeshLambertMaterial();
    private readonly cone = new MeshLambertMaterial({flatShading: true});
    private readonly rim = new MeshBasicMaterial();
    private readonly lamp = new MeshBasicMaterial();
    private readonly halo = new MeshBasicMaterial();
    private readonly silhouette = new MeshBasicMaterial();
    private readonly key = new DirectionalLight(0xffffff, 3.3);
    private readonly fill = new AmbientLight(0xffffff, 0.9);
    private readonly edge = new DirectionalLight(0xffffff, 2);
    private readonly wash = new DirectionalLight(0xffffff, 0);
    private readonly fog = new Fog(0x000000, 18, 45);
    private readonly speakers: Mesh[] = [];
    private readonly crowd: {root: Group; arms: Group[]}[] = [];
    private readonly ticks: MeshBasicMaterial[] = [];

    constructor(scene: Scene) {
        scene.fog = this.fog;
        this.key.position.set(-4, 8, 7);
        this.edge.position.set(4, 4, -4);
        this.wash.position.set(0, 6.2, -2.5);
        this.wash.target.position.set(0, 0, 2);
        scene.add(this.key, this.fill, this.edge, this.wash, this.wash.target);
        const ground = new Mesh(new BoxGeometry(30, 0.2, 24), this.floor);
        ground.position.y = -0.2;
        scene.add(ground);
        const riser = new Mesh(new CylinderGeometry(4.8, 5, 0.35, 12), this.steel);
        riser.position.y = 0.175;
        const rim = new Mesh(new TorusGeometry(4.84, 0.055, 4, 48).rotateX(Math.PI / 2), this.rim);
        rim.position.y = 0.27;
        this.platform.add(riser, rim);
        scene.add(this.platform);

        for (const x of [-6, 6]) {
            const column = new Mesh(new BoxGeometry(0.35, 9, 0.4), this.steel);
            column.position.set(x, 4.5, -4);
            const speaker = new Mesh(new BoxGeometry(1.5, 3.8, 1.1), this.steel);
            speaker.position.set(x * 0.84, 1.9, -1.8);
            scene.add(column, speaker);
            for (let i = 0; i < 3; i++) {
                const driver = new Mesh(new CylinderGeometry(0.55, 0.4, 0.1, 12).rotateX(Math.PI / 2), this.cone);
                driver.position.set(speaker.position.x, 0.7 + i * 1.2, -1.21);
                this.speakers.push(driver);
                scene.add(driver);
            }
        }
        const truss = new Mesh(new BoxGeometry(12.5, 0.25, 0.4), this.steel);
        truss.position.set(0, 6.5, -2.5);
        scene.add(truss);
        for (let i = 0; i < 4; i++) {
            const housing = new Mesh(new BoxGeometry(1.2, 0.5, 0.5), this.steel);
            housing.position.set((i - 1.5) * 2.8, 6.2, -2.5);
            const face = new Mesh(new BoxGeometry(0.95, 0.25, 0.08), this.lamp);
            face.position.z = 0.3;
            housing.add(face);
            scene.add(housing);
        }

        const halo = new Mesh(new RingGeometry(2.8, 2.85, 48), this.halo);
        halo.position.set(0, 3.15, -2.9);
        scene.add(halo);
        for (let i = 0; i < 16; i++) {
            const a = i * Math.PI / 8;
            const mat = new MeshBasicMaterial();
            const tick = new Mesh(new BoxGeometry(0.16, 0.38, 0.08), mat);
            tick.position.set(Math.sin(a) * 3.05, 3.15 + Math.cos(a) * 3.05, -2.9);
            tick.rotation.z = -a;
            this.ticks.push(mat);
            scene.add(tick);
        }

        const bodyGeo = new IcosahedronGeometry(0.47, 1);
        const headGeo = new IcosahedronGeometry(0.27, 1);
        const armGeo = new BoxGeometry(0.14, 0.7, 0.13).translate(0, -0.35, 0);
        for (let i = 0; i < 9; i++) {
            const root = new Group();
            root.position.set((i - 4) * 1.25, 0, 5.4 + Math.abs(i - 4) * 0.12);
            const body = new Mesh(bodyGeo, this.silhouette);
            body.position.y = 0.65;
            body.scale.set(0.8, 1.4, 0.7);
            const head = new Mesh(headGeo, this.silhouette);
            head.position.y = 1.3;
            root.add(body, head);
            const arms = [-1, 1].map((side) => {
                const arm = new Group();
                arm.position.set(side * 0.33, 0.95, 0);
                arm.add(new Mesh(armGeo, this.silhouette));
                root.add(arm);
                return arm;
            });
            this.crowd.push({root, arms});
            scene.add(root);
        }
    }

    paint(ink: Ink, scene: Scene): void {
        scene.background = ink.bg;
        this.fog.color.copy(ink.bg);
        this.steel.color.copy(ink.bg).lerp(ink.deep, 0.4).lerp(ink.snow, 0.025);
        this.floor.color.copy(ink.bg).lerp(ink.deep, 0.35).lerp(ink.snow, 0.045);
        this.cone.color.copy(ink.deep).lerp(ink.frost, 0.15);
        this.silhouette.color.copy(ink.bg).multiplyScalar(0.25);
        this.key.color.copy(ink.snow).lerp(ink.warm, 0.55);
        this.fill.color.copy(ink.frost).lerp(ink.snow, 0.4);
        this.edge.color.copy(ink.ice);
        this.wash.color.copy(ink.snow).lerp(ink.ice, 0.15);
        this.halo.color.copy(ink.glow).multiplyScalar(0.45);
    }

    update(ink: Ink, kick: number, flash: number, kickPose: Stance, snare: Stance, hat: number, step: number): void {
        this.platform.position.y = kickPose === 'hit' ? -0.07 : 0;
        this.rim.color.copy(ink.ice).multiplyScalar(0.2 + kick * 1.8);
        this.lamp.color.copy(ink.snow).multiplyScalar(0.035 + flash * 5);
        this.wash.intensity = flash * 18;
        for (const speaker of this.speakers) speaker.position.z = -1.21 + kick * 0.14;
        for (const {root, arms} of this.crowd) {
            root.scale.y = snare === 'ready' ? 0.83 : 1;
            root.position.y = snare === 'hit' ? 0.22 : 0;
            arms[0].rotation.z = snare === 'hit' ? -2.5 : -0.25;
            arms[1].rotation.z = snare === 'hit' ? 2.5 : 0.25;
        }
        for (let i = 0; i < this.ticks.length; i++) {
            this.ticks[i].color.copy(ink.rose).multiplyScalar(0.08 + (i === step ? hat * 2 : 0));
        }
    }
}
