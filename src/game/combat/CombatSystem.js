import * as THREE from 'three';
import { makeBallMesh } from '../football/Football.js';

// Resolves shots with real raycasts against the active opponent's body-part
// meshes (head vs body vs keeper gloves) and the keeper's thrown balls.
// Misses hit the ground or fly off; only connecting rays deal damage.

const _dir = new THREE.Vector3();
const _perp1 = new THREE.Vector3();
const _perp2 = new THREE.Vector3();
const _ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export class CombatSystem {
  constructor({ scene, camera, effects, audio, weapons }) {
    this.scene = scene;
    this.camera = camera;
    this.effects = effects;
    this.audio = audio;
    this.weapons = weapons;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 300;
    this.projectiles = [];
    this.hitGeo = new THREE.SphereGeometry(0.5, 8, 6);
    this.hitMat = new THREE.MeshBasicMaterial({ visible: false });
  }

  reset() {
    for (const p of this.projectiles) this.scene.remove(p.mesh, p.hit);
    this.projectiles = [];
  }

  _perturb(dir, spread) {
    if (spread <= 0) return dir;
    _perp1.set(0, 1, 0).cross(dir);
    if (_perp1.lengthSq() < 1e-6) _perp1.set(1, 0, 0);
    _perp1.normalize();
    _perp2.copy(dir).cross(_perp1).normalize();
    const r = Math.tan(spread) * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    dir.addScaledVector(_perp1, Math.cos(a) * r).addScaledVector(_perp2, Math.sin(a) * r).normalize();
    return dir;
  }

  // Fire one trigger pull. Returns a summary used for HUD feedback and stats.
  fire(def, spread, aimNdc, opponent) {
    const result = { hit: false, head: false, kill: false, damage: 0, projectileHit: false };
    const muzzle = this.weapons.muzzleWorld(new THREE.Vector3());
    const targets = [];
    if (opponent && opponent.alive) targets.push(...opponent.model.hitMeshes);
    for (const p of this.projectiles) targets.push(p.hit);

    let damageSum = 0;
    let numberPos = null;
    let anyHead = false;

    for (let i = 0; i < (def.pellets || 1); i++) {
      this.raycaster.setFromCamera(aimNdc, this.camera);
      _dir.copy(this.raycaster.ray.direction);
      this._perturb(_dir, spread);
      this.raycaster.ray.direction.copy(_dir);
      const hits = this.raycaster.intersectObjects(targets, false);
      let end;
      if (hits.length) {
        const h = hits[0];
        end = h.point.clone();
        const proj = this.projectiles.find((p) => p.hit === h.object);
        if (proj) {
          if (!proj.dead) {
            proj.dead = true;
            this.effects.burst(h.point, 0xffffff);
            this.audio?.impact(false);
            result.projectileHit = true;
            result.hit = true;
          }
        } else if (opponent && opponent.alive) {
          const part = h.object.userData.part || 'body';
          const head = part === 'head';
          let dmg = def.damage * (head ? def.headMultiplier : 1);
          if (def.falloffStart) {
            const k = THREE.MathUtils.clamp((h.distance - def.falloffStart) / (def.falloffEnd - def.falloffStart), 0, 1);
            dmg *= THREE.MathUtils.lerp(1, def.falloffMin, k);
          }
          const sideDir = Math.sign(h.point.x - opponent.x) || 0;
          const r = opponent.takeDamage(dmg, part, sideDir);
          damageSum += r.dealt;
          anyHead = anyHead || head;
          numberPos = numberPos || h.point.clone();
          this.effects.sparks(h.point, head ? 0xfff07a : 0xffb36b, head ? 12 : 7, 2.5);
          result.hit = true;
          if (r.killed) result.kill = true;
          if (!opponent.alive) {
            // remove dead body from further pellets this shot
            targets.length = 0;
            for (const p of this.projectiles) targets.push(p.hit);
          }
        }
      } else {
        end = new THREE.Vector3();
        if (!this.raycaster.ray.intersectPlane(_ground, end) || end.distanceTo(this.camera.position) > 120) {
          end = this.raycaster.ray.at(120, new THREE.Vector3());
        } else if (i % 3 === 0) {
          this.effects.dust(end);
        }
      }
      if (i < 4) this.effects.tracer(muzzle, end, def.id === 'sniper' ? 0xbfe6ff : 0xffe08a);
    }

    if (damageSum > 0) {
      this.effects.damageNumber(numberPos, damageSum, anyHead, result.kill);
      this.audio?.impact(anyHead);
    } else if (!result.hit) {
      this.audio?.miss();
    }
    result.head = anyHead;
    result.damage = damageSum;
    if (opponent && opponent.alive) opponent.onPlayerFire();
    return result;
  }

  // Keeper throws a ball at the player; it can be shot out of the air.
  spawnThrow(from, target, duration) {
    const mesh = makeBallMesh(0.12);
    mesh.material = mesh.material.clone();
    mesh.material.emissive = new THREE.Color(0xff2a2a);
    mesh.material.emissiveIntensity = 0.6;
    mesh.position.copy(from);
    const hit = new THREE.Mesh(this.hitGeo, this.hitMat);
    hit.position.copy(from);
    this.scene.add(mesh, hit);
    this.projectiles.push({ mesh, hit, from: from.clone(), to: target.clone(), t: 0, dur: duration, dead: false });
  }

  // onArrive(projectile) is called when a ball reaches the player.
  updateProjectiles(dt, onArrive) {
    for (const p of this.projectiles) {
      if (p.dead) continue;
      p.t += dt / p.dur;
      const t = Math.min(1, p.t);
      const pos = p.from.clone().lerp(p.to, t);
      pos.y += Math.sin(t * Math.PI) * 1.6;
      p.mesh.position.copy(pos);
      p.hit.position.copy(pos);
      p.mesh.rotation.x -= dt * 18;
      if (t >= 1) {
        p.dead = true;
        onArrive(p);
      }
    }
    const gone = this.projectiles.filter((p) => p.dead);
    if (gone.length) {
      for (const p of gone) {
        this.scene.remove(p.mesh, p.hit);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
      }
      this.projectiles = this.projectiles.filter((p) => !p.dead);
    }
  }
}
