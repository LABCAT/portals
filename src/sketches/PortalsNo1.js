import p5 from 'p5';
import '../lib/p5.fps.js';
import vert from '../shaders/portalLoop.vert?raw';
import frag from '../shaders/portalLoop.frag?raw';
import { createPortalLook } from '../lib/portalLook.js';
import { createLoopAudio } from '../lib/loopAudio.js';
import { LOOP_TRACKS } from '../audioTracks.js';

// #PortalsNo1 — seeded nebula-tube flight, built as short seamless loops for
// trial reels. One GLSL fragment shader does all the drawing; p5 just hosts
// it and feeds uniforms.
//   ?seed=  look (palette + structure), reproducible
//   ?bpm=   motion tempo; default: detected from the playing track, else 120
//   ?speed= tube radii flown per beat (default 2)
//   ?beats= loop length in beats (default 16 = 8s @ 120)
//   ?auto=  1/0 auto-change look (default on unless ?seed is given)
//   ?autoLoops= loops (4 bars each) between auto look changes (default 2)
//   ?paletteBars= bars per colour scheme within a look (default 2, 0 = off)
//   ?t=     freeze at a time in seconds (stills)
//   ?uX=    override any scalar uniform, e.g. ?uGlow=0.5&uFog=0.2
//   ?fps=0  hide the FPS badge
// Keys: N / P next / previous seed, R random seed, A auto look, I seed info,
// F FPS badge. Audio play/pause (also a click on the canvas) and prev/next
// track live in the lab ControlPanel. While a track plays the clock follows
// the audio (first beat = loop start) and pausing freezes the flight; capture
// uses its frame counter, so frame N is always the same image.

const hideLoader = () => {
  const loader = document.getElementById('loader');
  if (loader) {
    loader.classList.add('loading--complete');
    loader.style.display = 'none';
  }
  const p5Loading = document.getElementById('p5_loading');
  if (p5Loading) p5Loading.style.display = 'none';
};

const sketch = (p) => {
  const params = new URLSearchParams(window.location.search);
  const fixedBpm = Number(params.get('bpm')) || null;
  let bpm = fixedBpm || 120;
  const beats = Math.max(1, Math.round(Number(params.get('beats')) || 16));
  const speed = Number(params.get('speed')) || 2;
  const freezeT = params.has('t') ? Number(params.get('t')) : null;
  const randomSeed = () => String(Math.floor(Math.random() * 100000));
  let seed = params.get('seed') || randomSeed();
  let look = null;
  let portalShader = null;
  let info = null;

  // Auto look: a new random seed on every autoLoops-th loop of the clock.
  // A loop is 4 bars, so the default 2 changes on bars 9, 17, 25… — the
  // 8-bar phrases of our tracks. Turning it off holds the look.
  let autoOn = params.has('auto') ? params.get('auto') !== '0' : !params.has('seed');
  const autoLoops = Math.max(1, Number(params.get('autoLoops')) || 2);
  let loopIndex = null;

  // Colour changes within a look: a new scheme every paletteBars bars,
  // stepping through the look's 4 palettes (its own first). Like the play
  // fade, each change dips to black and swaps at the bottom, on the bar line;
  // look changes share those bar lines, so they dip too. Driven by the loop
  // clock, so every look starts on its own palette and capture repeats.
  const paletteBars = params.has('paletteBars') ? Math.max(0, Number(params.get('paletteBars')) || 0) : 2;
  const PALETTE_KEYS = ['uDeep', 'uColA', 'uColB', 'uHot'];
  const paletteSec = () => (paletteBars * 4 * 60) / bpm;
  const applyPalette = (t) => {
    if (!paletteBars) return;
    const seg = Math.floor(t / paletteSec());
    const n = look.palettes.length;
    const pal = look.palettes[((seg % n) + n) % n];
    for (const key of PALETTE_KEYS) portalShader.setUniform(key, pal[key]);
  };

  // Brightness for a colour change: a quick, shallow dip (to DIP_FLOOR, not
  // black) DIP_OUT before each bar line and back over DIP_IN after it, eased;
  // 1 between changes.
  const DIP_OUT = 0.3;
  const DIP_IN = 0.6;
  const DIP_FLOOR = 0.12;
  const paletteDip = (t) => {
    if (!paletteBars) return 1;
    const into = t - Math.floor(t / paletteSec()) * paletteSec();
    const toNext = paletteSec() - into;
    const x = toNext < DIP_OUT ? toNext / DIP_OUT : into < DIP_IN ? into / DIP_IN : 1;
    return DIP_FLOOR + (1 - DIP_FLOOR) * x * x * (3 - 2 * x);
  };

  const setAuto = (on) => {
    autoOn = on;
    // Recorded in the URL so a reload (which also has ?seed) keeps the mode.
    params.set('auto', on ? '1' : '0');
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
    window.dispatchEvent(new CustomEvent('portals:auto', { detail: { on } }));
  };

  let clock = 0;
  const audio = createLoopAudio(LOOP_TRACKS, {
    // A track's detected tempo drives the flight unless ?bpm= pins it.
    onBeat: (beat) => {
      const next = fixedBpm || beat?.bpm || 120;
      if (next !== bpm) {
        bpm = next;
        setSeed(seed);
      }
    },
  });

  const setSeed = (next) => {
    seed = String(next);
    look = createPortalLook(seed, { bpm, beats, speed });
    // Any scalar uniform can be overridden from the URL, e.g. ?uGlow=0.5
    for (const [key, value] of params) {
      if (typeof look.uniforms[key] === 'number' && value !== '') look.uniforms[key] = Number(value);
    }
    params.set('seed', seed);
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
    const colours = paletteBars ? look.palettes.map((pal) => pal.name).join('→') : look.palette;
    if (info) info.textContent = `seed ${seed} · ${colours} · ${look.sides || 'round'} · ${bpm.toFixed(1)} bpm · ${look.loopSec.toFixed(2)}s`;
    console.log('[PortalsLoops]', look);
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
    portalShader = p.createShader(vert, frag);

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
  // Pressing play (or a new track) jumps the flight to the track's position.
  // Smooth it: the old view keeps flying while it fades out, then the clock
  // jumps (with auto look on, to a new look) and fades back in. Resuming
  // after a pause is continuous (within output latency, < 0.5s even over
  // Bluetooth), so it never triggers.
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
      if (!jump && Math.abs(next - clock) > 0.5) jump = { start: p.millis(), switched: false };
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
  const autoLook = (t) => {
    const index = Math.floor(t / look.loopSec);
    const stepped = loopIndex !== null && index === loopIndex + 1;
    if (stepped && index > 0 && index % autoLoops === 0 && autoOn && !p.captureInProgress && freezeT === null) {
      setSeed(randomSeed());
    }
    loopIndex = index;
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
    autoLook(t);
    p.shader(portalShader);
    portalShader.setUniform('uRes', [p.width * p.pixelDensity(), p.height * p.pixelDensity()]);
    portalShader.setUniform('uTime', t);
    portalShader.setUniform('uLoop', look.loopSec);
    portalShader.setUniform('uFade', Math.min(paletteDip(t), p.captureInProgress ? 1 : fadeLevel()));
    for (const [name, value] of Object.entries(look.uniforms)) portalShader.setUniform(name, value);
    applyPalette(t);
    p.plane(p.width, p.height);
  };

  p.windowResized = () => p.resizeCanvas(window.innerWidth, window.innerHeight);
};

new p5(sketch, document.getElementById('sketch-canvas'));
