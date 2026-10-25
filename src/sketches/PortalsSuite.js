import p5 from 'p5';
import initCapture from '@labcat2020/p5.audioreactive-capture';
import '../lib/p5.fps.js';
import vert from '../shaders/portalLoop.vert?raw';
import { createLoopAudio } from '../lib/loopAudio.js';
import { SUITE, SUITE_PARTS } from '../audioTracks.js';
import { sketchMetadata } from '../sketchMetadata.js';
import { createSingularity } from '../movements/singularity.js';
import { createEventHorizon } from '../movements/eventHorizon.js';
import { createContinuum } from '../movements/continuum.js';

// Intergalactic Portals — one player for the whole suite, behind every
// movement's page (/number-1 Singularity, /number-2 Event Horizon,
// /number-3 Continuum). Each
// movement is a shader + seeded look (src/movements/); this host owns the
// clock, the audio and the controls. All parts of all movements are one
// track list, so a part flows gaplessly into the next even across
// movements: the visuals switch on the bar line under the part-change
// transition, and the address bar follows (/number-2?part=a) without a
// reload. Prev/next walk the whole suite. Capture renders one part, once.
//   ?part=  a / b / c, the part (of this page's movement) to start on and capture
//   ?seed=  look, reproducible
//   ?bpm=   motion tempo; default: the track's, else 120
//   ?speed= tube radii flown per beat (default 2)
//   ?beats= loop length in beats (default 16)
//   ?auto=  1/0 new look on every part (default on unless ?seed is given)
//   ?autoLoops= loops between auto looks on looping tracks (default 2)
//   ?t=     freeze at a time in seconds (stills)
//   ?uX=    override any scalar uniform, e.g. ?uGlow=0.5
//   ?fps=0  hide the FPS badge
// Keys: N / P next / previous seed, R random seed, A auto look, I seed info,
// F FPS badge. Clicking the canvas plays/pauses. While a part plays the
// clock follows the audio (first beat = loop start) and pausing freezes the
// flight; capture uses its frame counter, so frame N is always the same image.

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

const sketch = (p) => {
  const params = new URLSearchParams(window.location.search);
  const movements = { 1: createSingularity(params), 2: createEventHorizon(params), 3: createContinuum(params) };
  const tracks = SUITE_PARTS.filter((t) => movements[t.movement]);
  const fixedBpm = Number(params.get('bpm')) || null;
  let bpm = fixedBpm || 120;
  const beats = Math.max(1, Math.round(Number(params.get('beats')) || 16));
  const speed = Number(params.get('speed')) || 2;
  const freezeT = params.has('t') ? Number(params.get('t')) : null;
  const randomSeed = () => String(Math.floor(Math.random() * 100000));
  let seed = params.get('seed') || randomSeed();
  let look = null;
  let lookMovement = null;
  const shaders = {};
  let info = null;

  // Where we are: the page's movement until a part of another one plays.
  const trailingSlash = window.location.pathname.endsWith('/');
  const pageRoute = window.location.pathname.split('/').filter(Boolean).pop();
  const pageMovement = SUITE.find((m) => m.route === pageRoute && movements[m.number])?.number ?? 1;
  // Start on ?part of this page's movement, else on its first part.
  const asked = tracks.findIndex((t) => t.movement === pageMovement && t.part === params.get('part'));
  const start = asked >= 0 ? asked : Math.max(0, tracks.findIndex((t) => t.movement === pageMovement));
  let movement = tracks[start]?.movement ?? pageMovement;

  const syncUrl = () => {
    window.history.replaceState(null, '', `/${routeOf(movement)}${trailingSlash ? '/' : ''}?${params}`);
  };
  // Crossing into another movement: its page's address and title, no reload.
  const enterMovement = (next) => {
    if (next === movement) return;
    const before = sketchMetadata[routeOf(movement)]?.title;
    const after = sketchMetadata[routeOf(next)]?.title;
    if (before && after) document.title = document.title.replace(before, after);
    movement = next;
  };

  // Auto look: a new seed on every part, and on looping tracks (uploads)
  // every autoLoops-th loop of the clock (4 bars each: bars 9, 17, 25…).
  let autoOn = params.has('auto') ? params.get('auto') !== '0' : !params.has('seed');
  const autoLoops = Math.max(1, Number(params.get('autoLoops')) || 2);
  let loopIndex = null;

  const setAuto = (on) => {
    autoOn = on;
    // Recorded in the URL so a reload (which also has ?seed) keeps the mode.
    params.set('auto', on ? '1' : '0');
    syncUrl();
    window.dispatchEvent(new CustomEvent('portals:auto', { detail: { on } }));
  };

  let clock = 0;
  let arrived = false; // flowed into the current part (its first beat clears the transition)
  const audio = createLoopAudio(tracks, {
    start,
    // A track's tempo drives the flight unless ?bpm= pins it.
    onBeat: (beat) => {
      const next = fixedBpm || beat?.bpm || 120;
      if (next !== bpm) {
        bpm = next;
        if (look) setSeed(seed);
      }
    },
    // The URL follows the part (and its movement), so a reload or a capture
    // starts there.
    onTrack: (track) => {
      arrived = false;
      if (track.movement) enterMovement(track.movement);
      if (track.part) params.set('part', track.part);
      else params.delete('part');
      syncUrl();
      if (track.prefix) p.captureFilePrefix = track.prefix;
    },
    // Flowed into the next part: the clock restarts on its first beat with
    // no fade (the transition covers the hand-off), in a new look if auto
    // is on (a movement change rebuilds the look for its shader either way).
    onAdvance: () => {
      arrived = true;
      clock = 0;
      if (autoOn) setSeed(randomSeed());
    },
  });
  // Every part's notes (Event Horizon's and Continuum's) load up front.
  tracks.forEach((t) => movements[t.movement].prepare?.(t));

  const setSeed = (next) => {
    seed = String(next);
    const mv = movements[movement];
    look = mv.createLook(seed, { bpm, beats, speed });
    lookMovement = movement;
    // Any scalar uniform can be overridden from the URL, e.g. ?uGlow=0.5
    for (const [key, value] of params) {
      if (typeof look.uniforms[key] === 'number' && value !== '') look.uniforms[key] = Number(value);
    }
    params.set('seed', seed);
    syncUrl();
    if (info) info.textContent = `seed ${seed} · ${mv.describe(look)} · ${bpm.toFixed(1)} bpm · ${look.loopSec.toFixed(2)}s`;
    console.log('[PortalsSuite]', movement, look);
  };

  p.setup = () => {
    hideLoader();
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

    // Headless capture (labcat-capture) renders one part, once: it reads the
    // length from p.song and draws frame by frame, and the clock follows its
    // frame counter. The decoded part stands in for a p5.SoundFile; capture
    // starts once p.song exists, so that waits for the part's notes too.
    const first = audio.current();
    initCapture(p, { prefix: first?.prefix || 'Portals' });
    Promise.all([audio.prepareCurrent(), movements[first.movement]?.prepare?.(first)]).then(([track]) => {
      if (!track) return;
      p.song = { buffer: track.buffer, duration: () => audio.length() ?? track.buffer.duration, isPlaying: () => false, _cues: [], _lastPos: 0 };
      p.audioSampleRate = track.buffer.sampleRate;
      p.audioLoaded = true;
    });

    // Like the other series: the cursor shows play/pause and clicking the
    // canvas toggles playback (the ControlPanel stops its own clicks).
    p.canvas.classList.add('p5Canvas--cursor-play');
    p.canvas.addEventListener('pointerdown', () => window.dispatchEvent(new CustomEvent('labcat:toggle-playback')));
    window.addEventListener('labcat:playback', (e) => {
      const playing = Boolean(e.detail?.playing);
      p.canvas.classList.toggle('p5Canvas--cursor-pause', playing);
      p.canvas.classList.toggle('p5Canvas--cursor-play', !playing);
    });

    info = document.createElement('div');
    info.style.cssText =
      'position:fixed;left:12px;bottom:12px;z-index:10;font:12px monospace;color:#fff;opacity:.7;display:none;pointer-events:none';
    document.body.appendChild(info);
    setSeed(seed);
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
  };

  // Seconds on the loop clock: capture frame counter, a frozen ?t, or the
  // playing track (minus its first beat). Before the first play it runs
  // free so the page is alive; after that, pausing the audio pauses it.
  // Pressing play (or picking a track) jumps the flight to the track's
  // position. Smooth it: the old view keeps flying while it fades out, then
  // the clock jumps (with auto look on, to a new look) and fades back in.
  // Resuming after a pause is continuous (within output latency, < 0.5s
  // even over Bluetooth), so it never triggers.
  const FADE_OUT_MS = 250;
  const FADE_IN_MS = 450;
  let jump = null; // { start, switched }
  let hasPlayed = false;
  const loopTime = () => {
    if (p.captureInProgress) return p.frameNumber / 60;
    if (freezeT !== null) return freezeT;
    const pos = audio.position();
    if (pos !== null) {
      hasPlayed = true;
      const next = pos - audio.beatOffset();
      if (!jump && Math.abs(next - clock) > 0.5) {
        jump = { start: p.millis(), switched: false };
        arrived = false;
      }
      if (jump && !jump.switched && p.millis() - jump.start < FADE_OUT_MS) {
        clock += p.deltaTime / 1000;
        return clock;
      }
      if (jump && !jump.switched) {
        jump.switched = true;
        if (autoOn) setSeed(randomSeed());
      }
      clock = next;
    } else if (!hasPlayed) {
      clock += p.deltaTime / 1000;
    }
    return clock;
  };

  // 0..1 brightness for the play-jump dip (eased), 1 the rest of the time.
  const fadeLevel = () => {
    if (!jump) return 1;
    const elapsed = p.millis() - jump.start;
    const x = elapsed < FADE_OUT_MS ? 1 - elapsed / FADE_OUT_MS : (elapsed - FADE_OUT_MS) / FADE_IN_MS;
    if (elapsed >= FADE_OUT_MS + FADE_IN_MS) {
      jump = null;
      return 1;
    }
    return x * x * (3 - 2 * x);
  };

  // Only a natural step into the next loop counts: clock jumps (pressing
  // play, a track change, a tempo change, the track wrapping) never trigger.
  // A playing part gets its new look from the part change instead.
  const autoLook = (t) => {
    const index = Math.floor(t / look.loopSec);
    const stepped = loopIndex !== null && index === loopIndex + 1;
    const inPart = hasPlayed && audio.length() !== null;
    if (stepped && index > 0 && index % autoLoops === 0 && autoOn && !inPart && !p.captureInProgress && freezeT === null) {
      setSeed(randomSeed());
    }
    loopIndex = index;
  };

  // Part-change timing for the movement's transition, only while a part
  // plays on its own: never in capture (a reel stays inside its part) or
  // before the first play. Paused, it holds like everything else.
  const flight = (t, len) => {
    if (!len || !hasPlayed || p.captureInProgress || freezeT !== null) return null;
    return { toEnd: len - t, since: arrived ? t : null };
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

  p.draw = () => {
    adaptResolution();
    const t = loopTime();
    if (lookMovement !== movement) setSeed(seed);
    autoLook(t);
    const mv = movements[movement];
    const shader = shaders[movement];
    const len = audio.length();
    p.shader(shader);
    shader.setUniform('uRes', [p.width * p.pixelDensity(), p.height * p.pixelDensity()]);
    shader.setUniform('uTime', t);
    shader.setUniform('uLoop', look.loopSec);
    for (const [name, value] of Object.entries(look.uniforms)) shader.setUniform(name, value);
    // Part time: before the first play the free-running clock wraps on the
    // part, so MIDI-lit movements already play their notes.
    const tm = len ? ((t % len) + len) % len : t;
    const dip = mv.draw(shader, look, { t, tm, bpm, len, track: audio.current(), flight: flight(t, len) });
    shader.setUniform('uFade', Math.min(dip, p.captureInProgress ? 1 : fadeLevel()));
    p.plane(p.width, p.height);
  };

  p.windowResized = () => p.resizeCanvas(window.innerWidth, window.innerHeight);
};

new p5(sketch, document.getElementById('sketch-canvas'));
