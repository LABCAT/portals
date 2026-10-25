import { seedToInt } from './portalLook.js';

// Seed → framing and light, shared by every movement's look, so two seeds
// with the same tunnel still differ in more than colour. Every value becomes
// a shader uniform (scalars, so ?uRoll=0 etc. override them):
// - the camera's aim off the tunnel axis puts the vanishing point off-centre;
// - sway drifts that aim in a figure eight, roll rocks the camera; both once
//   per loop, so it stays seamless;
// - the light: a dark tunnel into a dim light, the usual glow, or bright.
// Its own random stream (salted per movement), so the looks' own draws are
// untouched. { aim: false } keeps the camera on the axis (no aim or sway,
// roll only) for a movement built to be seen head-on.

const LIGHTS = {
  glow: { uCore: 1, uExposure: 1 },
  deep: { uCore: 0.4, uExposure: 0.9 },
  bright: { uCore: 1.3, uExposure: 1.35 },
};

const mulberry32 = (a) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const createFraming = (seed, salt = 0, { aim: canAim = true } = {}) => {
  const rand = mulberry32(seedToInt(seed) ^ Math.imul(salt + 1, 0x85ebca6b));
  for (let i = 0; i < 4; i++) rand();
  const range = (a, b) => a + (b - a) * rand();
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  const light = pick(['glow', 'glow', 'deep', 'bright']);
  const offAxis = rand() < 0.6 && canAim;
  const aim = offAxis ? range(0.12, 0.25) : 0;
  const aimAngle = rand() * Math.PI * 2;
  const sway = rand() < 0.5 && canAim ? range(0.04, 0.1) : 0;
  const roll = rand() < 0.5 ? range(0.08, 0.2) : 0;

  return {
    light,
    offAxis,
    uniforms: {
      uAimX: aim * Math.cos(aimAngle),
      uAimY: aim * Math.sin(aimAngle),
      uSway: sway,
      uRoll: roll,
      ...LIGHTS[light],
    },
  };
};
