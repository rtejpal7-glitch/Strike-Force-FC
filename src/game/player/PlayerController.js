import * as THREE from 'three';
import { PLAYER } from '../core/config.js';
import { PlayerBody } from './PlayerBody.js';

// Owns the first-person camera and the player's position on the pitch.
// Movement is automatic: the engine sets the target speed, the controller
// handles acceleration, head bob, sway, recoil, shake and where we look.

export class PlayerController {
  constructor(scene, camera, audio) {
    this.camera = camera;
    this.audio = audio;
    this.body = new PlayerBody();
    scene.add(this.body.root);
    this.lookTarget = new THREE.Vector3();
    this.desiredLook = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.x = 0;
    this.z = PLAYER.startZ;
    this.speed = 0;
    this.targetSpeed = 0;
    this.targetX = 0;
    this.phase = 0;
    this.shake = 0;
    this.recoil = 0;
    this.fov = PLAYER.baseFov;
    this.targetFov = PLAYER.baseFov;
    this.lastStepSign = 1;
    // Touch "free look" on top of the automatic camera (radians)
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.lookYawTarget = 0;
    this.lookPitchTarget = 0;
    this.footwork = 0; // 0..1 manual stepping (joystick / WASD) for leg animation
    this.lane = 0; // preferred lateral position while running
    this.body.root.position.set(this.x, 0, this.z);
    this.body.kick = 0;
    this.body.touch = 0;
    this.lookTarget.set(0, -0.4, this.z + 10);
    this.desiredLook.copy(this.lookTarget);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }

  get speed01() {
    return Math.min(1, this.speed / PLAYER.runSpeed);
  }

  addShake(amount) {
    this.shake = Math.min(0.5, this.shake + amount);
  }

  addRecoil(amount) {
    this.recoil = Math.min(0.35, this.recoil + amount);
  }

  // Drag-to-aim (touch). Positive dYaw turns right, positive dPitch looks up.
  addLook(dYaw, dPitch) {
    this.lookYawTarget = THREE.MathUtils.clamp(this.lookYawTarget - dYaw, -0.9, 0.9);
    this.lookPitchTarget = THREE.MathUtils.clamp(this.lookPitchTarget + dPitch, -0.45, 0.5);
  }

  // Ease the free-look back to centre (used outside fights)
  relaxLook(dt, rate = 1.5) {
    const k = Math.exp(-dt * rate);
    this.lookYawTarget *= k;
    this.lookPitchTarget *= k;
  }

  resetLook() {
    this.lookYaw = this.lookPitch = this.lookYawTarget = this.lookPitchTarget = 0;
  }

  // Manual stepping while stopped for a fight. dx/dz in world metres per second,
  // clamped to the area allowed around the fight position.
  step(dx, dz, dt, bounds) {
    this.x = THREE.MathUtils.clamp(this.x + dx * dt, bounds.minX, bounds.maxX);
    this.z = THREE.MathUtils.clamp(this.z + dz * dt, bounds.minZ, bounds.maxZ);
    this.footwork = Math.max(this.footwork, Math.min(1, Math.hypot(dx, dz) / 3));
  }

  // Look at a world point (combat) or straight down the pitch (running).
  lookAt(point) {
    this.desiredLook.copy(point);
  }

  lookAhead() {
    // Pitched down ~12° so the ball sits at the bottom-centre of the view.
    this.desiredLook.set(this.x * 0.6, PLAYER.eyeHeight - Math.tan(THREE.MathUtils.degToRad(12)) * 10, this.z + 10);
  }

  update(dt) {
    // Speed & lateral steering
    const accel = this.targetSpeed > this.speed ? 6 : 14;
    this.speed += (this.targetSpeed - this.speed) * Math.min(1, dt * accel * 0.5);
    if (Math.abs(this.speed - this.targetSpeed) < 0.02) this.speed = this.targetSpeed;
    this.z += this.speed * dt;
    this.x += (this.targetX - this.x) * Math.min(1, dt * 1.5) * this.speed01;

    // Run cycle (manual stepping also drives the legs and head bob)
    const s01 = Math.max(this.speed01, this.footwork * 0.65);
    this.footwork = Math.max(0, this.footwork - dt * 4);
    this.phase += dt * (2.2 + 9.5 * s01);
    const stepSign = Math.sign(Math.sin(this.phase));
    if (s01 > 0.3 && stepSign !== this.lastStepSign) this.audio?.step();
    this.lastStepSign = stepSign;

    const bobY = Math.abs(Math.sin(this.phase)) * 0.06 * s01 + Math.sin(this.phase * 0.5) * 0.004;
    const swayX = Math.sin(this.phase * 0.5) * 0.035 * s01;
    const idleBreath = Math.sin(performance.now() * 0.0015) * 0.006 * (1 - s01);

    this.body.root.position.set(this.x, 0, this.z);
    this.body.update(dt, this.phase * 0.5, s01);

    this.camera.position.set(this.x + swayX, PLAYER.eyeHeight + bobY - 0.03 * s01 + idleBreath, this.z);

    this.lookTarget.lerp(this.desiredLook, Math.min(1, dt * 4));
    this.camera.lookAt(this.lookTarget);
    // Touch free-look offset, smoothed so drags feel fluid but responsive
    const kLook = 1 - Math.exp(-dt * 22);
    this.lookYaw += (this.lookYawTarget - this.lookYaw) * kLook;
    this.lookPitch += (this.lookPitchTarget - this.lookPitch) * kLook;
    if (this.lookYaw) this.camera.rotateY(this.lookYaw);
    if (this.lookPitch) this.camera.rotateX(this.lookPitch);

    // Roll with the stride, recoil kick, and trauma-style shake.
    this.camera.rotateZ(Math.sin(this.phase * 0.5) * 0.012 * s01);
    this.camera.rotateX(this.recoil);
    this.recoil *= Math.exp(-dt * 10);
    if (this.shake > 0.001) {
      const s = this.shake * this.shake;
      this.camera.rotateX((Math.random() - 0.5) * s * 0.4);
      this.camera.rotateY((Math.random() - 0.5) * s * 0.4);
      this.camera.rotateZ((Math.random() - 0.5) * s * 0.3);
      this.shake = Math.max(0, this.shake - dt * 1.2);
    }

    // FOV: zoom + a touch of speed widening
    const fovGoal = this.targetFov + s01 * 4;
    this.fov += (fovGoal - this.fov) * Math.min(1, dt * 10);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
