import * as THREE from 'three';
import { KITS } from '../core/config.js';
import { limbGeometry, jointGeometry, PROFILES, skinMaterial, fabricMaterial, buildBoot } from '../opponents/HumanBuilder.js';

// The player's own legs, seen from first person. The hips sit a little ahead
// of the eye so feet appear at the bottom of the view on each touch of the ball.

function add(geo, mat, parent, y = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.y = y;
  m.castShadow = true;
  parent.add(m);
  return m;
}

export class PlayerBody {
  constructor() {
    this.root = new THREE.Group();
    const k = KITS.player;
    const skin = skinMaterial(k.skin);
    const sock = fabricMaterial(k.socks);
    const shorts = fabricMaterial(k.shorts);
    const trim = fabricMaterial(0xffffff);

    this.hips = new THREE.Group();
    this.hips.position.set(0, 0.95, 0.45);
    this.root.add(this.hips);
    add(limbGeometry([[0, 0.2], [0.3, 0.215], [1, 0.226]], 0.26, 1, 0.72), shorts, this.hips, 0.08);

    this.legs = [];
    for (const side of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(side * 0.11, -0.1, 0);
      add(limbGeometry(PROFILES.thigh, 0.47, 1), skin, thigh);
      add(limbGeometry([[0, 0.118], [1, 0.111]], 0.19, 1), shorts, thigh, 0.03);
      const shin = new THREE.Group();
      shin.position.y = -0.46;
      thigh.add(shin);
      add(jointGeometry(0.06), skin, shin);
      add(limbGeometry(PROFILES.knee, 0.08, 1.02), skin, shin, 0.01);
      add(limbGeometry(PROFILES.calf, 0.38, 1.04), sock, shin, -0.07);
      const band = add(new THREE.TorusGeometry(0.064, 0.008, 6, 20), trim, shin, -0.08);
      band.rotation.x = Math.PI / 2;
      const { foot } = buildBoot(k.boots, 0xff3b3b);
      foot.position.y = -0.44;
      shin.add(foot);
      this.hips.add(thigh);
      this.legs.push({ thigh, shin, foot, side });
    }
    this.touch = 0; // 0..1 kick-touch animation progress
    this.touchSide = 1;
    this.kick = 0; // big shot animation
  }

  // phase: running cycle in radians; speed01: 0 idle .. 1 full run
  update(dt, phase, speed01) {
    this.legs.forEach((L, i) => {
      const p = phase + (i === 0 ? 0 : Math.PI);
      let thighA = Math.sin(p) * 0.75 * speed01;
      let knee = (Math.max(0, -Math.cos(p)) * 1.2 + 0.15) * speed01 + 0.05;
      // Touch: the active foot extends forward towards the ball.
      if (this.touch > 0 && L.side === this.touchSide) {
        const t = Math.sin(this.touch * Math.PI);
        thighA = THREE.MathUtils.lerp(thighA, -1.15, t);
        knee = THREE.MathUtils.lerp(knee, 0.1, t);
      }
      if (this.kick > 0 && L.side === 1) {
        // wind back, then strike through
        const k = this.kick;
        const a = k < 0.45 ? THREE.MathUtils.lerp(0, 0.9, k / 0.45) : THREE.MathUtils.lerp(0.9, -1.5, Math.min(1, (k - 0.45) / 0.3));
        thighA = a;
        knee = k < 0.45 ? 1.2 * (k / 0.45) : THREE.MathUtils.lerp(1.2, 0.0, Math.min(1, (k - 0.45) / 0.25));
      }
      // Negative X rotation swings the leg forward (+Z).
      L.thigh.rotation.x = thighA;
      L.shin.rotation.x = knee;
      L.foot.rotation.x = -0.2 * speed01;
    });
    if (this.touch > 0) this.touch = Math.max(0, this.touch - dt * 3.2);
  }

  startTouch(side) {
    this.touch = 1;
    this.touchSide = side;
  }
}
