import frag from '../shaders/portalHive.frag?raw';
import { createHiveLook } from '../lib/hiveLook.js';
import { loadPartNotes } from '../lib/partMidi.js';

// Movement 2, Event Horizon: a flight down a neon hexagonal tunnel through
// honeycomb gates (portalHive.frag), lit by each part's own MIDI. Every
// lead note changes the colour scheme (dipping like Singularity's 2-bar
// change, scaled to the note spacing) and lights one hex cell (its pitch
// picks which; the root lights the centre); long notes bloom every cell.
// Each part adds its new instrument: Part B's bass pulses the frames, Part
// C's stabs flare the lasers and its arps spark along the circuits. Between
// parts the picture burns to white and clears into the next.

// Track slots in this movement's part exports (the same in every part).
const ROLES = { lead: 6, bass: 2, arp: 4, stab: 9, shimmer: 11, drone: 12 };
// The part change: burn to white over the last beat, clear over half a beat.
const FLASH_IN_BEATS = 1;
const FLASH_OUT_BEATS = 0.5;
// Colour change per lead note: Singularity's dip (0.3s out, 0.6s in, to
// 12%) for notes with a beat or more around them; fast runs get a shorter,
// shallower one (to RUN_FLOOR) so they pulse rather than strobe.
const DIP_OUT = 0.3;
const DIP_IN = 0.6;
const DIP_FLOOR = 0.12;
const RUN_FLOOR = 0.6;

const decay = (dt, tau) => (dt < 0 ? 0 : Math.exp(-dt / tau));
const ease = (x) => {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
};
// Held notes: rise over `att`, hold, fall over `rel` after the note ends.
const sustain = (n, t, att, rel) => {
  const dt = t - n.time;
  if (dt < 0) return 0;
  const peak = Math.min(1, n.duration / att);
  return dt < n.duration ? Math.min(1, dt / att) : peak * Math.max(0, 1 - (dt - n.duration) / rel);
};

// MIDI → light at part time tm.
const envelopes = (notes, tm, bpm) => {
  const e = { lit: [0, 0, 0, 0, 0, 0, 0], note: 0, bloom: 0, bass: 0, stab: 0, arp: 0, arpSeed: 0, shimmer: 0, drone: 0 };
  if (!notes) return e;
  const beat = 60 / bpm;
  const root = (notes.lead[0]?.midi ?? 0) % 12;
  for (const n of notes.lead) {
    const dt = tm - n.time;
    if (dt < 0 || dt > 4) continue;
    const cell = n.midi % 12 === root ? 0 : 1 + (n.midi % 6);
    e.lit[cell] = Math.max(e.lit[cell], decay(dt, 0.3));
    e.note = Math.max(e.note, decay(dt, 0.25));
    if (n.duration >= beat) e.bloom = Math.max(e.bloom, decay(dt, n.duration * 0.5));
  }
  for (const n of notes.bass) e.bass = Math.max(e.bass, decay(tm - n.time, 0.25));
  for (const n of notes.stab) e.stab = Math.max(e.stab, decay(tm - n.time, 0.2));
  notes.arp.forEach((n, i) => {
    if (n.time > tm) return;
    e.arp = Math.max(e.arp, decay(tm - n.time, 0.12));
    e.arpSeed = i + 1;
  });
  for (const n of notes.shimmer) e.shimmer = Math.max(e.shimmer, sustain(n, tm, beat, beat));
  for (const n of notes.drone) e.drone = Math.max(e.drone, sustain(n, tm, 0.5, 1));
  return e;
};

// The colour change on lead notes: which of the look's schemes is up at
// part time tm (the next one on every note after the first), and the dip
// brightness around the notes. Each note's dip depth comes from the shorter
// gap either side of it; the part's first note fades in from its dip, and
// the part's end has none (the part-change flash covers it).
const noteChange = (notes, tm, len, bpm, count) => {
  const lead = notes?.lead;
  if (!lead?.length) return { palette: 0, dip: 1 };
  const end = len ?? Infinity;
  const beat = 60 / bpm;
  let k = 0;
  while (k < lead.length && lead[k].time <= tm) k++;
  const at = (i) => (i < lead.length ? lead[i].time : end);
  const floorAt = (i) => {
    const before = i > 0 ? at(i) - at(i - 1) : Infinity;
    const space = Math.min(before, at(i + 1) - at(i));
    return RUN_FLOOR + (DIP_FLOOR - RUN_FLOOR) * Math.min(1, space / beat);
  };
  const t0 = k > 0 ? at(k - 1) : 0;
  const t1 = at(k);
  const gap = Math.max(1e-3, t1 - t0);
  const f0 = k > 0 ? floorAt(k - 1) : 1;
  const f1 = k < lead.length ? floorAt(k) : 1;
  const rise = f0 + (1 - f0) * ease((tm - t0) / Math.min(DIP_IN, gap * 0.5));
  const fall = f1 + (1 - f1) * ease((t1 - tm) / Math.min(DIP_OUT, gap * 0.35));
  return { palette: Math.max(0, k - 1) % count, dip: Math.min(rise, fall) };
};

export const createEventHorizon = () => {
  const notesByUrl = new Map();

  return {
    frag,
    createLook: createHiveLook,
    // The honeycomb is 6-fold and seen head-on: the camera only rolls.
    framing: { aim: false },
    describe: (look) => `hues ${look.palettes.map((pal) => pal.hue).join('→')} · ${look.uniforms.uGates} gates`,
    /** Load a part's notes (resolves when they're in). */
    prepare: (track) =>
      track.midi
        ? loadPartNotes(track.midi, ROLES).then((n) => {
            notesByUrl.set(track.midi, n);
          })
        : Promise.resolve(),
    // This movement's per-frame uniforms; returns the brightness to fold
    // into uFade (the note dips).
    draw: (shader, look, f) => {
      const notes = notesByUrl.get(f.track?.midi) ?? null;
      const e = envelopes(notes, f.tm, f.bpm);
      const change = noteChange(notes, f.tm, f.len, f.bpm, look.palettes.length);
      for (const [name, value] of Object.entries(look.palettes[change.palette].colours)) shader.setUniform(name, value);
      shader.setUniform('uLit', e.lit);
      shader.setUniform('uNote', e.note);
      shader.setUniform('uBloom', e.bloom);
      shader.setUniform('uBass', e.bass);
      shader.setUniform('uStab', e.stab);
      shader.setUniform('uArp', e.arp);
      shader.setUniform('uArpSeed', e.arpSeed);
      shader.setUniform('uShimmer', e.shimmer);
      shader.setUniform('uDrone', e.drone);

      let flash = 0;
      if (f.flight) {
        const beat = 60 / f.bpm;
        const { toEnd, since } = f.flight;
        const rise = toEnd < FLASH_IN_BEATS * beat ? Math.pow(1 - Math.max(0, toEnd) / (FLASH_IN_BEATS * beat), 3) : 0;
        const clear = since !== null && since < FLASH_OUT_BEATS * beat ? 1 - Math.max(0, since) / (FLASH_OUT_BEATS * beat) : 0;
        flash = Math.max(rise, ease(clear));
      }
      shader.setUniform('uFlash', flash);
      return change.dip;
    },
  };
};
