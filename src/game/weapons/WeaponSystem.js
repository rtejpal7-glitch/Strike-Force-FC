import * as THREE from 'three';
import { WEAPONS, WEAPON_ORDER } from './weaponDefs.js';
import { BUILDERS, flashTexture } from './WeaponModels.js';

// Ammo, fire-rate, reload and switching logic, plus the first-person
// viewmodel animation (sway, bob, recoil, reload dip, switch, muzzle flash).

export class WeaponSystem {
  constructor(camera, scene, audio) {
    this.camera = camera;
    this.audio = audio;
    this.holder = new THREE.Group(); // animated root, child of the camera
    camera.add(this.holder);

    this.models = {};
    for (const id of WEAPON_ORDER) {
      const m = BUILDERS[id]();
      m.group.visible = false;
      this.holder.add(m.group);
      this.models[id] = m;
    }

    const ft = flashTexture();
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: ft, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    this.flash.visible = false;
    this.flashT = 0;
    this.flashLight = new THREE.PointLight(0xffb050, 0, 8, 2);
    scene.add(this.flashLight);

    this.reset();
  }

  reset() {
    this.ammo = {};
    for (const id of WEAPON_ORDER) {
      const d = WEAPONS[id];
      this.ammo[id] = { mag: d.magSize, reserve: d.reserve };
    }
    this.current = 'pistol';
    this.previous = 'rifle';
    this.cooldown = 0;
    this.reloadT = 0;
    this.reloading = false;
    this.switchT = 0;
    this.pendingSwitch = null;
    this.bloom = 0;
    this.kick = 0;
    this.kickRot = 0;
    this.time = 0;
    this.ready = false; // raised for combat
    this.readyBlend = 0;
    this.zoomed = false;
    this.hidden = false;
    for (const id of WEAPON_ORDER) this.models[id].group.visible = id === this.current;
    this._attachFlash();
  }

  get def() {
    return WEAPONS[this.current];
  }

  _attachFlash() {
    const m = this.models[this.current];
    m.muzzle.add(this.flash);
    this.flash.position.set(0, 0, -0.03);
  }

  select(id) {
    if (!WEAPONS[id] || id === this.current || this.pendingSwitch === id) return false;
    this.pendingSwitch = id;
    this.switchT = 0;
    this.reloading = false;
    this.reloadT = 0;
    this.audio?.weaponSwitch();
    return true;
  }

  selectIndex(i) {
    return this.select(WEAPON_ORDER[i]);
  }

  cycle(dir) {
    const base = this.pendingSwitch || this.current;
    const i = WEAPON_ORDER.indexOf(base);
    return this.select(WEAPON_ORDER[(i + dir + WEAPON_ORDER.length) % WEAPON_ORDER.length]);
  }

  selectLast() {
    return this.select(this.previous);
  }

  reload() {
    const a = this.ammo[this.current];
    const d = this.def;
    if (this.reloading || this.pendingSwitch || a.mag >= d.magSize || a.reserve <= 0) return false;
    this.reloading = true;
    this.reloadT = 0;
    this.audio?.reload(this.current, d.reloadTime);
    return true;
  }

  refill(fraction = 1) {
    for (const id of WEAPON_ORDER) {
      const d = WEAPONS[id];
      if (d.refillOnKill) this.ammo[id].reserve += Math.round(d.refillOnKill * fraction);
    }
  }

  get canFire() {
    return !this.reloading && !this.pendingSwitch && this.cooldown <= 0;
  }

  // Returns true if a shot was fired (caller resolves hits).
  tryFire(triggerHeld, triggerPressed, onShot) {
    const d = this.def;
    const a = this.ammo[this.current];
    if (!this.canFire) return false;
    if (!(d.automatic ? triggerHeld : triggerPressed)) return false;
    if (a.mag <= 0) {
      if (triggerPressed) this.audio?.dryFire();
      if (!this.reload()) this.cooldown = 0.25;
      return false;
    }
    a.mag--;
    this.cooldown = d.fireInterval;
    let spread = this.zoomed && d.zoomSpread !== undefined ? d.zoomSpread : d.spread;
    spread += this.bloom;
    if (d.bloomPerShot) this.bloom = Math.min(d.maxBloom, this.bloom + d.bloomPerShot);
    this.kick = 1;
    this.kickRot = d.recoil;
    this.flashT = 0.05;
    this.audio?.shot(this.current);
    onShot(d, spread);
    if (a.mag === 0 && a.reserve > 0) {
      // auto reload shortly after emptying
      setTimeout(() => this.ammo[this.current] === a && a.mag === 0 && this.reload(), 220);
    }
    return true;
  }

  update(dt, { speed01 = 0, aimNdc = { x: 0, y: 0 } } = {}) {
    this.time += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.bloom = Math.max(0, this.bloom - dt * 0.06);
    const d = this.def;

    // Reload progress
    if (this.reloading) {
      this.reloadT += dt;
      if (this.reloadT >= d.reloadTime) {
        const a = this.ammo[this.current];
        const need = d.magSize - a.mag;
        const take = Math.min(need, a.reserve);
        a.mag += take;
        if (a.reserve !== Infinity) a.reserve -= take;
        this.reloading = false;
        this.reloadT = 0;
      }
    }

    // Switching: lower for 0.18s, swap, raise for 0.22s
    let switchOffset = 0;
    if (this.pendingSwitch) {
      this.switchT += dt;
      if (this.switchT < 0.18) switchOffset = this.switchT / 0.18;
      else {
        if (this.models[this.current].group.visible) {
          this.models[this.current].group.visible = false;
          this.previous = this.current;
          this.current = this.pendingSwitch;
          this.models[this.current].group.visible = true;
          this._attachFlash();
        }
        const u = (this.switchT - 0.18) / 0.22;
        switchOffset = 1 - Math.min(1, u);
        if (u >= 1) this.pendingSwitch = null;
      }
    }

    // ---- Viewmodel pose ----
    const m = this.models[this.current];
    const rest = m.rest;
    this.readyBlend += ((this.ready ? 1 : 0) - this.readyBlend) * Math.min(1, dt * 6);
    const lower = 1 - this.readyBlend; // weapon held low while running

    const bobX = Math.sin(this.time * 9.5 * 0.5) * 0.012 * speed01;
    const bobY = Math.abs(Math.sin(this.time * 9.5 * 0.5)) * 0.014 * speed01;
    const idle = Math.sin(this.time * 1.6) * 0.003;

    this.kick += (0 - this.kick) * Math.min(1, dt * 18);
    this.kickRot += (0 - this.kickRot) * Math.min(1, dt * 12);

    let reloadDip = 0;
    let reloadRoll = 0;
    if (this.reloading) {
      const k = this.reloadT / d.reloadTime;
      const e = Math.sin(Math.min(1, k) * Math.PI);
      reloadDip = e * 0.09;
      reloadRoll = e * 0.55;
    }

    // Small aim offset toward the crosshair
    const aimYaw = -aimNdc.x * 0.09 * this.readyBlend;
    const aimPitch = aimNdc.y * 0.07 * this.readyBlend;

    const h = this.holder;
    h.position.set(
      rest.x + bobX + lower * 0.03,
      rest.y - bobY + idle - lower * 0.07 - switchOffset * 0.3 - reloadDip,
      rest.z + this.kick * 0.06 * (d.recoil * 6)
    );
    h.rotation.set(
      aimPitch + this.kickRot * 1.4 - lower * 0.35 - switchOffset * 0.6 - reloadDip * 1.2,
      aimYaw + lower * 0.35,
      reloadRoll + lower * 0.25
    );
    h.visible = !this.hidden && (!this.zoomed || this.current !== 'sniper');

    // Pump / bolt micro-animations
    if (m.pump) {
      const since = d.fireInterval - this.cooldown;
      m.pump.position.z = this.cooldown > 0 && since > 0.15 && since < 0.5 ? -0.23 : -0.3;
    }
    if (m.bolt) m.bolt.rotation.y = this.cooldown > 0.3 ? -0.9 : 0;

    // Muzzle flash
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flash.visible = true;
      const s = m.flashScale * (0.8 + Math.random() * 0.5);
      this.flash.scale.set(s, s, 1);
      this.flash.material.rotation = Math.random() * Math.PI;
      const wp = new THREE.Vector3();
      m.muzzle.getWorldPosition(wp);
      this.flashLight.position.copy(wp);
      this.flashLight.intensity = 25;
    } else {
      this.flash.visible = false;
      this.flashLight.intensity = 0;
    }
  }

  muzzleWorld(target = new THREE.Vector3()) {
    return this.models[this.current].muzzle.getWorldPosition(target);
  }

  snapshot() {
    return {
      current: this.pendingSwitch || this.current,
      reloading: this.reloading,
      reloadProgress: this.reloading ? this.reloadT / this.def.reloadTime : 0,
      slots: WEAPON_ORDER.map((id) => ({
        id,
        name: WEAPONS[id].name,
        key: WEAPONS[id].key,
        mag: this.ammo[id].mag,
        magSize: WEAPONS[id].magSize,
        reserve: this.ammo[id].reserve === Infinity ? '∞' : this.ammo[id].reserve,
      })),
    };
  }
}
