import frag from '../shaders/portalLoop.frag?raw';
import { createPortalLook } from '../lib/portalLook.js';

// Movement 1, Singularity: the seeded nebula-tube flight (portalLoop.frag).
// Within a look the colour scheme steps every paletteBars bars through the
// look's 4 palettes (its own first); each change dips to near-black and
// swaps at the bottom, on the bar line. Between parts a ring of light rushes
// out of the core over the last bar and passes over you on the bar line,
// and the next part opens out of the white.
//   ?paletteBars= bars per colour scheme (default 2, 0 = off)

const PALETTE_KEYS = ['uDeep', 'uColA', 'uColB', 'uHot'];
// Colour change dip: DIP_OUT before the bar line, back over DIP_IN, to
// DIP_FLOOR (not black), eased.
const DIP_OUT = 0.3;
const DIP_IN = 0.6;
const DIP_FLOOR = 0.12;
// Fly-through: the ring rushes in over the part's last bar, and the light
// clears over the first beat of the next part.
const RING_BEATS = 4;
const FLASH_BEATS = 1;

export const createSingularity = (params) => {
  const paletteBars = params.has('paletteBars') ? Math.max(0, Number(params.get('paletteBars')) || 0) : 2;

  return {
    frag,
    createLook: createPortalLook,
    describe: (look) => {
      const colours = paletteBars ? look.palettes.map((pal) => pal.name).join('→') : look.palette;
      return `${colours} · ${look.sides || 'round'}`;
    },
    // This movement's per-frame uniforms; returns the brightness to fold
    // into uFade (the colour-change dip).
    draw: (shader, look, f) => {
      const beat = 60 / f.bpm;
      let ring = 0;
      let flash = 0;
      if (f.flight) {
        const { toEnd, since } = f.flight;
        if (toEnd < RING_BEATS * beat) ring = 1 - Math.max(0, toEnd) / (RING_BEATS * beat);
        if (since !== null && since < FLASH_BEATS * beat) flash = 1 - Math.max(0, since) / (FLASH_BEATS * beat);
      }
      shader.setUniform('uRing', ring);
      shader.setUniform('uFlash', flash);

      if (!paletteBars) return 1;
      const sec = (paletteBars * 4 * 60) / f.bpm;
      const seg = Math.floor(f.t / sec);
      const n = look.palettes.length;
      const pal = look.palettes[((seg % n) + n) % n];
      for (const key of PALETTE_KEYS) shader.setUniform(key, pal[key]);
      // The fly-through replaces the dip on its bar line.
      if (ring > 0 || flash > 0) return 1;
      const into = f.t - seg * sec;
      const toNext = sec - into;
      const x = toNext < DIP_OUT ? toNext / DIP_OUT : into < DIP_IN ? into / DIP_IN : 1;
      return DIP_FLOOR + (1 - DIP_FLOOR) * x * x * (3 - 2 * x);
    },
  };
};
