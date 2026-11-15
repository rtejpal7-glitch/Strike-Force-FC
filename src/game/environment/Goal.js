import * as THREE from 'three';
import { PITCH } from '../core/config.js';

// Goal frame + net. The back net is subdivided so it can ripple when the ball hits it.

function makeNetTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 3;
  g.strokeRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Goal {
  constructor(dir) {
    // dir = +1 for the goal at +Z (the one we attack), -1 for ours.
    this.dir = dir;
    this.group = new THREE.Group();
    this.group.position.z = dir * PITCH.halfLength;
    this.ripples = [];
    const W = PITCH.goalWidth;
    const H = PITCH.goalHeight;
    const D = PITCH.goalDepth;
    const r = 0.06;

    const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.1 });
    const postGeo = new THREE.CylinderGeometry(r, r, H + r, 16);
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(postGeo, postMat);
      p.position.set(s * (W / 2 + r), (H + r) / 2, 0);
      p.castShadow = true;
      this.group.add(p);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, W + 4 * r, 16), postMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, H + r / 2, 0);
    bar.castShadow = true;
    this.group.add(bar);

    // Thin back supports
    const supMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.6 });
    const supGeo = new THREE.CylinderGeometry(0.025, 0.025, 1, 8);
    const addSupport = (a, b) => {
      const m = new THREE.Mesh(supGeo, supMat);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      m.position.copy(mid);
      m.scale.y = a.distanceTo(b);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      this.group.add(m);
    };
    for (const s of [-1, 1]) {
      const x = s * (W / 2 + r);
      addSupport(new THREE.Vector3(x, H, 0), new THREE.Vector3(x, H, dir * D));
      addSupport(new THREE.Vector3(x, H, dir * D), new THREE.Vector3(x, 0, dir * D));
    }

    // Nets
    const baseTex = makeNetTexture();
    const cell = 0.14;
    const netMat = (w, h) => {
      const t = baseTex.clone();
      t.needsUpdate = true;
      t.repeat.set(w / cell, h / cell);
      return new THREE.MeshStandardMaterial({
        map: t,
        transparent: true,
        alphaTest: 0.35,
        side: THREE.DoubleSide,
        roughness: 1,
        depthWrite: false,
      });
    };

    // Back (rippling)
    this.backGeo = new THREE.PlaneGeometry(W, H, 28, 12);
    this.backBase = this.backGeo.attributes.position.array.slice();
    const back = new THREE.Mesh(this.backGeo, netMat(W, H));
    back.position.set(0, H / 2, dir * D);
    this.back = back;
    this.group.add(back);

    // Top
    const top = new THREE.Mesh(new THREE.PlaneGeometry(W, D), netMat(W, D));
    top.rotation.x = Math.PI / 2;
    top.position.set(0, H, (dir * D) / 2);
    this.group.add(top);

    // Sides
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(D, H), netMat(D, H));
      side.rotation.y = Math.PI / 2;
      side.position.set(s * (W / 2 + r), H / 2, (dir * D) / 2);
      this.group.add(side);
    }
  }

  // x, y are in goal-local coordinates (x across, y height).
  ripple(x, y, strength = 1) {
    this.ripples.push({ x, y: y - PITCH.goalHeight / 2, t: 0, s: strength });
  }

  update(dt) {
    if (!this.ripples.length) return;
    const pos = this.backGeo.attributes.position;
    const arr = pos.array;
    const base = this.backBase;
    for (const r of this.ripples) r.t += dt;
    this.ripples = this.ripples.filter((r) => r.t < 2.5);
    for (let i = 0; i < arr.length; i += 3) {
      const bx = base[i];
      const by = base[i + 1];
      let z = 0;
      for (const r of this.ripples) {
        const dist = Math.hypot(bx - r.x, by - r.y);
        const bulge = Math.exp(-dist * 1.1) * Math.exp(-r.t * 2.2) * 0.9 * r.s;
        const wave = Math.sin(dist * 5 - r.t * 14) * Math.exp(-r.t * 2.5) * 0.12 * r.s * Math.exp(-dist * 0.3);
        z += bulge + wave;
      }
      // Plane faces +Z locally; push outwards (away from pitch).
      arr[i + 2] = z * this.dir;
    }
    pos.needsUpdate = true;
  }
}
