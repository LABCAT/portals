import { seedToInt } from './portalLook.js';

// Seed → look for #PortalsNo2 Event Horizon (the neon honeycomb tunnel).
// Every value becomes a shader uniform. Colours are generated, not picked
// from a list: a neon hue for the frames, the circuits roughly opposite it,
// lasers near the frames, an accent off the circuits and a near-black
// background between them. Each look carries PALETTES such schemes (its own
// first, the rest stepped round the colour wheel) that the lead notes step
// through, so every seed is a new set of schemes that still reads as neon.

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

export const createHiveLook = (seed, { bpm = 120, beats = 16, speed = 2 } = {}) => {
  const rand = mulberry32(seedToInt(seed) ^ 0x9e3779b9);
  for (let i = 0; i < 4; i++) rand();
  const range = (a, b) => a + (b - a) * rand();
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  // One colour scheme from a frame hue; the relationships come from the seed.
  const circuitOffset = range(0.33, 0.58);
  const laserOffset = pick([0, 0, -0.06, 0.06]);
  const accentOffset = range(0.1, 0.2);
  const innerOffset = pick([0, laserOffset, circuitOffset]);
  const frameSat = range(0.75, 1);
  const bgValue = range(0.05, 0.1);
  const scheme = (hue) => ({
    hue: Math.round((((hue % 1) + 1) % 1) * 360),
    colours: {
      uBg: hsv(hue + circuitOffset / 2, 0.85, bgValue),
      uFrame: hsv(hue, frameSat, 1),
      uInner: hsv(hue + innerOffset, 0.75, 1),
      uCircuit: hsv(hue + circuitOffset, 0.85, 1),
      uLaser: hsv(hue + laserOffset, 0.9, 1),
      uAccent: hsv(hue + circuitOffset + accentOffset, 0.9, 1),
    },
  });
  const firstHue = rand();
  const step = range(0.15, 0.35) * pick([1, -1]);
  const palettes = Array.from({ length: PALETTES }, (_, i) => scheme(firstHue + i * step + (i ? range(-0.04, 0.04) : 0)));

  // Speed from the BPM only (as in #PortalsNo1): `speed` tube radii per
  // beat, and the loop is a whole number of beats and of honeycomb gates.
  const period = beats * speed;
  const around = pick([2, 3, 4]);
  const stretch = range(1, 2.5);

  const look = {
    seed: String(seed),
    bpm,
    beats,
    loopSec: (beats * 60) / bpm,
    palettes,
    uniforms: {
      uPeriod: period,
      uGates: pick([2, 2, 4]),
      // Wide, normal or long lens: picks that show, not a range that doesn't.
      uFocal: pick([0.9, 1.3, 1.8]),
      uDepth: range(0.05, 0.1),
      // Sixth turns per loop (the tunnel is 6-fold, so it stays seamless).
      uSpin: pick([0, 0, 0, 1, -1]),
      uCellsAround: around,
      // Circuit cells per period along the tunnel: about square, then
      // stretched into streaks.
      uCellsDeep: Math.max(2, Math.round((period * around) / (1.155 * stretch))),
      // Sparse or busy circuits, tight or open honeycomb.
      uDensity: pick([0.3, 0.7]),
      uGap: pick([0.12, 0.3]),
      uBand: range(0.12, 0.25),
      uDouble: rand() < 0.5 ? 1 : 0,
      uLasers: pick([6, 6, 12]),
      ...palettes[0].colours,
    },
  };
  // The far light stays the same size on screen whatever the lens.
  look.uniforms.uDepth *= 1.3 / look.uniforms.uFocal;
  return look;
};
