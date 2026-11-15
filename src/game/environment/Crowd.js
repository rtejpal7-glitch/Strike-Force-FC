import * as THREE from 'three';

// Thousands of spectators drawn in one instanced draw call. Each spectator is a
// body + head block; a small shader bobs them and makes them jump when excited.

function boxData(w, h, d, cy, part, out) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const p = g.attributes.position.array;
  const n = g.attributes.normal.array;
  for (let i = 0; i < p.length; i += 3) {
    out.pos.push(p[i], p[i + 1] + cy, p[i + 2]);
    out.nor.push(n[i], n[i + 1], n[i + 2]);
    out.part.push(part);
  }
  g.dispose();
}

const SHIRTS = [0xc8102e, 0xc8102e, 0xffffff, 0x1d4ed8, 0x1d4ed8, 0x1d4ed8, 0xf2c94c, 0x222222, 0x2e7d32, 0x9e9e9e];
const SKINS = [0xf1c9a5, 0xe0b48f, 0xc58c5c, 0x8d5a3b, 0x5c3a28];

export class Crowd {
  constructor(seats) {
    const data = { pos: [], nor: [], part: [] };
    boxData(0.44, 0.55, 0.3, 0.3, 0, data);
    boxData(0.22, 0.24, 0.22, 0.72, 1, data);
    // Raised arms (shown only when cheering): part 2 = left, part 3 = right
    boxData(0.08, 0.38, 0.08, 0.86, 2, data);
    boxData(0.08, 0.38, 0.08, 0.86, 3, data);

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(data.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(data.nor, 3));
    geo.setAttribute('part', new THREE.Float32BufferAttribute(data.part, 1));

    for (let i = seats.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [seats[i], seats[j]] = [seats[j], seats[i]];
    }
    const count = seats.length;
    this.count = count;
    this.geo = geo;
    const offsets = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const skins = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const c = new THREE.Color();
    seats.forEach((s, i) => {
      offsets.set([s.x, s.y, s.z], i * 3);
      // Home end in blue, away end in red, mixed elsewhere.
      let shirt = SHIRTS[(Math.random() * SHIRTS.length) | 0];
      if (s.bias === 'home' && Math.random() < 0.7) shirt = 0x1d4ed8;
      if (s.bias === 'away' && Math.random() < 0.7) shirt = 0xc8102e;
      c.setHex(shirt).convertSRGBToLinear();
      colors.set([c.r, c.g, c.b], i * 3);
      c.setHex(SKINS[(Math.random() * SKINS.length) | 0]).convertSRGBToLinear();
      skins.set([c.r, c.g, c.b], i * 3);
      phases[i] = Math.random();
    });
    geo.setAttribute('offset', new THREE.InstancedBufferAttribute(offsets, 3));
    geo.setAttribute('shirt', new THREE.InstancedBufferAttribute(colors, 3));
    geo.setAttribute('skin', new THREE.InstancedBufferAttribute(skins, 3));
    geo.setAttribute('phase', new THREE.InstancedBufferAttribute(phases, 1));
    geo.instanceCount = count;

    this.uniforms = {
      uTime: { value: 0 },
      uExcite: { value: 0.2 },
      uWave: { value: -1 },
      uFogColor: { value: new THREE.Color(0x141a30) },
      uFogNear: { value: 90 },
      uFogFar: { value: 320 },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute vec3 offset;
        attribute vec3 shirt;
        attribute vec3 skin;
        attribute float phase;
        attribute float part;
        uniform float uTime;
        uniform float uExcite;
        uniform float uWave;
        varying vec3 vColor;
        varying vec3 vNormal;
        varying float vDepth;
        varying float vHide;
        varying float vFlash;
        float hash(float n) { return fract(sin(n) * 43758.5453); }
        void main() {
          float speed = 7.0 + phase * 3.0;
          float jumpers = step(0.45 - uExcite * 0.4, phase);
          float jump = max(0.0, sin(uTime * speed + phase * 40.0)) * uExcite * 0.32 * jumpers;
          float sway = sin(uTime * 1.3 + phase * 20.0) * 0.03;

          // Mexican wave travelling around the bowl
          float waveUp = 0.0;
          if (uWave >= 0.0) {
            float a = atan(offset.z, offset.x) / 6.28318 + 0.5;
            float front = fract(uWave * 0.32);
            float d = abs(fract(a - front + 0.5) - 0.5);
            waveUp = (1.0 - smoothstep(0.0, 0.07, d)) * step(uWave, 6.0);
          }
          jump += waveUp * 0.55;

          vec3 p = position;
          float isArm = step(1.5, part);
          float side = part > 2.5 ? 1.0 : -1.0;
          if (isArm > 0.5) {
            p.x += 0.26 * side;
            // wave the arms side to side
            p.x += sin(uTime * 9.0 + phase * 30.0) * 0.06 * (p.y - 0.67) * 4.0;
          }
          float armsUp = max(uExcite * jumpers, waveUp);
          vHide = isArm * step(armsUp, 0.35);
          p += offset + vec3(sway, jump, 0.0);
          vColor = part < 0.5 ? shirt : (part < 1.5 ? skin : shirt);

          // Phone-camera flashes, more of them when the crowd is excited
          float slot = floor(uTime * 7.0);
          float chance = 0.9993 - uExcite * 0.006;
          vFlash = step(chance, hash(slot * 13.17 + phase * 9137.0)) * step(0.5, part) * step(part, 1.5);

          vNormal = normal;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uFogColor;
        uniform float uFogNear;
        uniform float uFogFar;
        varying vec3 vColor;
        varying vec3 vNormal;
        varying float vDepth;
        varying float vHide;
        varying float vFlash;
        void main() {
          if (vHide > 0.5) discard;
          vec3 L = normalize(vec3(0.3, 0.9, 0.25));
          float diff = max(dot(normalize(vNormal), L), 0.0) * 0.7 + 0.35;
          vec3 col = vColor * diff;
          float f = smoothstep(uFogNear, uFogFar, vDepth);
          col = mix(col, uFogColor, f);
          col = mix(col, vec3(9.0), vFlash);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.excite = 0.2;
    this.target = 0.2;
  }

  setDensity(f) {
    this.geo.instanceCount = Math.max(1, Math.floor(this.count * f));
  }

  setExcitement(v) {
    this.target = v;
  }

  // Start a Mexican wave (runs for ~6 seconds).
  startWave() {
    this.waveT = 0;
  }

  update(dt, t) {
    this.excite += (this.target - this.excite) * Math.min(1, dt * 2);
    this.uniforms.uTime.value = t;
    this.uniforms.uExcite.value = this.excite;
    if (this.waveT !== undefined && this.waveT !== null) {
      this.waveT += dt;
      this.uniforms.uWave.value = this.waveT;
      if (this.waveT > 6.2) {
        this.waveT = null;
        this.uniforms.uWave.value = -1;
      }
    }
  }
}
