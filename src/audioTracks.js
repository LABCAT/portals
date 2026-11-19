// Intergalactic Portals: one song (`IntergalticPortals.mp3` + `.mid`) playing
// the whole suite, so a capture with no `?part` renders the full movement run
// and a `?movement=` renders one movement. The song is 97 bpm, 4/4, 73 bars,
// starting on bar 1; the suite `.mid` keeps the same 17-track slot layout as
// the old per-part files, with notes at absolute song time.
import { resolvePart } from '@labcat2020/p5.audioreactive/parts.js';

export const SUITE_BPM = 97;

// The one song behind every movement's page.
export const SONG = {
  audio: '/audio/IntergalticPortals.mp3',
  midi: '/audio/IntergalticPortals.mid',
  bpm: SUITE_BPM,
};

export const SUITE = [
  { number: 1, title: 'Singularity', route: 'number-1' },
  { number: 2, title: 'Event Horizon', route: 'number-2' },
  { number: 3, title: 'Continuum', route: 'number-3' },
];

// The nine parts, keyed `1a`…`3c`, as 1-based inclusive bar ranges (like the
// DAW ruler). Each is tagged with its movement and its letter within it, so a
// route can pick its movement's first part and the address bar can keep a bare
// `?part=` scoped to the movement. These keys feed prev/next and the control
// panel, so movement-length ranges must NOT live here (see MOVEMENTS).
export const SUITE_PARTS = {
  '1a': { bars: [1, 8], movement: 1, part: 'a', title: 'Singularity · Part A' },
  '1b': { bars: [9, 16], movement: 1, part: 'b', title: 'Singularity · Part B' },
  '1c': { bars: [17, 24], movement: 1, part: 'c', title: 'Singularity · Part C' },
  '2a': { bars: [25, 32], movement: 2, part: 'a', title: 'Event Horizon · Part A' },
  '2b': { bars: [33, 40], movement: 2, part: 'b', title: 'Event Horizon · Part B' },
  '2c': { bars: [41, 48], movement: 2, part: 'c', title: 'Event Horizon · Part C' },
  '3a': { bars: [49, 56], movement: 3, part: 'a', title: 'Continuum · Part A' },
  '3b': { bars: [57, 64], movement: 3, part: 'b', title: 'Continuum · Part B' },
  '3c': { bars: [65, 73], movement: 3, part: 'c', title: 'Continuum · Part C' },
};

// Whole-movement bar ranges, used only for capture (`?movement=1|2|3`). They
// are deliberately not part ids, so they never appear in prev/next or the
// control panel.
export const MOVEMENTS = {
  1: { bars: [1, 24], movement: 1, title: 'Singularity' },
  2: { bars: [25, 48], movement: 2, title: 'Event Horizon' },
  3: { bars: [49, 73], movement: 3, title: 'Continuum' },
};

const rangeOf = (parts, id, duration) => resolvePart(parts, id, { bpm: SUITE_BPM, duration });

// Each part's absolute { start, end } (seconds), precomputed once.
export const PART_RANGES = Object.fromEntries(
  Object.keys(SUITE_PARTS).map((id) => [id, { id, ...SUITE_PARTS[id], ...rangeOf(SUITE_PARTS, id) }])
);

/** The part whose [start, end) contains absolute song time `t`; past the last
 *  bar it holds the final part (the encoder's trailing padding), else null. */
export const partAt = (t) => {
  let last = null;
  for (const range of Object.values(PART_RANGES)) {
    if (t >= range.start) last = range;
    if (t >= range.start && t < range.end) return range;
  }
  return last;
};
