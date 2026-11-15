import * as THREE from 'three';
import { OpponentModel } from '../opponents/OpponentModel.js';
import { KITS } from '../core/config.js';

// Picture-in-picture replay cam. While a fight is on, the active opponent's
// joint transforms are recorded every frame. When he goes down we play back the
// last moments in slow motion from a cinematic orbiting camera, then cut to a
// crowd cam showing the stands going wild. The PiP is drawn with a scissored
// second render after the main frame, temporarily posing the model from the
// recording and restoring the live pose afterwards.

const SLOWMO = 0.65;
const PRE = 0.6; // seconds of action before the knockdown
const POST = 1.3; // seconds after (the fall)
const CROWD_SHOT = 2.8;

function jointsOf(model) {
  const j = [model.root, model.body, model.hips, model.torso, model.neck, model.head];
  model.legs.forEach((L) => j.push(L.thigh, L.shin, L.foot));
  model.arms.forEach((A) => j.push(A.shoulder, A.elbow));
  return j;
}

export class ReplaySystem {
  constructor(scene, store) {
    this.scene = scene;
    this.store = store;
    this.cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 900);
    scene.add(this.cam);
    this.frames = [];
    this.recFor = null;
    this.active = null;

    // A full-body stand-in for the player, only visible in replay shots.
    this.avatar = new OpponentModel({
      name: 'You',
      number: 10,
      kit: { ...KITS.player, trim: 0xffffff },
      look: { skin: KITS.player.skin, hair: 0x2b1b10, hairStyle: 'fade', height: 1.02, build: 1.05, eyes: 0x4a2e16, face: { jaw: 1.05, beard: 'stubble' } },
      sponsor: 'STRIKE FC',
    });
    this.avatar.root.visible = false;
    this.avatar.bar.visible = false;
    scene.add(this.avatar.root);
    this.tmpPos = new THREE.Vector3();
    this.tmpQuat = new THREE.Quaternion();
  }

  reset() {
    this.frames = [];
    this.recFor = null;
    this.active = null;
    this.store.set({ replay: null });
  }

  // Record one frame of the opponent's pose at engine time t.
  record(opp, t) {
    if (this.recFor !== opp) {
      this.recFor = opp;
      this.frames = [];
      this.deathT = undefined;
      this.joints = jointsOf(opp.model);
    }
    if (this.deathT !== undefined && this.recFor === opp && t > this.deathT + POST + 0.1) return;
    const data = new Float32Array(this.joints.length * 7);
    this.joints.forEach((o, i) => {
      data.set([o.position.x, o.position.y, o.position.z, o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w], i * 7);
    });
    this.frames.push({ t, data });
    // Keep a rolling window while the fight is going on.
    const keepFrom = (this.deathT !== undefined ? this.deathT : t) - PRE - 0.2;
    while (this.frames.length > 2 && this.frames[0].t < keepFrom) this.frames.shift();
  }

  markDeath(opp, t) {
    if (this.recFor !== opp) this.record(opp, t);
    this.deathT = t;
  }

  // Begin playback once the fall has been recorded.
  start(opp, player) {
    this.active = {
      opp,
      t: 0,
      startData: this.deathT - PRE,
      player: { x: player.x, z: player.z },
      side: opp.x >= player.x ? 1 : -1,
      crowdSide: opp.x >= 0 ? 1 : -1,
      shot: 'replay',
      // Own copy of the recording, so a new fight can start recording meanwhile.
      frames: this.frames.slice(),
      joints: this.joints,
    };
    this.store.set({ replay: { id: Date.now(), name: opp.def.name, number: opp.def.number, keeper: opp.isKeeper, shot: 'replay' } });
  }

  get duration() {
    return (PRE + POST) / SLOWMO + CROWD_SHOT;
  }

  stop() {
    if (!this.active) return;
    this.active = null;
    this.deathT = undefined;
    this.store.set({ replay: null });
  }

  update(dt) {
    const a = this.active;
    if (!a) return;
    a.t += dt;
    const replayLen = (PRE + POST) / SLOWMO;
    if (a.shot === 'replay' && a.t > replayLen) {
      a.shot = 'crowd';
      const r = this.store.get().replay;
      if (r) this.store.set({ replay: { ...r, shot: 'crowd' } });
      this.onCrowdShot?.();
    }
    if (a.t > this.duration) this.stop();
  }

  _applyFrame(dataT) {
    const f = this.active.frames;
    const joints = this.active.joints;
    if (!f.length) return false;
    let i = 0;
    while (i < f.length - 1 && f[i + 1].t < dataT) i++;
    const A = f[i];
    const B = f[Math.min(i + 1, f.length - 1)];
    const k = B.t > A.t ? THREE.MathUtils.clamp((dataT - A.t) / (B.t - A.t), 0, 1) : 0;
    joints.forEach((o, j) => {
      const o7 = j * 7;
      const a = A.data;
      const b = B.data;
      o.position.set(
        a[o7] + (b[o7] - a[o7]) * k,
        a[o7 + 1] + (b[o7 + 1] - a[o7 + 1]) * k,
        a[o7 + 2] + (b[o7 + 2] - a[o7 + 2]) * k
      );
      this.tmpQuat.set(a[o7 + 3], a[o7 + 4], a[o7 + 5], a[o7 + 6]);
      o.quaternion.set(b[o7 + 3], b[o7 + 4], b[o7 + 5], b[o7 + 6]);
      o.quaternion.slerp(this.tmpQuat, 1 - k);
    });
    return true;
  }

  // rect: {x, y, w, h} in CSS pixels from the top-left of the canvas
  render(renderer, rect, hide = []) {
    const a = this.active;
    if (!a || !a.frames.length) return;
    const opp = a.opp;
    const model = opp.model;

    // Save the live pose
    const saved = a.joints.map((o) => [o.position.clone(), o.quaternion.clone()]);
    const savedBar = [model.bar.visible, model.warn.visible];
    model.bar.visible = false;
    model.warn.visible = false;

    const cam = this.cam;
    if (a.shot === 'replay') {
      const dataT = a.startData + a.t * SLOWMO;
      this._applyFrame(dataT);
      model.root.updateMatrixWorld(true);
      model.hips.getWorldPosition(this.tmpPos);
      const target = this.tmpPos;
      const u = a.t / ((PRE + POST) / SLOWMO);
      const ang = THREE.MathUtils.lerp(-0.75, 0.35, u);
      const r = THREE.MathUtils.lerp(4.6, 3.6, u);
      cam.fov = THREE.MathUtils.lerp(42, 34, u);
      cam.position.set(target.x + a.side * Math.cos(ang) * r, 1.15 - u * 0.35, target.z + Math.sin(ang) * r);
      cam.lookAt(target.x, Math.max(0.35, target.y - 0.1), target.z);
      // Player avatar standing where we fired from, arms up aiming
      const av = this.avatar;
      av.root.visible = true;
      av.root.position.set(a.player.x, 0, a.player.z);
      av.root.rotation.y = Math.atan2(opp.x - a.player.x, opp.z - a.player.z);
      av.resetJoints();
      av.readyStance(a.t, 0.1);
      av.arms.forEach((A) => {
        A.shoulder.rotation.x = -1.45;
        A.shoulder.rotation.z = A.side * 0.15;
        A.elbow.rotation.x = -0.15;
      });
    } else {
      // Crowd cam: slow pan along the nearest side stand
      const u = (a.t - (PRE + POST) / SLOWMO) / CROWD_SHOT;
      const s = a.crowdSide;
      const z = opp.z;
      cam.fov = 36;
      cam.position.set(s * 27, 4.5 + u * 1.5, z - 10 + u * 6);
      cam.lookAt(s * 50, 6.5, z + 4 + u * 10);
    }
    cam.aspect = rect.w / rect.h;
    cam.updateProjectionMatrix();

    const hidden = hide.filter(Boolean).map((o) => [o, o.visible]);
    hidden.forEach(([o]) => (o.visible = false));

    const H = renderer.domElement.clientHeight || renderer.getSize(new THREE.Vector2()).y;
    const y = H - rect.y - rect.h;
    const prevAuto = renderer.autoClear;
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.setRenderTarget(null);
    renderer.autoClear = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.setScissorTest(true);
    renderer.setScissor(rect.x, y, rect.w, rect.h);
    renderer.setViewport(rect.x, y, rect.w, rect.h);
    renderer.clear();
    renderer.render(this.scene, cam);
    renderer.setScissorTest(false);
    const size = renderer.getSize(new THREE.Vector2());
    renderer.setViewport(0, 0, size.x, size.y);
    renderer.autoClear = prevAuto;
    renderer.shadowMap.autoUpdate = prevShadow;

    // Restore everything
    hidden.forEach(([o, v]) => (o.visible = v));
    this.avatar.root.visible = false;
    a.joints.forEach((o, i) => {
      o.position.copy(saved[i][0]);
      o.quaternion.copy(saved[i][1]);
    });
    model.bar.visible = savedBar[0];
    model.warn.visible = savedBar[1];
  }
}
