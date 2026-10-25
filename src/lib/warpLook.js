import { seedToInt } from './portalLook.js';

// Seed → look for #PortalsNo3 Continuum (the hyperspace tunnel). Every
// value becomes a shader uniform. Colours are generated, not picked from a
// list: five space colours round a seeded hue in a seeded harmony (close,
// split, triad or opposite) and a pale light at the end. Each look carries
// PALETTES such sets that the music steps through.

const PALETTES = 6;

const mulberry32 = (a) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Hue in turns, sRGB out; then linear (the shader mixes in linear).
const hsv = (h, s, v) => {
  const f = (n) => {
    const k = (n + (((h % 1) + 1) % 1) * 6) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)].map((c) => Math.pow(c, 2.2));
};

export const createWarpLook = (seed, { bpm = 120, beats = 16, speed = 2 } = {}) => {
  const rand = mulberry32(seedToInt(seed) ^ 0x27d4eb2f);
  for (let i = 0; i < 4; i++) rand();
  const range = (a, b) => a + (b - a) * rand();
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  // One set of colours from a hue; the harmony comes from the seed.
  const harmony = pick([
    [0, 0.04, -0.04, 0.08, -0.08],
    [0, 0.42, 0.58, 0.05, 0.47],
    [0, 0.33, 0.67, 0.05, 0.38],
    [0, 0.5, 0.06, 0.56, -0.06],
  ]);
  const set = (hue) => {
    const tones = harmony.map((off) => hsv(hue + off + range(-0.02, 0.02), range(0.75, 1), range(0.55, 1)));
    return {
      hue: Math.round((((hue % 1) + 1) % 1) * 360),
      colours: {
        uC0: tones[0],
        uC1: tones[1],
        uC2: tones[2],
        uC3: tones[3],
        uC4: tones[4],
        uLight: hsv(hue + 0.08, range(0.1, 0.3), 1),
      },
    };
  };
  const firstHue = rand();
  const step = range(0.15, 0.35) * pick([1, -1]);
  const palettes = Array.from({ length: PALETTES }, (_, i) => set(firstHue + i * step));

  // Speed from the BPM only (as in #PortalsNo1): `speed` tube radii per
  // beat, and the loop is a whole number of beats; every count along the
  // tube is per period, so it's seamless.
  const period = beats * speed;

  const look = {
    seed: String(seed),
    bpm,
    beats,
    loopSec: (beats * 60) / bpm,
    palettes,
    // Streak turn per lead note (radians).
    click: range(0.15, 0.35) * pick([1, -1]),
    uniforms: {
      uPeriod: period,
      // Wide, normal or long lens: picks that show, not a range that doesn't.
      uFocal: pick([0.9, 1.3, 1.8]),
      uDepth: range(0.025, 0.045),
      uCells: pick([6, 8, 10]),
      uStretch: range(1.5, 3),
      uTwist: pick([1, 1, 2]) * pick([1, -1]),
      uSpin: pick([0, 1, -1]),
      uLanes: pick([16, 32, 48]),
      // Short dashes or long trails.
      uStreak: pick([1.5, 5]),
      ...palettes[0].colours,
    },
  };
  // The far light stays the same size on screen whatever the lens.
  look.uniforms.uDepth *= 1.3 / look.uniforms.uFocal;
  return look;
};
