import * as THREE from 'three';
import { KITS } from '../core/config.js';
import { limbGeometry, PROFILES, skinMaterial, fabricMaterial } from '../opponents/HumanBuilder.js';

// First-person weapon models (with the player's hands and sleeves) built from
// primitives. Every model points down -Z (camera forward) and exposes a
// `muzzle` object used for the flash and tracer origin.

const metal = () => new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.35, metalness: 0.8 });
const darkMetal = () => new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.45, metalness: 0.7 });
const polymer = (c = 0x1e1f22) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.1 });
const wood = () => new THREE.MeshStandardMaterial({ color: 0x7a4a24, roughness: 0.6 });

function box(w, h, d, mat, x, y, z, parent, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.x = rx;
  parent.add(m);
  return m;
}
function cyl(r, len, mat, x, y, z, parent, axis = 'z', seg = 14) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

const skinMat = skinMaterial(KITS.player.skin);
const sleeveMat = fabricMaterial(KITS.player.shirt);
const gloveMat = new THREE.MeshPhysicalMaterial({ color: 0x24262b, roughness: 0.75, sheen: 0.5, sheenColor: new THREE.Color(0x555555) });
const unitSphere = new THREE.SphereGeometry(1, 16, 12);
const fingerGeo = new THREE.CapsuleGeometry(0.0095, 0.05, 4, 8);
const knuckleGeo = new THREE.CapsuleGeometry(0.0095, 0.022, 4, 8);

// A gloved hand gripping at `pos`, with a muscle-shaped forearm reaching back
// to `elbow` and a sleeve over it (all in weapon space). `side` −1 = left hand.
function arm(parent, pos, elbow, side = 1) {
  const g = new THREE.Group();
  // back of the hand / palm (fingerless tactical glove)
  const palm = new THREE.Mesh(unitSphere, gloveMat);
  palm.scale.set(0.038, 0.048, 0.05);
  palm.position.copy(pos).add(new THREE.Vector3(side * 0.012, 0.0, 0.012));
  g.add(palm);
  // four fingers wrapped around the grip, plus the bare fingertips
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(fingerGeo, gloveMat);
    f.rotation.z = Math.PI / 2;
    f.position.copy(pos).add(new THREE.Vector3(-side * 0.006, 0.026 - i * 0.021, -0.034));
    g.add(f);
    const tip = new THREE.Mesh(knuckleGeo, skinMat);
    tip.rotation.x = Math.PI / 2;
    tip.position.copy(pos).add(new THREE.Vector3(-side * 0.034, 0.026 - i * 0.021, -0.02));
    g.add(tip);
  }
  // thumb over the top of the grip
  const thumb = new THREE.Mesh(fingerGeo, skinMat);
  thumb.rotation.x = Math.PI / 2 - 0.4;
  thumb.position.copy(pos).add(new THREE.Vector3(-side * 0.03, 0.045, -0.01));
  g.add(thumb);
  // forearm (thick at the elbow, thin at the wrist)
  const wrist = pos.clone().add(new THREE.Vector3(side * 0.01, -0.02, 0.05));
  const len = wrist.distanceTo(elbow);
  const fore = new THREE.Mesh(limbGeometry(PROFILES.forearm, len, 1.15), skinMat);
  fore.position.copy(elbow);
  fore.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), wrist.clone().sub(elbow).normalize());
  g.add(fore);
  // sleeve over the elbow end
  const sl = new THREE.Mesh(limbGeometry([[0, 0.07], [1, 0.064]], len * 0.45, 1), sleeveMat);
  sl.position.copy(elbow);
  sl.quaternion.copy(fore.quaternion);
  g.add(sl);
  parent.add(g);
  return g;
}

function finish(group, muzzleZ, muzzleY = 0) {
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, muzzleY, muzzleZ);
  group.add(muzzle);
  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  return muzzle;
}

export function buildPistol() {
  const g = new THREE.Group();
  const m = metal();
  const p = polymer();
  box(0.036, 0.042, 0.2, m, 0, 0.02, -0.02, g); // slide
  box(0.033, 0.03, 0.17, p, 0, -0.012, -0.005, g); // frame
  box(0.032, 0.11, 0.05, p, 0, -0.075, 0.06, g, 0.25); // grip
  cyl(0.008, 0.02, darkMetal(), 0, 0.022, -0.125, g); // barrel tip
  box(0.006, 0.01, 0.01, m, 0, 0.046, -0.11, g); // front sight
  box(0.022, 0.01, 0.012, m, 0, 0.046, 0.07, g); // rear sight
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 6, 12, Math.PI), p);
  guard.rotation.set(0, Math.PI / 2, Math.PI);
  guard.position.set(0, -0.03, 0.02);
  g.add(guard);
  arm(g, new THREE.Vector3(0.005, -0.08, 0.07), new THREE.Vector3(0.12, -0.32, 0.5));
  arm(g, new THREE.Vector3(-0.03, -0.09, 0.05), new THREE.Vector3(-0.28, -0.34, 0.42), -1);
  const muzzle = finish(g, -0.14, 0.022);
  return { group: g, muzzle, rest: new THREE.Vector3(0.17, -0.18, -0.4), flashScale: 0.18 };
}

export function buildShotgun() {
  const g = new THREE.Group();
  const m = darkMetal();
  const w = wood();
  cyl(0.017, 0.62, m, 0, 0.02, -0.33, g); // barrel
  cyl(0.014, 0.5, metal(), 0, -0.016, -0.28, g); // tube
  const pump = cyl(0.03, 0.17, w, 0, -0.014, -0.3, g); // pump
  pump.name = 'pump';
  box(0.05, 0.075, 0.2, m, 0, 0.005, 0.05, g); // receiver
  box(0.045, 0.085, 0.3, w, 0, -0.04, 0.3, g, -0.12); // stock
  box(0.035, 0.09, 0.05, w, 0, -0.07, 0.15, g, 0.35); // grip
  box(0.006, 0.012, 0.01, metal(), 0, 0.042, -0.62, g); // bead sight
  arm(g, new THREE.Vector3(0.0, -0.08, 0.16), new THREE.Vector3(0.14, -0.3, 0.6));
  const left = arm(g, new THREE.Vector3(-0.01, -0.05, -0.3), new THREE.Vector3(-0.3, -0.34, 0.15), -1);
  const muzzle = finish(g, -0.65, 0.02);
  return { group: g, muzzle, rest: new THREE.Vector3(0.18, -0.2, -0.38), flashScale: 0.42, pump, leftArm: left };
}

export function buildRifle() {
  const g = new THREE.Group();
  const m = darkMetal();
  const tan = polymer(0x8b7a5a);
  const p = polymer();
  box(0.05, 0.075, 0.32, m, 0, 0, 0, g); // receiver
  box(0.058, 0.065, 0.24, tan, 0, 0.0, -0.27, g); // handguard
  cyl(0.011, 0.2, m, 0, 0.005, -0.48, g); // barrel
  cyl(0.018, 0.05, m, 0, 0.005, -0.6, g); // flash hider
  box(0.036, 0.15, 0.065, p, 0, -0.1, -0.06, g, 0.22); // magazine
  box(0.034, 0.09, 0.045, p, 0, -0.08, 0.1, g, 0.3); // grip
  box(0.042, 0.08, 0.22, tan, 0, -0.01, 0.27, g); // stock
  box(0.022, 0.018, 0.3, m, 0, 0.047, -0.05, g); // rail
  box(0.03, 0.035, 0.07, p, 0, 0.07, 0.02, g); // red-dot body
  const dot = box(0.02, 0.02, 0.005, new THREE.MeshBasicMaterial({ color: 0xff3030 }), 0, 0.072, -0.016, g);
  dot.name = 'dot';
  box(0.006, 0.03, 0.006, m, 0, 0.05, -0.37, g); // front post
  arm(g, new THREE.Vector3(0.0, -0.1, 0.11), new THREE.Vector3(0.14, -0.32, 0.55));
  arm(g, new THREE.Vector3(-0.02, -0.05, -0.27), new THREE.Vector3(-0.3, -0.34, 0.12), -1);
  const muzzle = finish(g, -0.63, 0.005);
  return { group: g, muzzle, rest: new THREE.Vector3(0.17, -0.19, -0.36), flashScale: 0.26 };
}

export function buildSniper() {
  const g = new THREE.Group();
  const olive = polymer(0x3d4a2e);
  const m = darkMetal();
  box(0.05, 0.07, 0.3, m, 0, 0, 0, g); // receiver
  cyl(0.013, 0.7, m, 0, 0.01, -0.5, g); // barrel
  cyl(0.022, 0.08, m, 0, 0.01, -0.86, g); // muzzle brake
  box(0.06, 0.07, 0.38, olive, 0, -0.015, -0.2, g); // forestock
  box(0.045, 0.1, 0.32, olive, 0, -0.03, 0.3, g, -0.06); // stock
  box(0.03, 0.04, 0.16, olive, 0, 0.04, 0.3, g); // cheek rest
  box(0.034, 0.09, 0.05, olive, 0, -0.08, 0.12, g, 0.35); // grip
  cyl(0.026, 0.32, m, 0, 0.075, -0.02, g); // scope tube
  cyl(0.034, 0.06, m, 0, 0.075, -0.19, g); // objective bell
  cyl(0.03, 0.05, m, 0, 0.075, 0.15, g); // eyepiece
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 20), new THREE.MeshStandardMaterial({ color: 0x3355ff, emissive: 0x1122aa, metalness: 1, roughness: 0.1 }));
  lens.position.set(0, 0.075, -0.221);
  lens.rotation.y = Math.PI;
  g.add(lens);
  cyl(0.012, 0.04, m, 0, 0.11, -0.02, g, 'y'); // turret
  const bolt = cyl(0.008, 0.06, metal(), 0.04, 0.02, 0.08, g, 'x');
  bolt.name = 'bolt';
  // folded bipod
  for (const s of [-1, 1]) {
    const leg = box(0.01, 0.01, 0.2, metal(), s * 0.018, -0.06, -0.45, g);
    leg.rotation.x = 0.05;
  }
  arm(g, new THREE.Vector3(0.0, -0.1, 0.13), new THREE.Vector3(0.14, -0.32, 0.6));
  arm(g, new THREE.Vector3(-0.02, -0.06, -0.22), new THREE.Vector3(-0.3, -0.34, 0.15), -1);
  const muzzle = finish(g, -0.9, 0.01);
  return { group: g, muzzle, rest: new THREE.Vector3(0.17, -0.2, -0.38), flashScale: 0.45, bolt };
}

export const BUILDERS = { pistol: buildPistol, shotgun: buildShotgun, rifle: buildRifle, sniper: buildSniper };

export function flashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,230,1)');
  grd.addColorStop(0.25, 'rgba(255,210,90,0.9)');
  grd.addColorStop(0.6, 'rgba(255,120,20,0.25)');
  grd.addColorStop(1, 'rgba(255,80,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  // star spikes
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = 'rgba(255,230,150,0.9)';
  g.lineWidth = 6;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.beginPath();
    g.moveTo(64, 64);
    g.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
