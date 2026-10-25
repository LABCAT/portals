import frag from '../shaders/portalWarp.frag?raw';
import { createWarpLook } from '../lib/warpLook.js';
import { loadPartNotes } from '../lib/partMidi.js';

// Movement 3, Continuum: a flight down a hyperspace tunnel (portalWarp.frag),
// streaks of starlight rushing past, lit by each part's own MIDI. Every lead
// note flares it and turns the streaks a click; its held notes change the
// colours, dipping like the other movements' changes. Thor 2, the first
// movement's pad, comes in for Parts B and C and brings Singularity's
// nebula flooding back, each chord changing the colours with Singularity's
// 2-bar dip. Part C adds a third, fastest streak layer. All through, the
// plucks twinkle the stars, the bass breathes the tunnel and the stabs
// flash it. Between parts the tunnel spins up and burns to white, and the
// next part opens out of it.

// Track slots in this movement's part exports (the same in every part).
const ROLES = { lead: 6, bass: 2, pulse: 4, stab: 9, shimmer: 11, drone: 12, thor: 14 };
// The part change: the tunnel spins up over the last SPIN_BEATS and burns
// to white over the last beat, clearing over half a beat.
const SPIN_BEATS = 2;
const SPIN_TURNS = 0.5;
const FLASH_IN_BEATS = 1;
const FLASH_OUT_BEATS = 0.5;
// Changes dip to DIP_FLOOR (DIP_OUT before, back over DIP_IN), shallower
// when the changes come fast.
const DIP_OUT = 0.3;
const DIP_IN = 0.6;
const DIP_FLOOR = 0.12;
const FAST_FLOOR = 0.45;
// Lead notes: a held note (this many beats or more) changes the colours;
// every note turns the streaks a click, eased over CLICK seconds.
const HELD_BEATS = 0.5;
const CLICK = 0.15;
// Thor 2's light: rises over the chord's first beat, settles to BACK_HOLD.
const BACK_HOLD = 0.6;
// Part C's doubled material fades in over its first bar.
const LAYER_BEATS = 4;

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
// How many of the sorted times have started by tm.
const started = (times, tm) => {
  let k = 0;
  while (k < times.length && times[k] <= tm) k++;
  return k;
};

// MIDI → light at part time tm.
const envelopes = (notes, tm, bpm) => {
  const e = { note: 0, bass: 0, stab: 0, pulse: 0, pulseSeed: 0, shimmer: 0, drone: 0 };
  if (!notes) return e;
  const beat = 60 / bpm;
  for (const n of notes.lead) {
    const dt = tm - n.time;
    if (dt < 0) continue;
    if (dt < 4) e.note = Math.max(e.note, decay(dt, 0.25));
  }
  for (const n of notes.bass) e.bass = Math.max(e.bass, decay(tm - n.time, 0.25));
  for (const n of notes.stab) e.stab = Math.max(e.stab, decay(tm - n.time, 0.2));
  notes.pulse.forEach((n, i) => {
    if (n.time > tm) return;
    e.pulse = Math.max(e.pulse, decay(tm - n.time, 0.1));
    e.pulseSeed = i + 1;
  });
  for (const n of notes.shimmer) e.shimmer = Math.max(e.shimmer, sustain(n, tm, beat, beat));
  for (const n of notes.drone) e.drone = Math.max(e.drone, decay(tm - n.time, 2 * beat));
  return e;
};

// Unique sorted start times (chords' voices start together).
const onsets = (list) => [...new Set(list.map((n) => Math.round(n.time * 1000)))].sort((a, b) => a - b).map((ms) => ms / 1000);

// Which change is up at tm (the next one at every change time after the
// first) and the dip around the change times; none at the part's end (the
// part change covers it).
const changeAt = (times, tm, beat) => {
  const k = started(times, tm);
  if (!times.length) return { index: 0, dip: 1 };
  const t0 = k ? times[k - 1] : 0;
  const t1 = k < times.length ? times[k] : Infinity;
  const gap = Math.min(t1, t0 + 8 * beat) - t0;
  const floorFor = (space) => FAST_FLOOR + (DIP_FLOOR - FAST_FLOOR) * Math.min(1, space / beat);
  const rise = k > 1 ? floorFor(gap) + (1 - floorFor(gap)) * ease((tm - t0) / Math.min(DIP_IN, gap * 0.5)) : 1;
  const fall = t1 < Infinity ? floorFor(t1 - t0) + (1 - floorFor(t1 - t0)) * ease((t1 - tm) / Math.min(DIP_OUT, (t1 - t0) * 0.35)) : 1;
  return { index: Math.max(0, k - 1), dip: Math.min(rise, fall) };
};

export const createContinuum = () => {
  const notesByUrl = new Map();

  return {
    frag,
    createLook: createWarpLook,
    describe: (look) => `hues ${look.palettes.map((pal) => pal.hue).join('→')}`,
    /** Load a part's notes (resolves when they're in). */
    prepare: (track) =>
      track.midi
        ? loadPartNotes(track.midi, ROLES).then((n) => {
            notesByUrl.set(track.midi, n);
          })
        : Promise.resolve(),
    // This movement's per-frame uniforms; returns the brightness to fold
    // into uFade (the change dips).
    draw: (shader, look, f) => {
      const notes = notesByUrl.get(f.track?.midi) ?? null;
      const beat = 60 / f.bpm;
      const tm = f.tm;
      const e = envelopes(notes, tm, f.bpm);
      shader.setUniform('uNote', e.note);
      shader.setUniform('uBass', e.bass);
      shader.setUniform('uStab', e.stab);
      shader.setUniform('uPulse', e.pulse);
      shader.setUniform('uPulseSeed', e.pulseSeed);
      shader.setUniform('uShimmer', e.shimmer);
      shader.setUniform('uDrone', e.drone);

      // Thor 2 (Parts B and C): its chords drive the changes and the light;
      // otherwise the lead's held notes change the colours.
      const chords = onsets(notes?.thor ?? []);
      const lead = notes?.lead ?? [];
      let change;
      let palette;
      let back = 0;
      if (chords.length) {
        change = changeAt(chords, tm, beat);
        palette = change.index % look.palettes.length;
        const k = started(chords, tm);
        if (k) back = BACK_HOLD + (1 - BACK_HOLD) * decay(tm - chords[k - 1], beat) * Math.min(1, (tm - chords[k - 1]) / (0.25 * beat));
      } else {
        change = changeAt(onsets(lead.filter((n) => n.duration >= HELD_BEATS * beat - 1e-3)), tm, beat);
        palette = change.index % look.palettes.length;
      }
      for (const [name, value] of Object.entries(look.palettes[palette].colours)) shader.setUniform(name, value);
      shader.setUniform('uBack', back);
      const layer = f.track?.part === 'c' ? ease(tm / (LAYER_BEATS * beat)) : 0;
      shader.setUniform('uLayer', layer);

      // Turn: a click per lead note, plus the spin-up at the part end.
      const times = lead.map((n) => n.time);
      const k = started(times, tm);
      let turn = k ? look.click * (k - 1 + ease((tm - times[k - 1]) / CLICK)) : 0;
      let flash = 0;
      if (f.flight) {
        const { toEnd, since } = f.flight;
        if (toEnd < SPIN_BEATS * beat) turn += Math.sign(look.click) * SPIN_TURNS * Math.PI * 2 * Math.pow(1 - Math.max(0, toEnd) / (SPIN_BEATS * beat), 3);
        const rise = toEnd < FLASH_IN_BEATS * beat ? Math.pow(1 - Math.max(0, toEnd) / (FLASH_IN_BEATS * beat), 3) : 0;
        const clear = since !== null && since < FLASH_OUT_BEATS * beat ? 1 - Math.max(0, since) / (FLASH_OUT_BEATS * beat) : 0;
        flash = Math.max(rise, ease(clear));
      }
      shader.setUniform('uTurn', turn);
      shader.setUniform('uFlash', flash);
      return flash > 0 ? 1 : change.dip;
    },
  };
};
