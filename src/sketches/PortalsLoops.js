import p5 from 'p5';
import '../lib/p5.fps.js';
import vert from '../shaders/portalLoop.vert?raw';
import frag from '../shaders/portalLoop.frag?raw';
import { createPortalLook } from '../lib/portalLook.js';
import { createLoopAudio } from '../lib/loopAudio.js';
import { LOOP_TRACKS } from '../audioTracks.js';

// Portal Loops — seeded short loops for trial reels. One GLSL fragment
// shader does all the drawing; p5 just hosts it and feeds uniforms.
//   ?seed=  look (palette + structure), reproducible
//   ?bpm=   motion tempo; default: detected from the playing track, else 120
//   ?speed= tube radii flown per beat (default 2)
//   ?beats= loop length in beats (default 16 = 8s @ 120)
//   ?auto=  1/0 auto-change look (default on unless ?seed is given)
//   ?autoLoops= loops between auto look changes (default 4)
//   ?t=     freeze at a time in seconds (stills)
//   ?uX=    override any scalar uniform, e.g. ?uGlow=0.5&uFog=0.2
//   ?fps=0  hide the FPS badge
// Keys: N / P next / previous seed, R random seed, A auto look, I seed info,
// F FPS badge. Audio play/pause and prev/next track live in the lab
// ControlPanel. While a track plays the clock follows the audio (first beat
// = loop start); capture uses its frame counter, so frame N is always the
// same image.

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

  // Auto look: a new random seed every autoLoops loops, switched on a loop
  // boundary so it never cuts mid-flight. Turning it off holds the look.
  let autoOn = params.has('auto') ? params.get('auto') !== '0' : !params.has('seed');
  const autoLoops = Math.max(1, Number(params.get('autoLoops')) || 4);
  let loopIndex = null;
  let loopsOnLook = 0;
  const setAuto = (on) => {
    autoOn = on;
    loopsOnLook = 0;
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
    loopsOnLook = 0;
    if (info) info.textContent = `seed ${seed} · ${look.palette} · ${look.sides || 'round'} · ${bpm.toFixed(1)} bpm · ${look.loopSec.toFixed(2)}s`;
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

  // Seconds on the loop clock: capture frame counter, a frozen ?t, the
  // playing track (minus its first beat), or free-running time otherwise.
  const loopTime = () => {
    if (p.captureInProgress) return p.frameNumber / 60;
    if (freezeT !== null) return freezeT;
    const pos = audio.position();
    clock = pos !== null ? pos - audio.beatOffset() : clock + p.deltaTime / 1000;
    return clock;
  };

  const autoLook = (t) => {
    const index = Math.floor(t / look.loopSec);
    if (loopIndex !== null && index !== loopIndex && autoOn && !p.captureInProgress && freezeT === null) {
      if (++loopsOnLook >= autoLoops) setSeed(randomSeed());
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
    for (const [name, value] of Object.entries(look.uniforms)) portalShader.setUniform(name, value);
    p.plane(p.width, p.height);
  };

  p.windowResized = () => p.resizeCanvas(window.innerWidth, window.innerHeight);
};

new p5(sketch, document.getElementById('sketch-canvas'));
