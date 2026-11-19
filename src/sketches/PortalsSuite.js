import p5 from 'p5';
import '@lib/p5.audioReact.js';
import initCapture from '@labcat2020/p5.audioreactive-capture';
import { resolvePart } from '@labcat2020/p5.audioreactive/parts.js';
import '../lib/p5.fps.js';
import vert from '../shaders/portalLoop.vert?raw';
import { SONG, SUITE, SUITE_PARTS, MOVEMENTS, SUITE_BPM, PART_RANGES, partAt } from '../audioTracks.js';
import { sketchMetadata } from '../sketchMetadata.js';
import { createSingularity } from '../movements/singularity.js';
import { createEventHorizon } from '../movements/eventHorizon.js';
import { createContinuum } from '../movements/continuum.js';
import { createFraming } from '../lib/framing.js';

// Intergalactic Portals — one player for the whole suite, behind every
// movement's page (/number-1 Singularity, /number-2 Event Horizon,
// /number-3 Continuum). One song (public/audio/IntergalticPortals.mp3 + .mid)
// drives all three movements; each movement is a shader + seeded look
// (src/movements/), and this host owns the clock, the audio and the controls.
// The current movement, part and time-within-part are derived from absolute
// song time, so a part flows through the suite and a capture renders the whole
// song (or a movement, or one part) from the same code path. Prev/next walk
// all nine parts across movements, the address bar follows (/number-2?part=b)
// without a reload, and the part player keeps ?part= / ?seed=.
//   ?part=     a / b / c (of this page's movement) or a full id like 2b; plays
//              and captures that part
//   ?movement= 1 / 2 / 3 — capture that whole movement (a movement reel)
//   ?seed=     look, reproducible (capture derives each part's look from it)
//   ?bpm=      motion tempo; default: the song's 97
//   ?beats=    loop length in beats (default 16)
//   ?speed=    tube radii flown per beat (default 2)
//   ?auto=     1/0 new look on every part change (default on unless ?seed)
//   ?t=        freeze at a time in seconds (stills)
//   ?uX=       override any scalar uniform, e.g. ?uGlow=0.5
//   ?fps=0     hide the FPS badge
// Keys: N / P next / previous seed, R random seed, A auto look, I seed info,
// F FPS badge. Clicking the canvas plays/pauses. Capture uses its frame
// counter (frame N is always the same image), so a full-suite or movement
// capture is reproducible from one seed.

const hideLoader = () => {
  const loader = document.getElementById('loader');
  if (loader) {
    loader.classList.add('loading--complete');
    loader.style.display = 'none';
  }
  const p5Loading = document.getElementById('p5_loading');
  if (p5Loading) p5Loading.style.display = 'none';
};

const routeOf = (movement) => SUITE.find((m) => m.number === movement)?.route;
const firstPartOf = (movement) => Object.keys(SUITE_PARTS).find((id) => SUITE_PARTS[id].movement === movement);
const movementOf = (partId) => SUITE_PARTS[partId]?.movement;

const sketch = (p) => {
  const params = new URLSearchParams(window.location.search);
  const movements = { 1: createSingularity(params), 2: createEventHorizon(), 3: createContinuum() };
  const fixedBpm = Number(params.get('bpm')) || null;
  const bpm = fixedBpm || SUITE_BPM;
  const beats = Math.max(1, Math.round(Number(params.get('beats')) || 16));
  const speed = Number(params.get('speed')) || 2;
  const freezeT = params.has('t') ? Number(params.get('t')) : null;
  const randomSeed = () => String(Math.floor(Math.random() * 100000));
  const baseSeed = params.get('seed') || randomSeed();
  let seed = baseSeed;
  let look = null;
  let lookMovement = null;
  const shaders = {};
  let info = null;
  let hasPlayed = false;
  let idle = 0; // seconds run free before the first play
  let booted = false;

  // Suite MIDI: each movement's role notes (absolute song time), then each
  // part's slice (time minus the part start) for the movement's envelopes.
  const movementNotes = { 1: null, 2: null, 3: null };
  const partNotes = {};
  const extractRoleNotes = (tracks, roles) => {
    const out = {};
    for (const [role, slot] of Object.entries(roles)) {
      out[role] = (tracks[slot]?.notes ?? []).map((n) => ({ time: n.time, duration: n.duration, midi: n.midi }));
    }
    return out;
  };
  const sliceNotes = (roles, start, end) => {
    const out = {};
    for (const [role, list] of Object.entries(roles ?? {})) {
      out[role] = list.filter((n) => n.time >= start && n.time < end).map((n) => ({ ...n, time: n.time - start }));
    }
    return out;
  };

  // Where we are: the page's movement, then the part the music is in.
  const trailingSlash = window.location.pathname.endsWith('/');
  const pageRoute = window.location.pathname.split('/').filter(Boolean).pop();
  const pageMovement = SUITE.find((m) => m.route === pageRoute)?.number ?? 1;

  // ?part= names a part of this page's movement (bare) or any part (full id).
  const partParam = params.get('part');
  const resolveAskedPart = () => {
    if (!partParam) return null;
    if (SUITE_PARTS[partParam]) return partParam;
    const scoped = `${pageMovement}${partParam}`;
    return SUITE_PARTS[scoped] ? scoped : null;
  };
  const askedPartId = resolveAskedPart();
  const startPartId = askedPartId ?? firstPartOf(pageMovement);
  const askedMovement = params.has('movement') ? Number(params.get('movement')) : NaN;
  const captureMovement = [1, 2, 3].includes(askedMovement) ? askedMovement : null;

  let movement = movementOf(startPartId) ?? pageMovement;
  let partId = startPartId;

  const enterMovement = (next) => {
    if (next === movement) return;
    const before = sketchMetadata[routeOf(movement)]?.title;
    const after = sketchMetadata[routeOf(next)]?.title;
    if (before && after) document.title = document.title.replace(before, after);
    movement = next;
  };

  const syncUrl = () => {
    if (p.captureInProgress) return;
    const q = new URLSearchParams(window.location.search);
    if (partId) q.set('part', SUITE_PARTS[partId].part);
    else q.delete('part');
    q.set('seed', seed);
    window.history.replaceState(null, '', `/${routeOf(movement)}${trailingSlash ? '/' : ''}?${q}`);
  };

  const emitTrack = (id) => {
    const title = id ? SUITE_PARTS[id].title : SUITE.map((m) => m.title).join(' → ');
    window.dispatchEvent(new CustomEvent('labcat:track', { detail: { title } }));
  };

  const setSeed = (next) => {
    seed = String(next);
    const mv = movements[movement];
    look = mv.createLook(seed, { bpm, beats, speed });
    // Framing and light come with every look, different per movement.
    const framing = createFraming(seed, Number(movement), mv.framing);
    Object.assign(look.uniforms, framing.uniforms);
    look.framing = `${framing.light}${framing.offAxis ? ' off-axis' : ''}`;
    lookMovement = movement;
    // Any scalar uniform can be overridden from the URL, e.g. ?uGlow=0.5
    for (const [key, value] of params) {
      if (typeof look.uniforms[key] === 'number' && value !== '') look.uniforms[key] = Number(value);
    }
    syncUrl();
    if (info) info.textContent = `seed ${seed} · ${mv.describe(look)} · ${look.framing} · ${bpm.toFixed(1)} bpm · ${look.loopSec.toFixed(2)}s`;
    console.log('[PortalsSuite]', movement, partId, look);
  };

  const setAuto = (on) => {
    autoOn = on;
    const q = new URLSearchParams(window.location.search);
    q.set('auto', on ? '1' : '0');
    window.history.replaceState(null, '', `/${routeOf(movement)}${trailingSlash ? '/' : ''}?${q}`);
    window.dispatchEvent(new CustomEvent('portals:auto', { detail: { on } }));
  };
  let autoOn = params.has('auto') ? params.get('auto') !== '0' : !params.has('seed');

  // A part change, from the part player (live). The look rolls to a new seed
  // on a same-movement part change (when auto is on) and always rebuilds for a
  // new movement's shader. The initial positioning (before booted) only moves
  // the part pointer.
  const onPart = (id) => {
    const mv = movementOf(id);
    if (!mv) return;
    if (booted && id === partId) return; // draw() already flowed into it
    partId = id;
    arrived = false; // picked (prev / next), not flowed into
    if (mv !== movement) enterMovement(mv);
    if (!booted) return;
    newPartLook();
    emitTrack(id);
  };
  // A new part: a new movement always rebuilds the look for its shader; within
  // a movement, auto look rolls a new seed.
  const newPartLook = () => {
    if (lookMovement !== movement) setSeed(seed);
    else if (autoOn) setSeed(randomSeed());
    else syncUrl();
  };

  // The part player either loops a part or plays on; Portals plays on, part
  // into part, wrapping to the first at the end of the song. So the part it
  // reports follows the playhead (set here, no seek), which keeps pause /
  // resume and prev / next working from where the music is.
  let clock = null;
  const PART_IDS = Object.keys(SUITE_PARTS);
  const followPart = (id) => {
    if (!clock) return;
    clock.part = id;
    const r = clock.resolve(id);
    clock.range = r ? { start: r.start, end: r.end } : null;
  };
  const onState = (playing) => {
    const last = PART_RANGES[PART_IDS[PART_IDS.length - 1]];
    if (playing || !clock || clock.position() < last.end - 0.05) return;
    clock.setPart(PART_IDS[0]);
    arrived = true; // the last part's ring flows into the first
    clock.play();
  };

  // Seconds of absolute song time: capture's frame counter, a frozen ?t, or
  // the part player's audible clock.
  const loopTime = () => {
    if (p.captureInProgress) return p.frameNumber / 60;
    if (freezeT !== null) return freezeT;
    if (p.song?.isPlaying()) hasPlayed = true;
    // Before the first play the flight runs free, looping the page's part,
    // so the page is alive on arrival.
    if (!hasPlayed) {
      idle += p.deltaTime / 1000;
      const r = PART_RANGES[startPartId];
      return r.start + (idle % (r.end - r.start));
    }
    const t = p.getSongPlaybackTime();
    return Number.isFinite(t) ? t : 0;
  };

  // Part-change timing for the movement's transition (ring / dip / burn),
  // only while a part plays: never before the first play. In capture it is a
  // pure function of time, so a movement/full-suite reel shows every boundary.
  // A part opens out of the white only when the music flowed into it from the
  // part before (as heard live, or crossed in a capture) — never on the first
  // frame of a capture, on play, or after a jump.
  let arrived = false;
  let lastT = null;
  const flight = (tm, len, partEnd) => {
    if (!len || freezeT !== null) return null;
    if (!p.captureInProgress && !hasPlayed) return null;
    // A capture ends on a cut, not on a ring into a part that isn't in it.
    const end = p.captureRange?.end ?? p.song?.duration?.();
    const lastInCapture = p.captureInProgress && Number.isFinite(end) && partEnd >= end - 0.05;
    return { toEnd: lastInCapture ? Infinity : len - tm, since: arrived ? tm : null };
  };

  // Absolute song time → the part we're in, time within it, and its notes.
  const suiteState = (t) => {
    const range = partAt(t);
    if (!range) return null;
    return {
      movement: range.movement,
      partId: range.id,
      part: range.part,
      tm: t - range.start,
      len: range.end - range.start,
      notes: partNotes[range.id],
    };
  };

  // Raymarching is heavy on laptop GPUs: without ?pd, step the render
  // resolution down (never up, so it can't oscillate) until the preview
  // holds ~50fps. The canvas is CSS-scaled back to full size.
  const adaptive = !params.has('pd');
  let slowMs = 0;
  let slowFrames = 0;
  const adaptResolution = () => {
    if (!adaptive || p.captureInProgress || freezeT !== null) return;
    slowMs += p.deltaTime;
    if (++slowFrames < 30) return;
    const avg = slowMs / slowFrames;
    slowMs = 0;
    slowFrames = 0;
    const density = p.pixelDensity();
    if (avg > 21 && density > 0.35) p.pixelDensity(Math.max(0.35, density * 0.8));
  };

  p.setup = async () => {
    if (params.get('fps') !== '0') p.enableFpsIndicator();
    window.toggleFps = () => p.toggleFpsIndicator();
    p.createCanvas(window.innerWidth, window.innerHeight, p.WEBGL);
    // After createCanvas: p5 resets density to the display's when creating it.
    p.pixelDensity(Number(params.get('pd')) || 1);
    p.canvas.style.position = 'fixed';
    p.canvas.style.top = '0';
    p.canvas.style.left = '0';
    p.noStroke();
    for (const [n, mv] of Object.entries(movements)) shaders[n] = p.createShader(vert, mv.frag);

    const capturePrefix = askedPartId
      ? `PortalsNo${movementOf(askedPartId)}-Part${SUITE_PARTS[askedPartId].part.toUpperCase()}`
      : captureMovement
        ? `PortalsNo${captureMovement}`
        : 'Portals';
    initCapture(p, { prefix: capturePrefix });
    // Frames are a pure function of song time, so a section cut can skip draws.
    p.captureSeekable = true;

    await p.loadSong(SONG.audio, SONG.midi, (midi) => {
      for (const [n, mv] of Object.entries(movements)) {
        if (mv.roles) movementNotes[n] = extractRoleNotes(midi.tracks, mv.roles);
      }
      for (const [id, part] of Object.entries(SUITE_PARTS)) {
        partNotes[id] = sliceNotes(movementNotes[part.movement], PART_RANGES[id].start, PART_RANGES[id].end);
      }
    });
    // The LabCat loader stays up until there's something to draw.
    hideLoader();

    clock = p.usePartPlayer({
      parts: SUITE_PARTS,
      bpm: SUITE_BPM,
      part: null,
      loop: false,
      onState,
      seed: () => seed,
      urlSync: false,
      trackEvents: false,
      onOverflow: (dir) => {
        const ids = clock.partIds;
        clock.setPart(dir < 0 ? ids[ids.length - 1] : ids[0]);
        return true;
      },
      onPart,
    });
    // Position at the page's part without narrowing a capture (the part player
    // would only treat a ?part= in the URL as a capture cut).
    clock.setPart(startPartId);

    // Capture window: ?part= → that part, ?movement= → that movement, else the
    // whole suite.
    if (askedPartId) {
      const r = resolvePart(SUITE_PARTS, askedPartId, { bpm: SUITE_BPM, duration: p.song.duration() });
      if (r) p.captureRange = { start: r.start, end: r.end };
    } else if (captureMovement) {
      const r = resolvePart(MOVEMENTS, String(captureMovement), { bpm: SUITE_BPM, duration: p.song.duration() });
      if (r) p.captureRange = { start: r.start, end: r.end };
    } else {
      p.captureRange = null;
    }

    // Like the other series: the cursor shows play/pause and clicking the
    // canvas toggles playback (the ControlPanel stops its own clicks).
    p.canvas.classList.add('p5Canvas--cursor-play');
    p.canvas.addEventListener('pointerdown', () => window.dispatchEvent(new CustomEvent('labcat:toggle-playback')));
    window.addEventListener('labcat:track-prev', () => clock.step(-1));
    window.addEventListener('labcat:track-next', () => clock.step(1));

    info = document.createElement('div');
    info.style.cssText =
      'position:fixed;left:12px;bottom:12px;z-index:10;font:12px monospace;color:#fff;opacity:.7;display:none;pointer-events:none';
    document.body.appendChild(info);
    setSeed(seed);
    emitTrack(partId);
    setAuto(autoOn);
    window.addEventListener('portals:auto-toggle', () => setAuto(!autoOn));
    window.addEventListener('portals:next-look', () => setSeed(randomSeed()));

    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey) return;
      const key = e.key.toLowerCase();
      const n = Number(seed);
      if (key === 'n' && Number.isInteger(n)) setSeed(n + 1);
      if (key === 'p' && Number.isInteger(n)) setSeed(Math.max(0, n - 1));
      if (key === 'r') setSeed(randomSeed());
      if (key === 'a') setAuto(!autoOn);
      if (key === 'i') info.style.display = info.style.display === 'none' ? '' : 'none';
      if (key === 'f') p.toggleFpsIndicator();
    });

    booted = true;
  };

  p.draw = () => {
    adaptResolution();
    const t = loopTime();
    const state = suiteState(t);
    if (!state) return;

    const changedMovement = state.movement !== movement;
    const changedPart = state.partId !== partId;
    // Flowed in: time ran on continuously across the boundary (no jump).
    if (changedPart) arrived = lastT !== null && t >= lastT && t - lastT < 0.5;
    lastT = t;
    if (changedMovement) enterMovement(state.movement);
    if (changedPart) partId = state.partId;
    if (p.captureInProgress) {
      // Deterministic: each part's look derives from the base seed, so one
      // ?seed= reproduces a whole-suite or movement capture.
      if (changedMovement || changedPart) setSeed(`${baseSeed}-${partId}`);
    } else if (changedPart && booted) {
      // Played on into the next part.
      followPart(partId);
      newPartLook();
      emitTrack(partId);
    } else if (lookMovement !== movement) {
      setSeed(seed);
    }

    const mv = movements[movement];
    const shader = shaders[movement];
    p.shader(shader);
    shader.setUniform('uRes', [p.width * p.pixelDensity(), p.height * p.pixelDensity()]);
    shader.setUniform('uTime', t);
    shader.setUniform('uLoop', look.loopSec);
    for (const [name, value] of Object.entries(look.uniforms)) shader.setUniform(name, value);
    const dip = mv.draw(shader, look, {
      t,
      tm: state.tm,
      bpm,
      len: state.len,
      notes: state.notes,
      track: { part: state.part },
      flight: flight(state.tm, state.len, PART_RANGES[state.partId].end),
    });
    shader.setUniform('uFade', dip);
    p.plane(p.width, p.height);
  };

  p.windowResized = () => p.resizeCanvas(window.innerWidth, window.innerHeight);
};

new p5(sketch, document.getElementById('sketch-canvas'));
