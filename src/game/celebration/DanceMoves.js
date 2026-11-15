// Beat-driven dance moves for the player avatar (an OpponentModel in the
// player's kit). Each move gets: m (model), p (beats since the move started),
// e (energy 0.6..1.3), pulse (1 right on a beat, decaying). Moves write joint
// rotations and return root offsets { spin, slide, lift }.
//
// Joint conventions: shoulder.x −π = arm straight up, negative = forward;
// shoulder.z = side·θ raises the arm sideways; thigh.x negative = leg forward;
// shin.x positive = knee bend; torso.x positive = lean forward.

const TAU = Math.PI * 2;
const frac = (x) => x - Math.floor(x);
const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

function bendKnees(m, amt) {
  m.hips.position.y -= amt * 0.25 * m.scaleH;
  m.legs.forEach((L) => {
    L.thigh.rotation.x += -amt * 1.1;
    L.shin.rotation.x += amt * 2.1;
    L.foot.rotation.x += -amt * 0.9;
  });
}

export const MOVES = [
  {
    name: 'Bounce & Pump',
    emoji: '👊',
    fn(m, p, e, pulse) {
      const bob = Math.abs(Math.sin(Math.PI * p));
      bendKnees(m, (0.12 + 0.18 * (1 - bob)) * e);
      const active = Math.floor(p) % 2 ? 1 : -1;
      const pump = 1 - frac(p);
      m.arms.forEach((A) => {
        if (A.side === active) {
          A.shoulder.rotation.x = -(1.9 + 1.0 * pump * e);
          A.shoulder.rotation.z = A.side * 0.25;
          A.elbow.rotation.x = -0.9 * (1 - pump);
        } else {
          A.shoulder.rotation.x = -0.5;
          A.shoulder.rotation.z = A.side * 0.4;
          A.elbow.rotation.x = -1.6;
        }
      });
      m.neck.rotation.x = 0.3 * (1 - bob) * e;
      m.torso.rotation.x = 0.1 + pulse * 0.1;
      return {};
    },
  },
  {
    name: 'The Airplane',
    emoji: '✈️',
    fn(m, p, e) {
      m.arms.forEach((A) => {
        A.shoulder.rotation.z = A.side * 1.5;
        A.shoulder.rotation.x = -0.1;
      });
      m.torso.rotation.z = Math.sin((Math.PI * p) / 2) * 0.45 * e;
      m.torso.rotation.x = 0.2;
      m.run(p * Math.PI, 0.8 * e, 0.2);
      m.arms.forEach((A) => {
        A.shoulder.rotation.z = A.side * 1.5;
        A.shoulder.rotation.x = 0;
        A.elbow.rotation.x = 0;
      });
      return { spin: p * 0.55, orbit: true };
    },
  },
  {
    name: 'Windmill Arms',
    emoji: '🌀',
    fn(m, p, e) {
      m.arms.forEach((A) => {
        A.shoulder.rotation.x = -p * Math.PI * e - (A.side > 0 ? Math.PI : 0);
        A.shoulder.rotation.z = A.side * 0.3;
        A.elbow.rotation.x = 0;
      });
      const step = Math.floor(p) % 2 ? 1 : -1;
      m.legs.forEach((L) => (L.thigh.rotation.z = L.side * (L.side === step ? 0.35 : 0.1)));
      m.hips.rotation.z = step * 0.08;
      bendKnees(m, 0.1 + 0.1 * Math.abs(Math.sin(Math.PI * p)));
      return {};
    },
  },
  {
    name: 'The Robot',
    emoji: '🤖',
    fn(m, p, e) {
      const k = Math.floor(p * 2);
      const snap = ease(clamp01(frac(p * 2) * 5)); // snap into each pose fast
      const poses = [
        [-1.57, 0, -0.5, 0],
        [0, -1.57, 0.5, 0.4],
        [-1.57, -1.57, 0, -0.4],
        [-0.8, 0, -0.3, 0.2],
        [0, -0.8, 0.3, -0.2],
      ];
      const prev = poses[(k + poses.length - 1) % poses.length];
      const cur = poses[k % poses.length];
      const lerp = (a, b) => a + (b - a) * snap;
      m.arms[0].shoulder.rotation.x = lerp(prev[0], cur[0]);
      m.arms[1].shoulder.rotation.x = lerp(prev[1], cur[1]);
      m.arms.forEach((A) => {
        A.elbow.rotation.x = -1.57;
        A.shoulder.rotation.z = A.side * 0.15;
      });
      m.torso.rotation.y = lerp(prev[2], cur[2]) * e;
      m.neck.rotation.y = lerp(prev[3], cur[3]);
      bendKnees(m, 0.08 + (k % 2) * 0.06);
      return {};
    },
  },
  {
    name: 'Knee Slide',
    emoji: '🧎',
    fn(m, p, e, pulse) {
      // slide in on the knees, scream at the sky, then get back up
      const slideIn = ease(clamp01(p / 1.5));
      const getUp = ease(clamp01((p - 6.5) / 1.5));
      const kneel = slideIn * (1 - getUp);
      m.hips.position.y = (0.95 - 0.47 * kneel) * m.scaleH;
      m.legs.forEach((L) => {
        L.thigh.rotation.x = -0.15 * kneel;
        L.shin.rotation.x = 1.65 * kneel;
        L.foot.rotation.x = 0.5 * kneel;
        L.thigh.rotation.z = L.side * 0.15 * kneel;
      });
      m.torso.rotation.x = -0.4 * kneel;
      m.neck.rotation.x = -0.5 * kneel;
      m.arms.forEach((A) => {
        A.shoulder.rotation.x = -2.5 * kneel - (pulse * 0.3 * kneel);
        A.shoulder.rotation.z = A.side * (0.25 + 0.5 * kneel);
        A.elbow.rotation.x = -0.2;
      });
      return { slide: 2.2 * slideIn * (1 - getUp) };
    },
  },
  {
    name: 'Shoulder Shimmy',
    emoji: '💃',
    fn(m, p, e) {
      const s = Math.sin(p * TAU * 2);
      m.torso.rotation.z = 0.16 * s * e;
      m.torso.rotation.y = 0.25 * Math.sin(p * Math.PI) * e;
      m.hips.rotation.z = -0.08 * Math.sin(p * Math.PI);
      m.arms.forEach((A) => {
        A.shoulder.rotation.x = -0.5 + A.side * 0.35 * s;
        A.shoulder.rotation.z = A.side * 0.35;
        A.elbow.rotation.x = -1.3;
      });
      bendKnees(m, 0.18);
      return {};
    },
  },
  {
    name: 'Spin Move',
    emoji: '🔄',
    fn(m, p, e) {
      const q = p % 4;
      let spin = Math.floor(p / 4) * TAU;
      if (q < 1) {
        spin += ease(q) * TAU;
        m.arms.forEach((A) => {
          A.shoulder.rotation.z = A.side * 1.35;
        });
        m.legs[0].thigh.rotation.x = -0.5;
        m.legs[0].shin.rotation.x = 1.2;
      } else {
        spin += TAU;
        // "V" for victory
        m.arms.forEach((A) => {
          A.shoulder.rotation.x = -2.6;
          A.shoulder.rotation.z = A.side * 0.55;
        });
        bendKnees(m, 0.1 + 0.15 * Math.abs(Math.sin(Math.PI * p)) * e);
      }
      return { spin };
    },
  },
  {
    name: 'Jump & Shout',
    emoji: '🦘',
    fn(m, p, e) {
      const q = (p % 2) / 2;
      const air = q < 0.5 ? Math.sin(q * 2 * Math.PI) : 0;
      const land = q >= 0.5 && q < 0.65 ? 1 - (q - 0.5) / 0.15 : 0;
      m.legs.forEach((L) => {
        L.thigh.rotation.x = -0.7 * air;
        L.shin.rotation.x = 1.3 * air;
      });
      bendKnees(m, 0.3 * land);
      m.arms.forEach((A) => {
        A.shoulder.rotation.x = -2.8 * air - 0.3;
        A.shoulder.rotation.z = A.side * (0.3 + 0.9 * air);
        A.elbow.rotation.x = -0.3;
      });
      m.neck.rotation.x = -0.4 * air;
      return { lift: air * 0.5 * e };
    },
  },
  {
    name: 'Crowd Wave',
    emoji: '🙌',
    fn(m, p, e) {
      const sway = Math.sin(Math.PI * p);
      m.arms.forEach((A) => {
        A.shoulder.rotation.x = -2.9;
        A.shoulder.rotation.z = A.side * 0.2 + 0.55 * sway * e;
        A.elbow.rotation.x = -0.15;
      });
      m.torso.rotation.z = -0.15 * sway;
      m.hips.rotation.z = 0.06 * sway;
      const step = sway > 0 ? 1 : -1;
      m.legs.forEach((L) => (L.thigh.rotation.z = L.side * (L.side === step ? 0.3 : 0.08)));
      bendKnees(m, 0.08 + 0.1 * Math.abs(Math.cos(Math.PI * p)));
      return {};
    },
  },
];

export const BEATS_PER_MOVE = 8;
