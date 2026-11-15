import * as THREE from 'three';
import { PITCH } from '../core/config.js';

// The pitch is a single plane with a canvas-drawn texture: mown stripes,
// grass grain and every regulation marking drawn at real-world scale.

const RUNOFF_X = 5;
const RUNOFF_Z = 5;

export function createPitch(renderer) {
  const widthM = PITCH.width + RUNOFF_X * 2; // world X
  const lengthM = PITCH.length + RUNOFF_Z * 2; // world Z
  const pxPerM = 19;
  const W = Math.round(widthM * pxPerM);
  const H = Math.round(lengthM * pxPerM);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Stripes (bands across the width, alternating along the length)
  const band = PITCH.length / 20;
  for (let i = -2; i < 22; i++) {
    const z0 = -PITCH.halfLength + i * band;
    ctx.fillStyle = i % 2 === 0 ? '#3f8f3a' : '#367f33';
    ctx.fillRect(0, (z0 + lengthM / 2) * pxPerM, W, band * pxPerM + 1);
  }

  // Grass grain
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 18;
    d[i] += n * 0.6;
    d[i + 1] += n;
    d[i + 2] += n * 0.5;
  }
  ctx.putImageData(img, 0, 0);

  // Markings, drawn in metres with origin at the centre spot.
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(pxPerM, pxPerM);
  ctx.strokeStyle = 'rgba(245,245,240,0.95)';
  ctx.fillStyle = 'rgba(245,245,240,0.95)';
  ctx.lineWidth = 0.13;

  const hx = PITCH.halfWidth;
  const hz = PITCH.halfLength;
  ctx.strokeRect(-hx, -hz, PITCH.width, PITCH.length);
  line(ctx, -hx, 0, hx, 0);
  circle(ctx, 0, 0, 9.15);
  dot(ctx, 0, 0, 0.22);

  for (const s of [-1, 1]) {
    const gl = s * hz;
    // Penalty area 40.32 x 16.5
    ctx.strokeRect(-20.16, s > 0 ? gl - 16.5 : gl, 40.32, 16.5);
    // Goal area 18.32 x 5.5
    ctx.strokeRect(-9.16, s > 0 ? gl - 5.5 : gl, 18.32, 5.5);
    // Penalty spot + arc
    const spot = gl - s * 11;
    dot(ctx, 0, spot, 0.2);
    const a = Math.acos(5.5 / 9.15);
    ctx.beginPath();
    if (s > 0) ctx.arc(0, spot, 9.15, 1.5 * Math.PI - a, 1.5 * Math.PI + a);
    else ctx.arc(0, spot, 9.15, 0.5 * Math.PI - a, 0.5 * Math.PI + a);
    ctx.stroke();
    // Corner arcs
    for (const cx of [-1, 1]) {
      ctx.beginPath();
      const start = s < 0 ? (cx < 0 ? 0 : Math.PI / 2) : cx < 0 ? -Math.PI / 2 : Math.PI;
      ctx.arc(cx * hx, gl, 1, start, start + Math.PI / 2);
      ctx.stroke();
    }
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;

  // Fine grass-blade detail used as a tiling bump map, so the turf catches the floodlights.
  const dc = document.createElement('canvas');
  dc.width = dc.height = 256;
  const dg = dc.getContext('2d');
  dg.fillStyle = '#d8d8d8';
  dg.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const v = 150 + Math.random() * 105;
    dg.strokeStyle = `rgb(${v},${v},${v})`;
    dg.lineWidth = 0.8;
    dg.beginPath();
    dg.moveTo(x, y);
    dg.lineTo(x + (Math.random() - 0.5) * 2, y - 2 - Math.random() * 4);
    dg.stroke();
  }
  const detail = new THREE.CanvasTexture(dc);
  detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
  detail.repeat.set(widthM / 1.2, lengthM / 1.2);
  detail.anisotropy = tex.anisotropy;

  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0, roughnessMap: detail });
  const geo = new THREE.PlaneGeometry(widthM, lengthM);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  mesh.name = 'pitch';
  return mesh;
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}
function dot(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
