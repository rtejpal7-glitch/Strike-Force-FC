import * as THREE from 'three';
import { OpponentModel } from './OpponentModel.js';
import { COMBAT } from '../core/config.js';

// Opponent AI. Positions are kept as plain numbers (x, z) and copied onto the
// model each frame. The engine decides who is "active"; only the active
// opponent chases and fights.

const STATUS_TEXT = {
  post: 'Holding position',
  chase: 'Closing in!',
  approach: 'Squaring up',
  engage: 'Engaged',
  windup: 'TACKLE INCOMING!',
  charge: 'SLIDE TACKLE!',
  recover: 'Recovering',
  stagger: 'STAGGERED',
  throw: 'Throwing!',
  dive: 'Diving!',
  getup: 'Getting up',
  falling: 'DOWN!',
  down: 'Defeated',
};

export class Opponent {
  constructor(def, scene, audio) {
    this.def = def;
    this.audio = audio;
    this.model = new OpponentModel(def);
    scene.add(this.model.root);
    this.isKeeper = !!def.isKeeper;
    this.reset();
  }

  reset() {
    const d = this.def;
    this.x = d.x;
    this.z = d.z;
    this.hp = d.hp;
    this.maxHp = d.hp;
    this.state = 'post';
    this.t = 0; // time in state
    this.anim = Math.random() * 10;
    this.runPhase = 0;
    this.yaw = Math.PI;
    this.flinchT = 0;
    this.flinchDir = 0;
    this.stateDamage = 0;
    this.tackleTimer = d.tackleInterval * 0.8;
    this.throwTimer = d.throwInterval ? d.throwInterval * 0.7 : 0;
    this.diveTimer = 3.5;
    this.dodgeCooldown = 0;
    this.dodgeVel = 0;
    this.strafeTarget = 0;
    this.strafeTimer = 0;
    this.offsetX = 0;
    this.anchor = { x: d.x, z: d.z };
    this.phase2 = false;
    this.lastGrunt = 0;
    this.speed = 0;
    this.diveDir = 1;
    this.thrown = false;
    const m = this.model;
    m.body.rotation.set(0, 0, 0);
    m.body.position.set(0, 0, 0);
    m.bar.visible = false;
    m.warn.visible = false;
    m.drawBar(1);
    m.flashT = 0;
    for (const mat of m.materials) mat.emissiveIntensity = 0;
    this._apply();
  }

  get alive() {
    return this.hp > 0;
  }

  get statusText() {
    if (this.isKeeper && this.phase2 && this.state === 'engage') return 'ENRAGED';
    return STATUS_TEXT[this.state] || '';
  }

  get strafeSpeed() {
    return this.def.strafeSpeed * (this.phase2 ? 1.35 : 1);
  }

  setState(s) {
    this.state = s;
    this.t = 0;
    this.stateDamage = 0;
    this.model.warn.visible = s === 'windup';
  }

  // Called by the engine when the player stops for this encounter.
  engage(playerX, playerZ) {
    const ed = this.def.engageDistance;
    this.anchor.x = playerX;
    this.anchor.z = this.isKeeper ? Math.min(playerZ + ed, 47) : playerZ + ed;
    this.model.bar.visible = true;
    this.setState('approach');
  }

  // React to the player firing — chance to side-step.
  onPlayerFire() {
    if (!this.alive || this.state !== 'engage' || this.dodgeCooldown > 0) return;
    if (Math.random() < this.def.dodgeChance) {
      this.dodgeVel = (Math.random() < 0.5 ? -1 : 1) * (6 + this.def.strafeSpeed);
      if (Math.abs(this.offsetX + Math.sign(this.dodgeVel) * 1.5) > this.def.strafeRange + 1) this.dodgeVel *= -1;
      this.dodgeCooldown = 1.6;
      this.dodgedNow = true;
    }
  }

  takeDamage(amount, part, hitDirX = 0) {
    if (!this.alive) return { killed: false, dealt: 0 };
    if (part === 'glove' && this.isKeeper) amount *= 0.5; // keeper's gloves soak hits
    const dealt = Math.min(this.hp, amount);
    this.hp -= dealt;
    this.stateDamage += dealt;
    this.flinchT = 0.25;
    this.flinchDir = hitDirX;
    this.model.flash(part === 'head' ? 0xffe066 : 0xffffff);
    this.model.drawBar(this.hp / this.maxHp);
    const now = performance.now();
    if (now - this.lastGrunt > 350) {
      this.audio?.grunt(this.isKeeper ? 0.8 : 0.9 + Math.random() * 0.3);
      this.lastGrunt = now;
    }
    if (this.hp <= 0) {
      this.setState('falling');
      this.model.bar.visible = false;
      this.audio?.fall();
      return { killed: true, dealt };
    }
    if (this.isKeeper && !this.phase2 && this.hp < this.maxHp * 0.5) {
      this.phase2 = true;
      this.enragedNow = true;
    }
    // Enough damage during a wind-up or charge staggers the opponent.
    if ((this.state === 'windup' || this.state === 'charge') && this.stateDamage >= this.def.staggerThreshold) {
      this.setState('stagger');
      this.staggeredNow = true;
    }
    return { killed: false, dealt };
  }

  // ctx: { playerX, playerZ, active, inCombat, onTackle(dmg), onThrow(from) }
  update(dt, ctx) {
    this.t += dt;
    this.anim += dt;
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    const d = this.def;
    const dxp = ctx.playerX - this.x;
    const dzp = ctx.playerZ - this.z;
    const distP = Math.hypot(dxp, dzp);
    let moving = 0;
    let strafing = 0;
    let strafeDir = 0;

    switch (this.state) {
      case 'post': {
        if (ctx.active && distP < COMBAT.detectRange + (this.isKeeper ? 2 : 0)) this.setState('chase');
        break;
      }
      case 'chase': {
        if (this.isKeeper) {
          // Keeper comes off his line to narrow the angle.
          const tz = 46;
          const tx = THREE.MathUtils.clamp(ctx.playerX * 0.5, -3, 3);
          moving = this._moveTo(tx, tz, 3.5, dt);
        } else {
          moving = this._moveTo(ctx.playerX, ctx.playerZ + 1.5, 5.2, dt);
        }
        break;
      }
      case 'approach': {
        moving = this._moveTo(this.anchor.x, this.anchor.z, 5, dt);
        if (moving < 0.05) {
          this.offsetX = this.x - this.anchor.x;
          this.setState('engage');
        }
        break;
      }
      case 'engage': {
        // Strafe around the anchor point.
        this.strafeTimer -= dt;
        if (this.strafeTimer <= 0) {
          this.strafeTarget = (Math.random() * 2 - 1) * d.strafeRange;
          this.strafeTimer = 0.8 + Math.random() * 1.4;
        }
        const before = this.offsetX;
        const diff = this.strafeTarget - this.offsetX;
        this.offsetX += Math.sign(diff) * Math.min(Math.abs(diff), this.strafeSpeed * dt);
        if (this.dodgeVel) {
          this.offsetX += this.dodgeVel * dt;
          this.dodgeVel *= Math.exp(-dt * 7);
          if (Math.abs(this.dodgeVel) < 0.3) this.dodgeVel = 0;
        }
        this.offsetX = THREE.MathUtils.clamp(this.offsetX, -d.strafeRange - 1.5, d.strafeRange + 1.5);
        strafeDir = Math.sign(this.offsetX - before);
        strafing = Math.min(1, Math.abs(this.offsetX - before) / (dt * 3 + 1e-6));
        this.x = this.anchor.x + this.offsetX;
        this.z += (this.anchor.z - this.z) * Math.min(1, dt * 3);

        this.tackleTimer -= dt;
        if (this.tackleTimer <= 0) {
          this.tackleTimer = d.tackleInterval * (this.phase2 ? 0.75 : 1) * (0.85 + Math.random() * 0.3);
          this.setState('windup');
          this.audio?.tackleWarn();
          break;
        }
        if (this.isKeeper) {
          this.throwTimer -= dt;
          this.diveTimer -= dt;
          if (this.throwTimer <= 0) {
            this.throwTimer = (this.phase2 ? 1.6 : d.throwInterval) * (0.8 + Math.random() * 0.4);
            this.thrown = false;
            this.setState('throw');
          } else if (this.diveTimer <= 0) {
            this.diveTimer = (this.phase2 ? 2.2 : 3.5) + Math.random() * 1.5;
            this.diveDir = this.offsetX > 0.5 ? -1 : this.offsetX < -0.5 ? 1 : Math.random() < 0.5 ? -1 : 1;
            this.diveFrom = this.offsetX;
            this.setState('dive');
          }
        }
        break;
      }
      case 'windup': {
        const w = d.windup * (this.phase2 ? 0.8 : 1);
        if (this.t >= w) {
          this.setState('charge');
        }
        break;
      }
      case 'charge': {
        moving = this._moveTo(ctx.playerX, ctx.playerZ + 1.0, 12, dt);
        if (distP < 1.9) {
          ctx.onTackle(d.tackleDamage * (this.phase2 ? 1.2 : 1));
          this.setState('recover');
        }
        break;
      }
      case 'stagger': {
        // Knocked back a little
        this.z += dt * 1.5 * Math.max(0, 1 - this.t);
        if (this.t > 1.2) this.setState('recover');
        break;
      }
      case 'recover': {
        moving = this._moveTo(this.anchor.x + this.offsetX, this.anchor.z, 6, dt);
        if (moving < 0.05) this.setState('engage');
        break;
      }
      case 'throw': {
        if (!this.thrown && this.t >= 0.45) {
          this.thrown = true;
          const from = new THREE.Vector3(this.x - 0.3, 2.2 * d.look.height, this.z - 0.4);
          ctx.onThrow(from);
          this.audio?.throwWhoosh();
        }
        if (this.t >= 0.8) this.setState('engage');
        break;
      }
      case 'dive': {
        const k = Math.min(1, this.t / 0.55);
        this.offsetX = this.diveFrom + this.diveDir * 3.0 * Math.sin((k * Math.PI) / 2);
        this.offsetX = THREE.MathUtils.clamp(this.offsetX, -d.strafeRange - 2.5, d.strafeRange + 2.5);
        this.x = this.anchor.x + this.offsetX;
        if (this.t >= 0.9) this.setState('getup');
        break;
      }
      case 'getup': {
        if (this.t >= 0.5) this.setState('engage');
        break;
      }
      case 'falling': {
        if (this.t >= 1.3) this.setState('down');
        break;
      }
      default:
    }

    // Face the player unless down.
    if (this.state !== 'falling' && this.state !== 'down') {
      const targetYaw = Math.atan2(dxp, dzp);
      let dy = targetYaw - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * Math.min(1, dt * 8);
    }

    this.speed = moving;
    this._animate(dt, moving, strafing, strafeDir);
    this._apply();
  }

  _moveTo(tx, tz, speed, dt) {
    const dx = tx - this.x;
    const dz = tz - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return 0;
    const step = Math.min(dist, speed * dt);
    this.x += (dx / dist) * step;
    this.z += (dz / dist) * step;
    return step / dt / speed; // 0..1 effort
  }

  _animate(dt, moving, strafing, strafeDir) {
    const m = this.model;
    m.resetJoints();
    m.body.rotation.z = 0;
    if (this.state !== 'falling' && this.state !== 'down') {
      m.body.rotation.x = 0;
      m.body.position.y = 0;
    }
    const s = this.state;
    if (s === 'falling') {
      m.fall(Math.min(1, this.t / 1.1));
    } else if (s === 'down') {
      m.fall(1);
      // occasional twitch
      m.neck.rotation.x += Math.sin(this.anim * 0.7) * 0.03;
    } else if (s === 'windup') {
      const k = Math.min(1, this.t / 0.25);
      m.windup(k);
      // shake while coiling
      m.torso.rotation.z = Math.sin(this.anim * 60) * 0.04;
      m.flash(0xff2020, 0.6);
    } else if (s === 'charge') {
      this.runPhase += dt * 18;
      m.run(this.runPhase, 1, 0.45);
      if (this.t > 0.15) m.slideTackle(Math.min(1, (this.t - 0.15) / 0.2));
    } else if (s === 'stagger') {
      m.readyStance(this.anim, 0.1);
      m.flinch(Math.max(0, 1 - this.t) * 1.2 + 0.2, Math.sin(this.anim * 10) * 0.5);
    } else if (s === 'throw') {
      m.keeperStance(this.anim);
      m.throwArm(Math.min(1, this.t / 0.75));
    } else if (s === 'dive') {
      m.dive(Math.min(1, this.t / 0.9), this.diveDir * Math.cos(this.yaw));
    } else if (s === 'getup') {
      m.keeperStance(this.anim);
      m.hips.position.y -= (1 - this.t / 0.5) * 0.3;
    } else if (moving > 0.1) {
      this.runPhase += dt * (6 + 10 * moving);
      m.run(this.runPhase, Math.min(1, moving * 1.2));
    } else {
      if (this.isKeeper) m.keeperStance(this.anim);
      else m.readyStance(this.anim, s === 'post' ? 0.06 : 0.16);
      if (strafing > 0.05) {
        this.runPhase += dt * 14;
        m.strafe(this.runPhase, strafing, strafeDir);
      }
    }
    if (this.flinchT > 0 && s !== 'falling' && s !== 'down') {
      m.flinch(this.flinchT / 0.25, this.flinchDir);
      this.flinchT -= dt;
    }
    m.updateFlash(dt);
  }

  _apply() {
    const r = this.model.root;
    r.position.set(this.x, 0, this.z);
    r.rotation.y = this.yaw;
  }

  // Centre of mass, for camera targeting.
  get chestY() {
    return 1.25 * this.def.look.height;
  }
}
