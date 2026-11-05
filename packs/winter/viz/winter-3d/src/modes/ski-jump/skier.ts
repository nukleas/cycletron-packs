/**
 * A low-poly ski jumper: skis, legs, a body, arms and a helmet, posed by
 * three numbers (crouch, lean, the V of the skis). Two of them take turns on
 * the hill, one a bar.
 */

import {BoxGeometry, Color, Group, IcosahedronGeometry, Mesh, MeshLambertMaterial} from 'three';

const SKI = new BoxGeometry(2.3, 0.05, 0.13).translate(0.35, 0.025, 0);
const LEG = new BoxGeometry(0.22, 0.85, 0.24).translate(0, 0.42, 0);
const BODY = new BoxGeometry(0.34, 0.8, 0.46).translate(0, 0.4, 0);
const ARM = new BoxGeometry(0.15, 0.7, 0.15).translate(0, -0.35, 0);
const HEAD = new IcosahedronGeometry(0.2, 1);

export class Skier {
    readonly root = new Group();
    readonly suit = new MeshLambertMaterial({flatShading: true});
    readonly helmet = new MeshLambertMaterial({flatShading: true});
    private readonly skiMat = new MeshLambertMaterial({flatShading: true});
    private readonly skiL: Mesh;
    private readonly skiR: Mesh;
    private readonly legs = new Group();
    private readonly torso = new Group();
    private readonly armL: Mesh;
    private readonly armR: Mesh;

    constructor() {
        this.skiL = new Mesh(SKI, this.skiMat);
        this.skiR = new Mesh(SKI, this.skiMat);
        this.skiL.position.z = -0.16;
        this.skiR.position.z = 0.16;
        const legL = new Mesh(LEG, this.suit);
        const legR = new Mesh(LEG, this.suit);
        legL.position.z = -0.14;
        legR.position.z = 0.14;
        this.legs.add(legL, legR);
        this.legs.position.y = 0.05;
        const body = new Mesh(BODY, this.suit);
        const head = new Mesh(HEAD, this.helmet);
        head.position.y = 0.98;
        this.armL = new Mesh(ARM, this.suit);
        this.armR = new Mesh(ARM, this.suit);
        this.armL.position.set(0, 0.72, -0.3);
        this.armR.position.set(0, 0.72, 0.3);
        this.torso.add(body, head, this.armL, this.armR);
        this.torso.position.y = 0.85;
        this.legs.add(this.torso);
        this.root.add(this.skiL, this.skiR, this.legs);
        this.root.scale.setScalar(1.5);
    }

    paint(suit: Color, helmet: Color, ski: Color): void {
        this.suit.color.copy(suit);
        this.helmet.color.copy(helmet);
        this.skiMat.color.copy(ski);
    }

    /**
     * `crouch` 0..1 folds the knees and hips (the in-run tuck); `lean` is the
     * body's forward tilt in radians; `vee` opens the ski tips apart; `arms`
     * 0 holds them back along the body, 1 throws them out for balance.
     */
    pose(crouch: number, lean: number, vee: number, arms: number): void {
        this.legs.rotation.z = -0.45 * crouch - lean * 0.8;
        this.legs.scale.y = 1 - 0.3 * crouch;
        this.torso.rotation.z = -(lean * 0.25 + 0.95 * crouch);
        this.skiL.rotation.y = vee;
        this.skiR.rotation.y = -vee;
        const swing = 0.25 + arms * 1.2;
        this.armL.rotation.set(-arms * 0.5, 0, swing);
        this.armR.rotation.set(arms * 0.5, 0, swing);
    }
}
