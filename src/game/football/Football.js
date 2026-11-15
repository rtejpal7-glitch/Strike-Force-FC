import * as THREE from 'three';

export const BALL_RADIUS = 0.11;

let sharedBallTex = null;
function ballTexture() {
  if (sharedBallTex) return sharedBallTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f7f7f2';
  g.fillRect(0, 0, 512, 256);
  // Classic panel pattern in equirectangular space (approximate).
  const spots = [
    [256, 128], [0, 128], [512, 128], [128, 60], [384, 60], [128, 196], [384, 196],
    [64, 128], [192, 128], [320, 128], [448, 128], [256, 20], [256, 236], [0, 20], [512, 20], [0, 236], [512, 236],
  ];
  spots.forEach(([x, y], i) => {
    const r = i < 7 ? 26 : 12;
    g.fillStyle = i < 7 ? '#111' : '#2a2a2a';
    g.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
      const sx = x + Math.cos(a) * r * 1.3;
      const sy = y + Math.sin(a) * r;
      k ? g.lineTo(sx, sy) : g.moveTo(sx, sy);
    }
    g.closePath();
    g.fill();
  });
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 2;
  for (let x = 0; x < 512; x += 64) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + 32, 256);
    g.stroke();
  }
  sharedBallTex = new THREE.CanvasTexture(c);
  sharedBallTex.colorSpace = THREE.SRGBColorSpace;
  return sharedBallTex;
}

export function makeBallMesh(radius = BALL_RADIUS) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 24, 16),
    new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.45 })
  );
  m.castShadow = true;
  return m;
}

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

// The ball stays with the player: it is pushed ahead on each touch, rolls,
// slows down, and the player catches up and touches it again.
export class Football {
  constructor(scene, audio) {
    this.audio = audio;
    this.mesh = makeBallMesh();
    scene.add(this.mesh);
    this.minAhead = 1.5;
    this.reset(0, 0);
  }

  reset(x, z) {
    this.ahead = 1.7;
    this.speed = 0; // world forward speed of the ball
    this.x = x;
    this.lateral = 0;
    this.lateralVel = 0;
    this.z = z + this.ahead;
    this.y = BALL_RADIUS;
    this.flight = null;
    this.touchCount = 0;
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.visible = true;
  }

  // Called every frame while the player has the ball.
  updateDribble(dt, playerX, playerZ, runSpeed, onTouch) {
    const prevZ = this.z;
    const prevX = this.x;
    if (runSpeed > 0.5) {
      this.speed *= Math.exp(-1.0 * dt);
      this.ahead += (this.speed - runSpeed) * dt;
      if (this.ahead <= this.minAhead) {
        this.ahead = this.minAhead;
        this.speed = runSpeed * 1.45;
        this.lateralVel = (Math.random() - 0.5) * 0.5 - this.lateral * 1.5;
        this.touchCount++;
        onTouch?.(this.touchCount % 2 === 0 ? -1 : 1);
        this.audio?.dribble();
      }
    } else {
      // Player stopped: ball settles in front of their feet.
      this.speed = 0;
      this.ahead += ((this.restAhead || 1.75) - this.ahead) * Math.min(1, dt * 3);
    }
    this.lateral += this.lateralVel * dt;
    this.lateralVel *= Math.exp(-2 * dt);
    this.lateral += (0 - this.lateral) * Math.min(1, dt * 1.2);

    this.x = playerX + this.lateral;
    this.z = playerZ + this.ahead;
    this.y = BALL_RADIUS;
    this.mesh.position.set(this.x, this.y, this.z);
    this._roll(this.x - prevX, this.z - prevZ);
  }

  _roll(dx, dz) {
    if (dz) this.mesh.rotateOnWorldAxis(X_AXIS, dz / BALL_RADIUS);
    if (dx) this.mesh.rotateOnWorldAxis(Z_AXIS, -dx / BALL_RADIUS);
  }

  // Shoot the ball along an arc to a target. onArrive fires when it reaches it.
  shoot(target, duration, onArrive) {
    this.flight = {
      from: new THREE.Vector3(this.x, this.y, this.z),
      to: target.clone(),
      t: 0,
      dur: duration,
      onArrive,
      arrived: false,
      settle: 0,
    };
  }

  updateFlight(dt) {
    const f = this.flight;
    if (!f) return;
    const prev = this.mesh.position.clone();
    if (!f.arrived) {
      f.t += dt / f.dur;
      const t = Math.min(1, f.t);
      const p = f.from.clone().lerp(f.to, t);
      p.y += Math.sin(t * Math.PI) * 1.2;
      this.mesh.position.copy(p);
      if (t >= 1) {
        f.arrived = true;
        f.vel = new THREE.Vector3(0, -1, 0.6);
        f.onArrive?.();
      }
    } else {
      // Drop to the ground inside the net and roll a little.
      f.vel.y -= 9.8 * dt;
      this.mesh.position.addScaledVector(f.vel, dt);
      if (this.mesh.position.y < BALL_RADIUS) {
        this.mesh.position.y = BALL_RADIUS;
        f.vel.y = Math.abs(f.vel.y) * 0.4;
        f.vel.z *= 0.6;
      }
      f.vel.z *= Math.exp(-2 * dt);
    }
    const d = this.mesh.position.clone().sub(prev);
    this.mesh.rotateOnWorldAxis(X_AXIS, d.z / BALL_RADIUS);
    this.mesh.rotateOnWorldAxis(Z_AXIS, -d.x / BALL_RADIUS);
  }
}
