import * as THREE from 'three';
import { PITCH } from '../core/config.js';
import { createPitch } from './Pitch.js';
import { Goal } from './Goal.js';
import { Crowd } from './Crowd.js';

// Builds the whole stadium: pitch, goals, stands with spectators, roofs,
// floodlight towers, LED advertising boards, a scoreboard, sky and lights.

const ROWS = 16;
const ROW_DEPTH = 0.85;
const ROW_RISE = 0.48;
const STAND_BASE_H = 1.4;

export class Stadium {
  constructor(scene, renderer) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.time = 0;

    this._sky();
    this._lights();

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ color: 0x1f2a22, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.group.add(ground);

    this.group.add(createPitch(renderer));

    this.targetGoal = new Goal(1);
    this.ownGoal = new Goal(-1);
    this.group.add(this.targetGoal.group, this.ownGoal.group);

    this._cornerFlags();
    this._adBoards();
    const seats = this._stands();
    this.crowd = new Crowd(seats);
    this.group.add(this.crowd.mesh);
    this._floodlights();
    this._scoreboard();
  }

  _sky() {
    const geo = new THREE.SphereGeometry(450, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x040817) },
        mid: { value: new THREE.Color(0x172345) },
        horizon: { value: new THREE.Color(0x4a3560) },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);}`,
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; varying vec3 vP;
        void main(){ float h = clamp(vP.y, 0.0, 1.0);
          vec3 c = mix(horizon, mid, smoothstep(0.0, 0.18, h));
          c = mix(c, top, smoothstep(0.18, 0.7, h));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const sky = new THREE.Mesh(geo, mat);
    this.scene.add(sky);

    const starCount = 900;
    const sp = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.random() * Math.PI * 0.4;
      const r = 430;
      sp[i * 3] = r * Math.sin(ph) * Math.cos(th);
      sp[i * 3 + 1] = r * Math.cos(ph);
      sp[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: false, fog: false }));
    this.scene.add(stars);

    this.scene.fog = new THREE.Fog(0x141a30, 90, 320);
  }

  _lights() {
    const hemi = new THREE.HemisphereLight(0xb8c8ff, 0x2a4a2a, 0.9);
    this.scene.add(hemi);

    // Key light from a floodlight corner, with shadows that follow the player.
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
    sun.position.set(30, 55, -20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -28;
    sc.right = 28;
    sc.top = 28;
    sc.bottom = -28;
    sc.near = 1;
    sc.far = 160;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    const fill = new THREE.DirectionalLight(0xcfd8ff, 0.9);
    fill.position.set(-40, 50, 40);
    this.scene.add(fill);
  }

  setBeams(on) {
    (this.beams || []).forEach((b) => (b.visible = on));
  }

  followShadow(x, z) {
    this.sun.position.set(x + 30, 55, z - 20);
    this.sun.target.position.set(x, 0, z + 8);
  }

  _cornerFlags() {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const flagMat = new THREE.MeshStandardMaterial({ color: 0xffd400, side: THREE.DoubleSide });
    this.flags = [];
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const g = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6), poleMat);
        pole.position.y = 0.75;
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), flagMat);
        flag.position.set(0.2, 1.35, 0);
        g.add(pole, flag);
        g.position.set(sx * PITCH.halfWidth, 0, sz * PITCH.halfLength);
        this.group.add(g);
        this.flags.push(flag);
      }
  }

  _adBoards() {
    const c = document.createElement('canvas');
    c.width = 2048;
    c.height = 64;
    const g = c.getContext('2d');
    const brands = [
      ['KICKSTRIKE', '#ff3b3b', '#111'],
      ['GOAL COLA', '#ffffff', '#c8102e'],
      ['VOLTA BOOTS', '#111', '#c6f000'],
      ['NETBANK', '#ffffff', '#1d4ed8'],
      ['PITCHSIDE TV', '#ffd400', '#111'],
      ['TURBO FUEL', '#ffffff', '#ff6a00'],
      ['STRIKE FORCE FC', '#ffffff', '#0b1f5c'],
      ['HAT-TRICK BURGER', '#111', '#ffd400'],
    ];
    const seg = c.width / brands.length;
    brands.forEach(([t, fg, bg], i) => {
      g.fillStyle = bg;
      g.fillRect(i * seg, 0, seg, 64);
      g.fillStyle = fg;
      g.font = 'bold 34px Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(t, i * seg + seg / 2, 34);
    });
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    this.adTextures = [];
    const mk = (len, x, z, rotY) => {
      const t = tex.clone();
      t.needsUpdate = true;
      t.repeat.set(len / 40, 1);
      this.adTextures.push(t);
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(len, 0.9, 0.15),
        [
          new THREE.MeshStandardMaterial({ color: 0x111111 }),
          new THREE.MeshStandardMaterial({ color: 0x111111 }),
          new THREE.MeshStandardMaterial({ color: 0x111111 }),
          new THREE.MeshStandardMaterial({ color: 0x111111 }),
          new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 1.3 }),
          new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 1.3 }),
        ]
      );
      m.position.set(x, 0.45, z);
      m.rotation.y = rotY;
      m.castShadow = true;
      this.group.add(m);
    };
    const sideX = PITCH.halfWidth + 4;
    const endZ = PITCH.halfLength + 4.5;
    mk(110, sideX, 0, Math.PI / 2);
    mk(110, -sideX, 0, -Math.PI / 2);
    // End boards with a gap behind each goal
    for (const sz of [-1, 1]) {
      mk(28, -22, sz * endZ, 0);
      mk(28, 22, sz * endZ, 0);
    }
  }

  _stands() {
    const seats = [];
    const concrete = new THREE.MeshStandardMaterial({ color: 0x5b6070, roughness: 0.95 });
    const seatA = new THREE.MeshStandardMaterial({ color: 0x1a2c6b, roughness: 0.8 });
    const seatB = new THREE.MeshStandardMaterial({ color: 0x8a1022, roughness: 0.8 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide });

    // A stand is built along local +X (length) and rises along local +Z (away from pitch).
    const build = (length, origin, rotY, bias, seatMat) => {
      const g = new THREE.Group();
      g.position.copy(origin);
      g.rotation.y = rotY;
      for (let r = 0; r < ROWS; r++) {
        const h = STAND_BASE_H + r * ROW_RISE;
        const row = new THREE.Mesh(new THREE.BoxGeometry(length, h, ROW_DEPTH), r % 4 === 3 ? concrete : seatMat);
        row.position.set(0, h / 2, r * ROW_DEPTH + ROW_DEPTH / 2);
        row.receiveShadow = true;
        g.add(row);
        // seats on top of this row
        for (let x = -length / 2 + 0.5; x < length / 2 - 0.4; x += 0.72) {
          if (Math.random() < 0.12) continue;
          const v = new THREE.Vector3(x + (Math.random() - 0.5) * 0.1, h, r * ROW_DEPTH + 0.45);
          v.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY).add(origin);
          seats.push({ x: v.x, y: v.y, z: v.z, bias });
        }
      }
      // Back wall
      const backH = STAND_BASE_H + ROWS * ROW_RISE + 6;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(length, backH, 0.6), concrete);
      wall.position.set(0, backH / 2, ROWS * ROW_DEPTH + 0.3);
      g.add(wall);
      // Front wall (pitch-side)
      const front = new THREE.Mesh(new THREE.BoxGeometry(length, STAND_BASE_H + 0.3, 0.3), concrete);
      front.position.set(0, (STAND_BASE_H + 0.3) / 2, -0.15);
      g.add(front);
      // Roof
      const roofDepth = ROWS * ROW_DEPTH + 4;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(length + 2, 0.4, roofDepth), roofMat);
      roof.position.set(0, backH + 0.2, ROWS * ROW_DEPTH - roofDepth / 2 + 0.6);
      roof.rotation.x = -0.08;
      g.add(roof);
      // Roof lights strip
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(length, 0.15, 0.3),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6dd, emissiveIntensity: 2 })
      );
      strip.position.set(0, backH - 0.3, ROWS * ROW_DEPTH - roofDepth + 1.5);
      g.add(strip);
      this.group.add(g);
    };

    const sideX = PITCH.halfWidth + 8;
    const endZ = PITCH.halfLength + 9;
    // Side stands: local +Z must point away from pitch.
    build(118, new THREE.Vector3(sideX, 0, 0), Math.PI / 2, 'mixed', seatA); // +X side, local Z → +X
    build(118, new THREE.Vector3(-sideX, 0, 0), -Math.PI / 2, 'mixed', seatA); // -X side
    build(2 * sideX, new THREE.Vector3(0, 0, endZ), 0, 'away', seatB); // behind target goal
    build(2 * sideX, new THREE.Vector3(0, 0, -endZ), Math.PI, 'home', seatA); // behind our goal
    return seats;
  }

  _floodlights() {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x8a8f99, metalness: 0.6, roughness: 0.4 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e8, emissiveIntensity: 6 });
    const beamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(0xfff2d6) }, uStrength: { value: 0.07 } },
      vertexShader: `varying float vV; varying vec3 vN; varying vec3 vView;
        void main(){ vV = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0);
          vN = normalize(normalMatrix * normal); vView = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uStrength; varying float vV; varying vec3 vN; varying vec3 vView;
        void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vView))), 2.0);
          float a = pow(vV, 1.6) * edge * uStrength; gl_FragColor = vec4(uColor * a, a);
          #include <colorspace_fragment>
        }`,
    });
    const glowTex = radialTexture();
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const g = new THREE.Group();
        const h = 42;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, h, 10), poleMat);
        pole.position.y = h / 2;
        g.add(pole);
        const head = new THREE.Group();
        head.position.y = h + 2;
        const frame = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 0.6), poleMat);
        head.add(frame);
        for (let i = 0; i < 4; i++)
          for (let j = 0; j < 3; j++) {
            const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 0.2), lampMat);
            lamp.position.set(-2.7 + i * 1.8, -1.5 + j * 1.5, 0.35);
            head.add(lamp);
          }
        const glow = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: glowTex, color: 0xfff3d6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85, fog: false })
        );
        glow.scale.set(30, 30, 1);
        glow.position.z = 1;
        head.add(glow);
        head.lookAt(new THREE.Vector3(-sx * 60, -40, -sz * 80)); // face pitch centre
        g.add(head);
        g.position.set(sx * (PITCH.halfWidth + 26), 0, sz * (PITCH.halfLength + 22));
        this.group.add(g);
        // Volumetric-looking light beam from the lamp head to the pitch
        const from = new THREE.Vector3(g.position.x, h + 2, g.position.z);
        const to = new THREE.Vector3(sx * 12, 0, sz * 22);
        const len = from.distanceTo(to);
        const beamGeo = new THREE.CylinderGeometry(3, 20, len, 32, 1, true);
        beamGeo.translate(0, -len / 2, 0); // top at origin, pointing down -Y
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.copy(from);
        beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
        beam.renderOrder = 2;
        this.group.add(beam);
        (this.beams || (this.beams = [])).push(beam);
      }
  }

  _scoreboard() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 192;
    this.sbCanvas = c;
    this.sbTex = new THREE.CanvasTexture(c);
    this.sbTex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 6),
      new THREE.MeshStandardMaterial({ map: this.sbTex, emissive: 0xffffff, emissiveMap: this.sbTex, emissiveIntensity: 1.1 })
    );
    m.position.set(0, STAND_BASE_H + ROWS * ROW_RISE + 10, PITCH.halfLength + 9 + ROWS * ROW_DEPTH - 1);
    m.rotation.y = Math.PI;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(17, 7, 0.5), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    frame.position.copy(m.position);
    frame.position.z += 0.3;
    this.group.add(frame, m);
    this.setScore(0, 0, "45:00");
  }

  setScore(home, away, clock, flash = false) {
    const g = this.sbCanvas.getContext('2d');
    g.fillStyle = flash ? '#c8102e' : '#05070d';
    g.fillRect(0, 0, 512, 192);
    g.fillStyle = '#ffd400';
    g.font = 'bold 30px Arial, sans-serif';
    g.textAlign = 'center';
    g.fillText(flash ? '⚽  GOAL!  ⚽' : clock, 256, 44);
    g.fillStyle = '#ffffff';
    g.font = 'bold 34px Arial, sans-serif';
    g.textAlign = 'left';
    g.fillText('STRIKERS', 24, 112);
    g.textAlign = 'right';
    g.fillText('REDS', 488, 112);
    g.textAlign = 'center';
    g.font = 'bold 64px Arial, sans-serif';
    g.fillText(`${home} - ${away}`, 256, 170);
    this.sbTex.needsUpdate = true;
  }

  update(dt) {
    this.time += dt;
    this.crowd.update(dt, this.time);
    this.targetGoal.update(dt);
    this.ownGoal.update(dt);
    for (const t of this.adTextures) t.offset.x = (t.offset.x + dt * 0.02) % 1;
    this.flags.forEach((f, i) => (f.rotation.y = Math.sin(this.time * 3 + i) * 0.4));
  }
}

function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, 'rgba(255,245,220,0.6)');
  grd.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export { radialTexture };
