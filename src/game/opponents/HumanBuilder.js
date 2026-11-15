import * as THREE from 'three';

// Procedural "realistic" human parts. Everything is generated in code (no
// assets): muscle-shaped limbs from lathe profiles, a sculpted head with real
// eyes, lids, nose, lips and ears, hair and beard shells grown from the scalp,
// hands with fingers, shaped boots with studs, and fabric kits with a knit
// normal map and printed name/number.

// ---------------------------------------------------------------- utilities
const cache = new Map();
function once(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// Resample [t, r] keyframes (t 0 = top, 1 = bottom) into evenly spaced lathe points
// (bottom → top, as LatheGeometry expects for outward normals).
function profilePoints(keys, length, radiusScale, samples = 14) {
  const pts = [];
  for (let i = samples; i >= 0; i--) {
    const t = i / samples;
    let k = 0;
    while (k < keys.length - 2 && keys[k + 1][0] < t) k++;
    const [t0, r0] = keys[k];
    const [t1, r1] = keys[k + 1];
    const u = t1 > t0 ? smooth(0, 1, (t - t0) / (t1 - t0)) : 0;
    pts.push(new THREE.Vector2(lerp(r0, r1, u) * radiusScale, -t * length));
  }
  return pts;
}

// A limb whose top is at the origin and which hangs down -Y.
export function limbGeometry(keys, length, radiusScale = 1, depthScale = 1, radial = 18) {
  const g = new THREE.LatheGeometry(profilePoints(keys, length, radiusScale), radial);
  if (depthScale !== 1) g.scale(1, 1, depthScale);
  return g;
}

export function jointGeometry(r) {
  return new THREE.SphereGeometry(r, 16, 12);
}

// ---------------------------------------------------------------- textures
export function knitNormalMap() {
  return once('knit', () => {
    const S = 128;
    const h = new Float32Array(S * S);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        // interlocking knit loops
        const cx = (x % 8) - 4;
        const cy = ((y + (Math.floor(x / 8) % 2) * 4) % 8) - 4;
        h[y * S + x] = Math.exp(-(cx * cx * 0.25 + cy * cy * 0.12)) + Math.random() * 0.08;
      }
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const dx = h[y * S + ((x + 1) % S)] - h[y * S + ((x - 1 + S) % S)];
        const dy = h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x];
        const n = new THREE.Vector3(-dx * 2, -dy * 2, 1).normalize();
        const i = (y * S + x) * 4;
        img.data[i] = (n.x * 0.5 + 0.5) * 255;
        img.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
        img.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
        img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(10, 10);
    return t;
  });
}

function hex(c) {
  return '#' + (c >>> 0).toString(16).padStart(6, '0').slice(-6);
}
// scale an 0xRRGGBB colour's brightness (plain maths, no THREE.Color needed)
function shade(c, k) {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * k));
  const b = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | b;
}

// Shirt texture laid out for the torso lathe: u = around (0 = front), v = height.
export function shirtTexture({ shirt, trim, number, name, sponsor, yToV }) {
  const W = 512;
  const Hh = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = Hh;
  const g = c.getContext('2d');
  // base with subtle fabric shading (darker at the sides)
  const grd = g.createLinearGradient(0, 0, W, 0);
  const dark = shade(shirt, 0.78);
  grd.addColorStop(0, hex(shirt));
  grd.addColorStop(0.25, hex(dark));
  grd.addColorStop(0.5, hex(shirt));
  grd.addColorStop(0.75, hex(dark));
  grd.addColorStop(1, hex(shirt));
  g.fillStyle = grd;
  g.fillRect(0, 0, W, Hh);
  // side panels
  g.fillStyle = hex(trim);
  g.globalAlpha = 0.85;
  g.fillRect(W * 0.24, 0, W * 0.02, Hh);
  g.fillRect(W * 0.74, 0, W * 0.02, Hh);
  g.globalAlpha = 1;
  // collar band
  g.fillRect(0, 0, W, Hh * 0.035);
  const vy = (y) => (1 - yToV(y)) * Hh; // canvas y for a torso height (0..1 of shirt)
  // back: name + number (u = 0.5)
  g.fillStyle = hex(trim);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${Hh * 0.05}px Arial, sans-serif`;
  g.fillText(name.toUpperCase(), W * 0.5, vy(0.8));
  g.font = `bold ${Hh * 0.24}px Arial, sans-serif`;
  g.fillText(String(number), W * 0.5, vy(0.58));
  // front: sponsor across the chest (wraps around u = 0), crest on the left chest, small number on the right
  g.font = `bold ${Hh * 0.05}px Arial, sans-serif`;
  for (const x of [0, W]) g.fillText(sponsor, x, vy(0.62));
  g.beginPath();
  g.arc(W * 0.075, vy(0.78), Hh * 0.025, 0, Math.PI * 2);
  g.fill();
  g.font = `bold ${Hh * 0.045}px Arial, sans-serif`;
  g.fillText(String(number), W * 0.925, vy(0.78));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function eyeTexture(irisColor) {
  return once('eye' + irisColor, () => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#f2ece4';
    g.fillRect(0, 0, 256, 128);
    // faint veins
    g.strokeStyle = 'rgba(190,80,80,0.25)';
    for (let i = 0; i < 14; i++) {
      g.beginPath();
      const x = Math.random() * 256;
      g.moveTo(x, Math.random() * 128);
      g.quadraticCurveTo(x + 20, 64, 64, 64);
      g.stroke();
    }
    // iris centred at u = 0.25 (sphere front)
    const cx = 64;
    const cy = 64;
    const ir = g.createRadialGradient(cx, cy, 2, cx, cy, 20);
    ir.addColorStop(0, '#000');
    ir.addColorStop(0.32, '#000');
    ir.addColorStop(0.36, hex(shade(irisColor, 0.6)));
    ir.addColorStop(0.75, hex(irisColor));
    ir.addColorStop(0.95, hex(shade(irisColor, 0.35)));
    ir.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = ir;
    g.beginPath();
    g.arc(cx, cy, 20, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.arc(cx - 5, cy - 6, 3, 0, Math.PI * 2);
    g.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

function strandTexture(alpha = false) {
  return once('strand' + alpha, () => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    if (!alpha) {
      g.fillStyle = '#9a9a9a';
      g.fillRect(0, 0, 256, 256);
    }
    for (let i = 0; i < 2600; i++) {
      const v = alpha ? 255 : 110 + Math.random() * 145;
      g.strokeStyle = `rgba(${v},${v},${v},${alpha ? 0.5 + Math.random() * 0.5 : 0.6})`;
      g.lineWidth = alpha ? 1.4 : 1;
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (Math.random() - 0.5) * 4, y + (alpha ? 3 : 10 + Math.random() * 14));
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 3);
    return t;
  });
}

function bootTexture(color, stripe) {
  return once(`boot${color}-${stripe}`, () => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = hex(color);
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = hex(stripe);
    // generic diagonal side stripes on both sides of the boot (u≈0 and u≈0.5)
    for (const cx of [0, 128, 256]) {
      for (let k = -1; k <= 1; k++) {
        g.beginPath();
        g.moveTo(cx - 26 + k * 12, 92);
        g.lineTo(cx - 18 + k * 12, 92);
        g.lineTo(cx + 22 + k * 12, 48);
        g.lineTo(cx + 14 + k * 12, 48);
        g.fill();
      }
    }
    // toe cap
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(48, 0, 32, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

// ---------------------------------------------------------------- materials
export function skinMaterial(color) {
  const c = new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({
    color: c,
    roughness: 0.52,
    sheen: 0.45,
    sheenRoughness: 0.6,
    sheenColor: c.clone().lerp(new THREE.Color(0xff9a7a), 0.5),
  });
}

export function fabricMaterial(color, map = null) {
  return new THREE.MeshPhysicalMaterial({
    color: map ? 0xffffff : color,
    map,
    roughness: 0.78,
    normalMap: knitNormalMap(),
    normalScale: new THREE.Vector2(0.35, 0.35),
    sheen: 0.7,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color(0xffffff).multiplyScalar(0.35),
  });
}

// ---------------------------------------------------------------- head
// Sculpts a sphere into a human head. Returns { geometry, dirs } where dirs
// holds each vertex's original unit direction (used to grow hair/beard shells).
function sculptHead(R, face = {}) {
  const jaw = face.jaw ?? 1;
  const nose = face.nose ?? 1;
  const g = new THREE.SphereGeometry(R, 44, 34);
  g.rotateY(-Math.PI / 2); // put the UV seam at the back of the head
  const p = g.attributes.position;
  const dirs = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    dirs.set([v.x, v.y, v.z], i * 3);
    let { x, y, z } = v;
    // jaw taper towards the chin
    if (y < 0) x *= 1 - 0.36 * y * y * (2 - jaw);
    // chin
    if (z > 0 && y < -0.5) z += 0.06 * smooth(-0.5, -0.85, y) * (1 - Math.abs(x) * 2);
    // fuller skull at the back
    if (z < 0 && y > -0.35) z *= 1.07;
    // flatter face
    if (z > 0.5) z = 0.5 + (z - 0.5) * 0.86;
    if (z > 0) {
      for (const s of [-1, 1]) {
        // eye sockets
        const de = (x - s * 0.3) ** 2 + (y - 0.12) ** 2;
        z -= 0.065 * Math.exp(-de / 0.009);
        // cheekbones
        const dc = (x - s * 0.52) ** 2 + (y + 0.04) ** 2;
        x += s * 0.03 * Math.exp(-dc / 0.02);
        z += 0.02 * Math.exp(-dc / 0.02);
      }
      // brow ridge and nose bridge
      z += 0.035 * Math.exp(-((y - 0.27) ** 2) / 0.004 - (x * x) / 0.14);
      z += 0.05 * nose * Math.exp(-(x * x) / 0.004 - ((y - 0.05) ** 2) / 0.02);
      // mouth area slightly forward, philtrum groove
      z += 0.025 * Math.exp(-(x * x) / 0.05 - ((y + 0.42) ** 2) / 0.01);
    }
    p.setXYZ(i, x * 0.8 * R, y * 1.1 * R, z * 0.95 * R);
  }
  g.computeVertexNormals();
  return { geometry: g, dirs };
}

// Grow a shell over the part of the head where `test(dir)` is true.
function shellFrom(head, test, offset) {
  const { geometry: g, dirs } = head;
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = g.attributes.uv;
  const idx = g.index.array;
  const keep = [];
  const inside = new Uint8Array(pos.count);
  for (let i = 0; i < pos.count; i++) inside[i] = test(dirs[i * 3], dirs[i * 3 + 1], dirs[i * 3 + 2]) ? 1 : 0;
  for (let i = 0; i < idx.length; i += 3) {
    if (inside[idx[i]] && inside[idx[i + 1]] && inside[idx[i + 2]]) keep.push(idx[i], idx[i + 1], idx[i + 2]);
  }
  const out = new THREE.BufferGeometry();
  const P = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const off = typeof offset === 'function' ? offset(dirs[i * 3], dirs[i * 3 + 1], dirs[i * 3 + 2]) : offset;
    P[i * 3] = pos.getX(i) + nor.getX(i) * off;
    P[i * 3 + 1] = pos.getY(i) + nor.getY(i) * off;
    P[i * 3 + 2] = pos.getZ(i) + nor.getZ(i) * off;
  }
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', nor.clone());
  out.setAttribute('uv', uv.clone());
  out.setIndex(keep);
  return out;
}

const hairline = (x, y, z) => y > lerp(-0.42, 0.5, smooth(-0.55, 0.65, z)) && !(Math.abs(x) > 0.82 && y < 0.25);

export function buildHead({ skin, skinMat, hairColor, hairStyle, eyes = 0x5a3b1f, face = {}, keeper = false, headband }) {
  const R = 0.115;
  const group = new THREE.Group();
  const head = sculptHead(R, face);
  const headMesh = new THREE.Mesh(head.geometry, skinMat);
  headMesh.castShadow = true;
  group.add(headMesh);

  const sc = new THREE.Color(skin);
  const lipMat = new THREE.MeshPhysicalMaterial({ color: sc.clone().lerp(new THREE.Color(0xa0443c), 0.45), roughness: 0.35, clearcoat: 0.3 });
  const eyeMat = new THREE.MeshPhysicalMaterial({ map: eyeTexture(eyes), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, map: strandTexture(false), roughness: 0.55, metalness: 0.05 });
  const browMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.8 });
  const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    group.add(m);
    return m;
  };
  const unit = once('unitSphere', () => new THREE.SphereGeometry(1, 16, 12));

  // Eyes with upper lids
  for (const s of [-1, 1]) {
    const ex = s * 0.0276;
    const ey = 0.0152;
    const eyeball = add(once('eyeball', () => new THREE.SphereGeometry(0.0118, 20, 14)), eyeMat, ex, ey, 0.0855);
    eyeball.rotation.y = s * -0.05;
    const lid = add(once('lid', () => new THREE.SphereGeometry(0.0132, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.42)), skinMat, ex, ey + 0.0005, 0.0855);
    lid.rotation.x = 0.5;
    const lower = add(once('lowlid', () => new THREE.SphereGeometry(0.0128, 18, 6, 0, Math.PI * 2, Math.PI * 0.72, Math.PI * 0.28)), skinMat, ex, ey, 0.0855);
    lower.rotation.x = -0.2;
    // eyebrow
    const brow = add(once('brow', () => new THREE.CapsuleGeometry(0.0032 * (face.brow ?? 1), 0.022, 3, 6)), browMat, s * 0.029, 0.034, 0.0985);
    brow.rotation.z = Math.PI / 2 + s * 0.12;
  }
  // Nose: bridge, tip and nostril wings
  const nz = face.nose ?? 1;
  add(unit, skinMat, 0, -0.004, 0.1, 0.0095 * nz, 0.024 * nz, 0.014 * nz).rotation.x = -0.25;
  add(unit, skinMat, 0, -0.021, 0.1105, 0.0105 * nz, 0.0095 * nz, 0.0095 * nz);
  for (const s of [-1, 1]) add(unit, skinMat, s * 0.0115 * nz, -0.024, 0.104, 0.0075, 0.0068, 0.0075);
  // Lips
  add(unit, lipMat, 0, -0.0445, 0.0985, 0.0205, 0.0052, 0.008);
  add(unit, lipMat, 0, -0.0525, 0.0965, 0.0185, 0.0062, 0.0085);
  // Ears
  for (const s of [-1, 1]) {
    const ear = add(unit, skinMat, s * 0.0915, 0.004, -0.004, 0.009, 0.027, 0.018);
    ear.rotation.y = s * 0.35;
    add(unit, skinMat, s * 0.096, 0.004, -0.002, 0.004, 0.017, 0.01);
  }

  // Facial hair
  const beard = face.beard || 'none';
  if (beard !== 'none') {
    const mouthHole = (x, y, z) => z > 0.6 && Math.abs(x) < 0.27 && y < -0.36 && y > -0.5;
    let test;
    if (beard === 'goatee') test = (x, y, z) => z > 0.55 && Math.abs(x) < 0.35 && y < -0.28 && !mouthHole(x, y, z);
    else test = (x, y, z) => y < -0.1 && z > -0.3 && !(z > 0.55 && y > -0.3 && Math.abs(x) < 0.55) && !mouthHole(x, y, z);
    const full = beard === 'beard' || beard === 'goatee';
    const g = shellFrom(head, test, full ? 0.0045 : 0.0012);
    const m = new THREE.Mesh(
      g,
      new THREE.MeshStandardMaterial({
        color: hairColor,
        map: full ? strandTexture(false) : null,
        alphaMap: strandTexture(true),
        transparent: true,
        opacity: full ? 1 : 0.55,
        roughness: 0.8,
        depthWrite: full,
      })
    );
    group.add(m);
  }

  // Hair
  const style = hairStyle || 'short';
  const shell = (test, off, mat = hairMat) => {
    const m = new THREE.Mesh(shellFrom(head, test, off), mat);
    m.castShadow = true;
    group.add(m);
    return m;
  };
  const buzzMat = new THREE.MeshStandardMaterial({ color: hairColor, alphaMap: strandTexture(true), transparent: true, opacity: 0.9, roughness: 0.9, depthWrite: false });
  if (style === 'buzz') shell(hairline, 0.0015, buzzMat);
  else if (style === 'short') shell(hairline, (x, y, z) => 0.004 + 0.007 * Math.max(0, y));
  else if (style === 'fade') {
    shell(hairline, 0.0015, buzzMat);
    shell((x, y, z) => hairline(x, y, z) && y > 0.38, (x, y) => 0.006 + 0.012 * Math.max(0, y));
  } else if (style === 'long') {
    shell(hairline, (x, y) => 0.008 + 0.008 * Math.max(0, y));
    // locks falling to the nape, tied in a bun
    for (let i = 0; i < 9; i++) {
      const a = (i / 8 - 0.5) * 2.2;
      const lock = add(unit, hairMat, Math.sin(a) * 0.07, -0.04, -0.06 - Math.cos(a) * 0.035, 0.026, 0.075, 0.022);
      lock.rotation.z = -Math.sin(a) * 0.25;
      lock.rotation.x = 0.25;
    }
    add(unit, hairMat, 0, 0.07, -0.118, 0.034, 0.03, 0.03);
  } else if (style === 'mohawk') {
    shell(hairline, 0.0015, buzzMat);
    const cone = once('spike', () => new THREE.ConeGeometry(0.016, 0.055, 8));
    for (let i = 0; i < 9; i++) {
      const a = lerp(0.75, 2.5, i / 8);
      const d = new THREE.Vector3(0, Math.sin(a), Math.cos(a));
      const s = add(cone, hairMat, 0, d.y * 1.1 * R * 1.02, d.z * 0.95 * R * 1.02);
      s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      s.scale.setScalar(1 - Math.abs(i - 4) * 0.07);
    }
  } else if (style === 'curly') {
    shell(hairline, 0.006);
    const curl = once('curl', () => new THREE.SphereGeometry(0.019, 8, 6));
    const { dirs } = head;
    const pos = head.geometry.attributes.position;
    let n = 0;
    for (let i = 0; i < pos.count && n < 90; i += 7) {
      const x = dirs[i * 3];
      const y = dirs[i * 3 + 1];
      const z = dirs[i * 3 + 2];
      if (!hairline(x, y, z) || y < 0.05) continue;
      const c = add(curl, hairMat, pos.getX(i) * 1.12, pos.getY(i) * 1.12, pos.getZ(i) * 1.12);
      c.scale.setScalar(0.8 + Math.random() * 0.5);
      n++;
    }
  }
  if (keeper && headband) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.104, 0.011, 8, 32), headband);
    band.rotation.x = Math.PI / 2 - 0.12;
    band.scale.set(0.84, 1, 1);
    band.position.set(0, 0.045, -0.005);
    group.add(band);
  }

  return { group, headMesh, materials: [lipMat, hairMat, browMat, buzzMat] };
}

// ---------------------------------------------------------------- hands
// Relaxed hand hanging down -Y from the wrist, palm facing inwards (towards -side·X).
export function buildHand(mat, side, { curl = 0.45, scale = 1 } = {}) {
  const hand = new THREE.Group();
  const unit = once('unitSphere', () => new THREE.SphereGeometry(1, 16, 12));
  const palm = new THREE.Mesh(unit, mat);
  palm.scale.set(0.017, 0.046, 0.04);
  palm.position.y = -0.045;
  palm.castShadow = true;
  hand.add(palm);
  const seg1 = once('fing1', () => new THREE.CapsuleGeometry(0.0082, 0.026, 4, 8));
  const seg2 = once('fing2', () => new THREE.CapsuleGeometry(0.0075, 0.02, 4, 8));
  [-0.021, -0.007, 0.007, 0.021].forEach((z, i) => {
    const f = new THREE.Group();
    f.position.set(0, -0.088, z * 1.05);
    f.rotation.z = -side * curl * 0.7; // curl towards the palm side
    hand.add(f);
    const a = new THREE.Mesh(seg1, mat);
    a.position.y = -0.017;
    a.castShadow = true;
    f.add(a);
    const j = new THREE.Group();
    j.position.y = -0.034;
    j.rotation.z = -side * curl;
    f.add(j);
    const b = new THREE.Mesh(seg2, mat);
    b.position.y = -0.013;
    j.add(b);
    const len = [0.92, 1, 0.97, 0.82][i];
    f.scale.setScalar(len);
  });
  const thumb = new THREE.Group();
  thumb.position.set(-side * 0.01, -0.03, 0.03);
  thumb.rotation.set(-0.7, 0, side * 0.35);
  hand.add(thumb);
  const t1 = new THREE.Mesh(seg1, mat);
  t1.position.y = -0.017;
  thumb.add(t1);
  hand.scale.setScalar(scale);
  return { hand, palm };
}

// ---------------------------------------------------------------- boots
export function buildBoot(color, stripe, soleColor = 0x1a1a1a) {
  const foot = new THREE.Group();
  const geo = once('bootGeo', () => {
    const g = new THREE.SphereGeometry(1, 28, 16);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i);
      let y = p.getY(i);
      let z = p.getZ(i);
      const t = (z + 1) / 2; // 0 heel .. 1 toe
      x *= 0.052 * (1 - 0.3 * smooth(0.6, 1, t)) * (0.9 + 0.1 * smooth(0, 0.25, t));
      y = Math.max(y, -0.62) * 0.042 * (1 - 0.45 * smooth(0.45, 1, t) * (y > 0 ? 1 : 0));
      z *= 0.138;
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return g;
  });
  const mat = new THREE.MeshPhysicalMaterial({ map: bootTexture(color, stripe), roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  const upper = new THREE.Mesh(geo, mat);
  upper.position.set(0, -0.025, 0.06);
  upper.castShadow = true;
  foot.add(upper);
  const soleMat = new THREE.MeshStandardMaterial({ color: soleColor, roughness: 0.6 });
  const sole = new THREE.Mesh(once('sole', () => new THREE.CylinderGeometry(1, 1, 0.012, 24)), soleMat);
  sole.scale.set(0.05, 1, 0.135);
  sole.position.set(0, -0.05, 0.06);
  foot.add(sole);
  const stud = once('stud', () => new THREE.CylinderGeometry(0.0055, 0.004, 0.012, 8));
  [[-0.025, 0.14], [0.025, 0.14], [-0.028, 0.085], [0.028, 0.085], [-0.02, -0.03], [0.02, -0.03]].forEach(([x, z]) => {
    const s = new THREE.Mesh(stud, soleMat);
    s.position.set(x, -0.061, z + 0.0);
    foot.add(s);
  });
  return { foot, materials: [mat] };
}

// Standard limb profiles ([t from top, radius]); radius is multiplied by build.
export const PROFILES = {
  thigh: [[0, 0.098], [0.15, 0.101], [0.4, 0.094], [0.7, 0.078], [0.9, 0.064], [1, 0.058]],
  knee: [[0, 0.058], [0.5, 0.06], [1, 0.057]],
  calf: [[0, 0.061], [0.18, 0.068], [0.35, 0.066], [0.55, 0.053], [0.8, 0.041], [1, 0.038]],
  upperArm: [[0, 0.066], [0.15, 0.064], [0.45, 0.059], [0.75, 0.049], [1, 0.045]],
  forearm: [[0, 0.047], [0.22, 0.051], [0.6, 0.04], [0.9, 0.031], [1, 0.029]],
  neck: [[0, 0.056], [0.5, 0.058], [1, 0.064]],
};
