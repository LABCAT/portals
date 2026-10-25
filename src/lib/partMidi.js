import { Midi } from '@tonejs/midi';

// Note events for one suite part, from that part's own .mid (loaded the same
// way as the lab's p.loadMidi: Midi.fromUrl). The part exports carry no
// track names, but every part of a movement keeps each instrument in the same
// track slot, so a sketch names its roles by slot: { lead: 6, bass: 2 }.
// Times are seconds from the part's first beat.

const cache = new Map();

/** { role: [{ time, duration, midi }] } for the part's .mid at `url`
 * (empty roles if it's missing, so the visuals still run). */
export const loadPartNotes = (url, roles) => {
  if (!cache.has(url)) {
    cache.set(
      url,
      Midi.fromUrl(url).catch((err) => {
        console.warn(`[partMidi] no MIDI at ${url}, running without note events`, err);
        return null;
      })
    );
  }
  return cache.get(url).then((midi) => {
    const out = {};
    for (const [role, slot] of Object.entries(roles)) {
      out[role] = (midi?.tracks[slot]?.notes ?? []).map((n) => ({ time: n.time, duration: n.duration, midi: n.midi }));
    }
    return out;
  });
};
