// Seed → look for Portal Loops. Every value here becomes a shader uniform.
// Ranges are kept tight on purpose: each seed should land somewhere good,
// variety comes from combining a few strong choices, not wide sliders.

const TAU = Math.PI * 2;

const mulberry32 = (a) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const seedToInt = (seed) => {
  const n = Number(seed);
  if (Number.isInteger(n)) return n >>> 0;
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
};

// Hex in, linear RGB out (the shader mixes in linear, gamma at the end).
const lin = (hex) => [1, 3, 5].map((i) => Math.pow(parseInt(hex.slice(i, i + 2), 16) / 255, 2.2));

// Vivid cosmic palettes: deep fills the dark gas, a/b are the two nebula
// tones (mixed by the warp field), hot is star cores and the far light.
const PALETTES = [
  { name: 'nebula', deep: '#14052e', a: '#6a1bff', b: '#ff2fa8', hot: '#ffe0f6' },
  { name: 'ocean', deep: '#021430', a: '#0a5cff', b: '#00e0ff', hot: '#e6fdff' },
  { name: 'aurora', deep: '#031c1c', a: '#00c896', b: '#7a5cff', hot: '#eafff6' },
  { name: 'flare', deep: '#1a0630', a: '#ff2e63', b: '#ff9ed2', hot: '#fff0f6' },
  { name: 'ultraviolet', deep: '#0c0230', a: '#3d2bff', b: '#c13bff', hot: '#f3e6ff' },
  { name: 'toxic', deep: '#04180a', a: '#28e05a', b: '#00c8ff', hot: '#f2ffe8' },
  { name: 'candy', deep: '#200a30', a: '#ff5ec4', b: '#5ee7ff', hot: '#ffffff' },
  { name: 'ice', deep: '#0a1030', a: '#5a7dff', b: '#c8f4ff', hot: '#ffffff' },
];

export const createPortalLook = (seed, { bpm = 120, beats = 16, speed = 2 } = {}) => {
  const rand = mulberry32(seedToInt(seed));
  for (let i = 0; i < 4; i++) rand();
  const range = (a, b) => a + (b - a) * rand();
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  const palette = pick(PALETTES);
  const sides = pick([0, 0, 0, 3, 4, 5, 6]);

  // Speed comes from the BPM only (not the seed): `speed` tube radii pass
  // each beat, constant, and the loop is a whole number of beats.
  const period = beats * speed;

  const bend = rand() < 0.35 ? 0 : range(0.03, 0.08);
  const pathFreq = [pick([1, 2]), pick([1, 2, 3])];
  const pathAmp = pathFreq.map((f) => (bend * period) / (TAU * f));

  return {
    seed: String(seed),
    palette: palette.name,
    sides,
    bpm,
    beats,
    loopSec: (beats * 60) / bpm,
    uniforms: {
      uBeats: beats,
      uPeriod: period,
      uRadius: 1,
      uSides: sides,
      uCells: pick([5, 6, 8, 10]),
      uTwist: pick([-1, 0, 0, 1]),
      // Whole turns per loop keep it seamless; at 8s a turn is brisk, so rare.
      uSpin: pick([-1, 0, 0, 0, 0, 1]),
      uPathAmp: pathAmp,
      uPathFreq: pathFreq,
      uFocal: range(1.1, 1.6),
      uStretch: range(1.5, 4),
      uWarp: range(0.3, 1),
      uContrast: range(1.8, 2.8),
      uStars: range(0.4, 1),
      uDepth: range(0.06, 0.14),
      uDeep: lin(palette.deep),
      uColA: lin(palette.a),
      uColB: lin(palette.b),
      uHot: lin(palette.hot),
    },
  };
};
