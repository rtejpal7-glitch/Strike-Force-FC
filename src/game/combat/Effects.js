import * as THREE from 'three';
import { radialTexture } from '../environment/Stadium.js';

// Short-lived visual effects: bullet tracers, impact sparks, dust puffs,
// floating damage numbers and goal confetti.

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.glow = radialTexture();
    this.tracerGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 5, 1, true);
    this.tracerGeo.rotateX(Math.PI / 2); // along Z
    this.pending = [];
    this.time = 0;
  }

  // Generic burst of HDR-coloured additive particles (blooms nicely).
  _particleBurst(origin, count, { colors, speed = 8, spread = 1, up = 0, gravity = 6, life = 1.4, size = 0.5, drag = 0 }) {
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const v = [];
    for (let i = 0; i < count; i++) {
      p.set([origin.x, origin.y, origin.z], i * 3);
      const c = colors[(Math.random() * colors.length) | 0];
      col.set([c[0], c[1], c[2]], i * 3);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      dir.x *= spread;
      dir.z *= spread;
      v.push(dir.multiplyScalar(speed * (0.6 + Math.random() * 0.4)).add(new THREE.Vector3(0, up * (0.7 + Math.random() * 0.6), 0)));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: this.glow, fog: false });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this.items.push({ obj: pts, life, max: life, kind: 'particles', vel: v, gravity, drag, noFloor: origin.y > 5 });
  }

  // Fireworks over the stadium roof.
  fireworks(count = 6, audio) {
    const palettes = [
      [[4, 0.6, 0.6], [4, 3, 1]],
      [[0.8, 1.6, 5], [3, 3, 4]],
      [[1, 4, 1.4], [4, 4, 1]],
      [[4, 1, 3.5], [1.5, 1.5, 5]],
      [[5, 3.5, 0.5]],
    ];
    for (let i = 0; i < count; i++) {
      const at = this.time + i * 0.45 + Math.random() * 0.3;
      const pos = new THREE.Vector3((Math.random() - 0.5) * 120, 38 + Math.random() * 22, (Math.random() - 0.5) * 140);
      const colors = palettes[(Math.random() * palettes.length) | 0];
      this.pending.push({ at, fn: () => this._particleBurst(pos, 140, { colors, speed: 14, gravity: 4, life: 2.2, size: 0.9, drag: 1.2 }) });
      audio?.firework(i * 0.45);
    }
  }

  // Flame jets at the four corners of the pitch.
  pyro(points) {
    const colors = [[6, 2.2, 0.4], [5, 1.2, 0.2], [6, 4, 1.2]];
    for (const pt of points) {
      for (let k = 0; k < 3; k++) {
        this.pending.push({ at: this.time + k * 0.12, fn: () => this._particleBurst(pt, 70, { colors, speed: 1.6, spread: 1, up: 13, gravity: 9, life: 1.3, size: 0.7, drag: 0.5 }) });
      }
    }
  }

  tracer(from, to, color = 0xffe08a) {
    const len = from.distanceTo(to);
    if (len < 0.1) return;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(this.tracerGeo, mat);
    m.position.copy(from).lerp(to, 0.5);
    m.scale.set(1, 1, len);
    m.lookAt(to);
    this.scene.add(m);
    this.items.push({ obj: m, life: 0.07, max: 0.07, kind: 'fade' });
  }

  sparks(pos, color = 0xffd27a, count = 10, speed = 3) {
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3);
    const v = [];
    for (let i = 0; i < count; i++) {
      p.set([pos.x, pos.y, pos.z], i * 3);
      v.push(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2).multiplyScalar(speed));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const mat = new THREE.PointsMaterial({ color, size: 0.06, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this.items.push({ obj: pts, life: 0.45, max: 0.45, kind: 'particles', vel: v, gravity: 9 });
    // bright pop
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.copy(pos);
    s.scale.setScalar(0.5);
    this.scene.add(s);
    this.items.push({ obj: s, life: 0.1, max: 0.1, kind: 'pop', base: 0.5 });
  }

  dust(pos) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0x9c8b6a, transparent: true, depthWrite: false, opacity: 0.6 }));
    s.position.copy(pos);
    s.position.y = Math.max(0.1, pos.y);
    s.scale.setScalar(0.3);
    this.scene.add(s);
    this.items.push({ obj: s, life: 0.6, max: 0.6, kind: 'puff', base: 0.3 });
    this.sparks(pos, 0x8f7f5e, 6, 1.5);
  }

  damageNumber(pos, amount, head = false, kill = false) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 64;
    const g = c.getContext('2d');
    g.font = `900 ${head ? 46 : 38}px Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 7;
    g.strokeStyle = 'rgba(0,0,0,0.85)';
    const txt = String(Math.round(amount));
    g.strokeText(txt, 64, 34);
    g.fillStyle = kill ? '#ff4d4d' : head ? '#ffd400' : '#ffffff';
    g.fillText(txt, 64, 34);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    s.renderOrder = 20;
    s.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.2, 0));
    const sc = head ? 0.75 : 0.6;
    s.scale.set(sc, sc / 2, 1);
    this.scene.add(s);
    this.items.push({ obj: s, life: 0.9, max: 0.9, kind: 'number', rise: 1.2 });
  }

  burst(pos, color = 0xffffff) {
    // Ball being shot out of the air
    this.sparks(pos, color, 22, 5);
    this.sparks(pos, 0xffd27a, 10, 3);
  }

  confetti(center, count = 900) {
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const v = [];
    const palette = [0x1d4ed8, 0xffffff, 0xffd400, 0x3ddc84, 0xff4d4d, 0x60a5fa].map((h) => new THREE.Color(h));
    for (let i = 0; i < count; i++) {
      p.set([center.x + (Math.random() - 0.5) * 30, center.y + 6 + Math.random() * 14, center.z + (Math.random() - 0.5) * 25], i * 3);
      const c = palette[(Math.random() * palette.length) | 0];
      col.set([c.r, c.g, c.b], i * 3);
      v.push(new THREE.Vector3((Math.random() - 0.5) * 1.5, -1.2 - Math.random() * 1.5, (Math.random() - 0.5) * 1.5));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, depthWrite: false });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this.items.push({ obj: pts, life: 9, max: 9, kind: 'particles', vel: v, gravity: 0, flutter: true });
  }

  update(dt) {
    this.time += dt;
    if (this.pending.length) {
      const due = this.pending.filter((p) => p.at <= this.time);
      if (due.length) {
        this.pending = this.pending.filter((p) => p.at > this.time);
        due.forEach((p) => p.fn());
      }
    }
    const t = performance.now() * 0.001;
    for (const it of this.items) {
      it.life -= dt;
      const k = Math.max(0, it.life / it.max);
      const o = it.obj;
      switch (it.kind) {
        case 'fade':
          o.material.opacity = k;
          break;
        case 'pop':
          o.scale.setScalar(it.base * (1 + (1 - k) * 1.5));
          o.material.opacity = k;
          break;
        case 'puff':
          o.scale.setScalar(it.base * (1 + (1 - k) * 4));
          o.material.opacity = 0.6 * k;
          o.position.y += dt * 0.4;
          break;
        case 'number':
          o.position.y += it.rise * dt;
          o.material.opacity = Math.min(1, k * 2);
          break;
        case 'particles': {
          const arr = o.geometry.attributes.position.array;
          it.vel.forEach((v, i) => {
            v.y -= it.gravity * dt;
            if (it.drag) v.multiplyScalar(Math.exp(-it.drag * dt));
            let fx = 0;
            if (it.flutter) fx = Math.sin(t * 3 + i) * 0.6;
            arr[i * 3] += (v.x + fx) * dt;
            arr[i * 3 + 1] += v.y * dt;
            arr[i * 3 + 2] += v.z * dt;
            if (!it.noFloor && arr[i * 3 + 1] < 0.02) {
              arr[i * 3 + 1] = 0.02;
              v.set(0, 0, 0);
            }
          });
          o.geometry.attributes.position.needsUpdate = true;
          o.material.opacity = Math.min(1, k * 3);
          break;
        }
        default:
      }
    }
    const dead = this.items.filter((it) => it.life <= 0);
    if (dead.length) {
      for (const it of dead) {
        this.scene.remove(it.obj);
        if (it.obj.isPoints) it.obj.geometry.dispose();
        if (it.obj.material) {
          it.obj.material.map && it.obj.material.map !== this.glow && it.obj.material.map.dispose();
          it.obj.material.dispose();
        }
      }
      this.items = this.items.filter((it) => it.life > 0);
    }
  }

  clear() {
    for (const it of this.items) this.scene.remove(it.obj);
    this.items = [];
    this.pending = [];
  }
}
