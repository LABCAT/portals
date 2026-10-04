import '../lib/audioListenerShim.js';
import p5 from 'p5';
import '@lib/p5.audioReact.js';
import '../lib/p5.fps.js';
import initCapture from '@labcat2020/p5.audioreactive-capture';
import { createPortalFlight, PORTAL_DESIGNS } from '../lib/portalFlight.js';
import { guess } from 'web-audio-beat-detector';

// Future customs: fixed `PortalsNo1.mp3 + .mid` in public/audio/ wired via
// loadSong() + scheduleCueSet(). Upload stays raw Web Audio — no MIDI needed.

// Upload playback uses raw Web Audio (AudioContext + AnalyserNode) — no
// p5.sound/Tone involved, so it works in every browser.
const N_BARS = 64;
const ANALYSER_FFT_SIZE = 2048;
const ANALYSER_SMOOTHING = 0.55;

const sketch = (p) => {
  p.actx = null;
  p.analyser = null;
  p.analyserData = null;
  p.cachedLevels = null;
  p.asrc = null;
  p.audioBuffer = null;
  p.playToken = 0;
  p.startedAt = 0;
  p.pauseOffset = 0;
  p.isPlaying = false;
  p.audioReady = false;
  p.audioFileName = '';
  p.beat = null;
  p.bassLo = 0;
  p.bassHi = 0;
  p.trebLo = 0;
  p.trebHi = 0;
  // Feature state: slow-decay AGC peaks keep every track filling 0..1,
  // envelopes smooth with fast attack + slow release, kick is an onset
  // pulse with a refractory cooldown.
  p.agcEnergy = 0;
  p.agcBass = 0;
  p.agcTreb = 0;
  p.sEnergy = 0;
  p.sTreb = 0;
  p.bassSlow = 0;
  p.kickEnv = 0;
  p.lastKickAt = 0;
  p.view = 'portal';
  p.portal = null;
  p.portalCanvas = null;

  p.setView = (view) => {
    if (view !== 'spectrum' && view !== 'portal') return;
    p.view = view;
    window.__portalsView = view;
    if (p.canvas) p.canvas.style.display = view === 'spectrum' ? '' : 'none';
    if (p.portalCanvas) p.portalCanvas.style.display = view === 'portal' ? '' : 'none';
    window.dispatchEvent(new CustomEvent('portals:view', { detail: { view } }));
  };

  p.setup = async () => {
    // Loader serves no purpose here — upload IS the ready state.
    // Dismiss first so nothing can leave it on screen.
    p.hideLoader();
    const params = new URLSearchParams(window.location.search);
    const wantsFps = !params.has('fps') || params.get('fps') !== '0';
    if (wantsFps) p.enableFpsIndicator();
    window.toggleFps = () => p.toggleFpsIndicator();
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey) return;
      const key = e.key.toLowerCase();
      if (key === 'f') p.toggleFpsIndicator();
      if (key === 'v') p.setView(p.view === 'portal' ? 'spectrum' : 'portal');
    });

    p.pixelDensity(1);
    p.createCanvas(window.innerWidth, window.innerHeight);
    p.colorMode(p.HSB, 360, 100, 100, 1);
    p.canvas.style.position = 'fixed';
    p.canvas.style.top = '0';
    p.canvas.style.left = '0';
    p.canvas.style.zIndex = '1';

    p.portalCanvas = document.createElement('canvas');
    p.portalCanvas.style.position = 'fixed';
    p.portalCanvas.style.top = '0';
    p.portalCanvas.style.left = '0';
    p.portalCanvas.style.zIndex = '1';
    p.portalCanvas.style.display = 'none';
    document.body.appendChild(p.portalCanvas);
    p.portal = createPortalFlight(p.portalCanvas);

    initCapture(p, { prefix: 'PortalsInteractive', enabled: false });

    p.emitPortalsState('idle');
    if (typeof p._bindLabcatControls === 'function') p._bindLabcatControls();

    window.__portalsLoadUserAudio = (file) => p.loadUserFile(file);
    window.__portalsSetView = (view) => p.setView(view);
    p.setView('portal');
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file) p.loadUserFile(file);
    });
  };

  p.ensureCtx = async () => {
    if (!p.actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      p.actx = new AC();
      p.analyser = p.actx.createAnalyser();
      p.analyser.fftSize = ANALYSER_FFT_SIZE;
      p.analyser.smoothingTimeConstant = ANALYSER_SMOOTHING;
      p.analyserData = new Uint8Array(p.analyser.frequencyBinCount);
      p.analyser.connect(p.actx.destination);
      const binHz = p.actx.sampleRate / ANALYSER_FFT_SIZE;
      const toIdx = (hz) => Math.max(0, Math.min(p.analyser.frequencyBinCount - 1, Math.round(hz / binHz)));
      p.bassLo = toIdx(20);
      p.bassHi = toIdx(250);
      p.trebLo = toIdx(4000);
      p.trebHi = toIdx(12000);
    }
    if (p.actx.state !== 'running') await p.actx.resume();
  };

  p.emitPortalsState = (state, message) => {
    window.dispatchEvent(
      new CustomEvent('portals:state', {
        detail: {
          status: state,
          fileName: p.audioFileName,
          message,
          bpm: p.beat ? Math.round(p.beat.bpm) : 0,
        },
      })
    );
    window.dispatchEvent(new CustomEvent('labcat:playback', { detail: { playing: state === 'playing' } }));
  };

  // Per-frame audio features for reactive views. Null until a track loads.
  // Raw bin means sit near zero on most tracks, so each band is AGC
  // normalised against a slow-decaying peak (any track fills 0..1),
  // smoothed fast-attack / slow-release, and kick is a bass-onset pulse
  // with a 250ms refractory cooldown.
  p.sampleFx = () => {
    if (!p.analyser || !p.analyserData) return null;
    if (p.isPlaying) p.analyser.getByteFrequencyData(p.analyserData);
    const d = p.analyserData;
    let sum = 0;
    for (let i = 0; i < d.length; i++) sum += d[i];
    const rawEnergy = sum / d.length / 255;
    let bsum = 0;
    for (let i = p.bassLo; i <= p.bassHi; i++) bsum += d[i] || 0;
    const rawBass = bsum / Math.max(1, p.bassHi - p.bassLo + 1) / 255;
    let tsum = 0;
    for (let i = p.trebLo; i <= p.trebHi; i++) tsum += d[i] || 0;
    const rawTreble = tsum / Math.max(1, p.trebHi - p.trebLo + 1) / 255;

    p.agcEnergy = Math.max(rawEnergy, p.agcEnergy * 0.995);
    p.agcBass = Math.max(rawBass, p.agcBass * 0.995);
    p.agcTreb = Math.max(rawTreble, p.agcTreb * 0.995);
    const norm = (v, peak) => Math.max(0, Math.min(1, v / Math.max(0.02, peak)));
    const energy = norm(rawEnergy, p.agcEnergy);
    const bass = norm(rawBass, p.agcBass);
    const treble = norm(rawTreble, p.agcTreb);

    const atk = 0.5;
    const rel = 0.08;
    p.sEnergy += (energy - p.sEnergy) * (energy > p.sEnergy ? atk : rel);
    p.sTreb += (treble - p.sTreb) * (treble > p.sTreb ? atk : rel);

    p.bassSlow += (bass - p.bassSlow) * 0.03;
    const now = performance.now();
    if (bass - p.bassSlow > 0.25 && now - p.lastKickAt > 250) {
      p.kickEnv = 1;
      p.lastKickAt = now;
    }
    p.kickEnv *= 0.9;

    // Beat-grid pulse: exact phase off the detected BPM, sharp attack on
    // the beat decaying through the bar. Used whenever detection produced
    // a grid — a wrong-but-steady grid still breathes musically, and the
    // live transient fills in (and takes over fully without a grid).
    let grid = 0;
    const beat = p.beat;
    const gridded = beat && beat.confidence >= 0.05;
    if (gridded && p.actx) {
      const trackTime = p.isPlaying ? p.actx.currentTime - p.startedAt : p.pauseOffset;
      const rel = trackTime - beat.firstBeat;
      if (rel >= 0) {
        const phase = (rel / beat.period) % 1;
        grid = Math.pow(1 - phase, 2.5);
      }
    }
    const kick = gridded ? Math.max(grid, p.kickEnv * 0.5) : p.kickEnv;

    return { energy: p.sEnergy, treble: p.sTreb, kick, playing: p.isPlaying };
  };

  // Per-bar levels (64) for the portal rings: grouped bin means, snappy
  // attack / medium release, normalised by a fast-decaying peak so quiet
  // and loud tracks both fill the range — peaks hit hot, mids stay
  // structured instead of everything pegging white at once.
  p.barLevels = null;
  p.agcBarPeak = 0;
  p.getBarLevels = () => {
    if (!p.analyser || !p.analyserData) return null;
    if (p.isPlaying) p.analyser.getByteFrequencyData(p.analyserData);
    const N = 64;
    const out = p.barLevels || (p.barLevels = new Float32Array(N));
    const per = Math.max(1, Math.floor(p.analyserData.length / N));
    let peak = 0;
    for (let i = 0; i < N; i++) {
      let sum = 0;
      for (let j = 0; j < per; j++) sum += p.analyserData[i * per + j] || 0;
      const mean = sum / per / 255;
      out[i] = mean;
      if (mean > peak) peak = mean;
    }
    p.agcBarPeak = Math.max(peak, p.agcBarPeak * 0.995);
    const div = Math.max(0.25, p.agcBarPeak);
    for (let i = 0; i < N; i++) {
      const target = Math.max(0, Math.min(1, (out[i] / div) * 1.3));
      // Instant attack like the spectrum view, medium release.
      out[i] += (target - out[i]) * (target > out[i] ? 1.0 : 0.3);
    }
    return out;
  };

  p.stopSource = () => {
    p.playToken++;
    if (p.asrc) {
      try {
        p.asrc.onended = null;
        p.asrc.stop();
      } catch {
        // already stopped — replacing anyway
      }
      try {
        p.asrc.disconnect();
      } catch {
        // ignore
      }
      p.asrc = null;
    }
    p.isPlaying = false;
  };

  p.startBuffer = (offsetSec = 0) => {
    p.stopSource();
    const token = ++p.playToken;
    const duration = p.audioBuffer.duration || 0;
    const offset = duration > 0 ? offsetSec % duration : 0;
    const src = p.actx.createBufferSource();
    src.buffer = p.audioBuffer;
    src.connect(p.analyser);
    src.onended = () => {
      if (token !== p.playToken) return;
      p.asrc = null;
      p.isPlaying = false;
      p.pauseOffset = 0;
      p.emitPortalsState('paused', `Finished — ${p.audioFileName}`);
    };
    p.asrc = src;
    src.start(0, offset);
    p.startedAt = p.actx.currentTime - offset;
    p.pauseOffset = offset;
    p.isPlaying = true;
    p.emitPortalsState('playing');
  };

  p.loadUserFile = async (file) => {
    if (!file) return;
    p.emitPortalsState('loading', `Loading ${file.name}…`);
    try {
      await p.ensureCtx();
      const raw = await file.arrayBuffer();
      p.audioBuffer = await p.actx.decodeAudioData(raw);
      // Real BPM via web-audio-beat-detector (float tempo — rounded bpm
      // would drift off-grid by track end). Falls back to null → the
      // live transient detector carries the visuals instead.
      try {
        const g = await guess(p.audioBuffer);
        p.beat =
          Number.isFinite(g.tempo) && g.tempo >= 60 && g.tempo <= 200 && Number.isFinite(g.offset)
            ? { bpm: g.tempo, period: 60 / g.tempo, firstBeat: Math.max(0, g.offset), confidence: 1 }
            : null;
      } catch {
        p.beat = null;
      }
      p.audioFileName = file.name;
      p.audioReady = true;
      p.pauseOffset = 0;
      p.startBuffer();
    } catch (err) {
      console.error('Failed to load user audio:', err);
      p.emitPortalsState('error', `Couldn't play ${file.name} — try another MP3`);
    }
  };

  p.hideLoader = () => {
    // Instant + complete: the lab's fade class alone leaves the overlay
    // covering the viewport for 3s and intercepting clicks.
    const loader = document.getElementById('loader');
    if (loader) {
      loader.classList.add('loading--complete');
      loader.style.display = 'none';
    }
    const p5Loading = document.getElementById('p5_loading');
    if (p5Loading) p5Loading.style.display = 'none';
  };

  p.togglePlayback = async () => {
    if (!p.audioReady || !p.audioBuffer) return;
    if (p.isPlaying) {
      const duration = p.audioBuffer.duration || 0;
      p.pauseOffset = duration > 0 ? (p.actx.currentTime - p.startedAt) % duration : 0;
      p.stopSource();
      p.emitPortalsState('paused');
    } else {
      await p.ensureCtx();
      p.startBuffer(p.pauseOffset);
    }
  };

  const drawIdle = (t) => {
    const bw = p.width / N_BARS;
    p.noStroke();
    for (let i = 0; i < N_BARS; i++) {
      const phase = t * 0.002 + (i / N_BARS) * p.TWO_PI * 2;
      const h = (Math.sin(phase) * 0.5 + 0.5) * p.height * 0.18 + 4;
      const hue = (i / N_BARS) * 360;
      p.fill(hue, 70, 60, 0.9);
      p.rect(i * bw + 1, p.height - h, bw - 2, h);
    }
  };

  const drawSpectrum = () => {
    if (!p.analyserData) return;
    // Live data while playing; frozen frame while paused.
    let levels = p.analyserData;
    if (p.isPlaying && p.analyser) {
      p.analyser.getByteFrequencyData(p.analyserData);
      p.cachedLevels = p.cachedLevels || new Uint8Array(p.analyserData.length);
      p.cachedLevels.set(p.analyserData);
    } else if (p.cachedLevels) {
      levels = p.cachedLevels;
    } else {
      return;
    }
    const bw = p.width / N_BARS;
    const binsPerBar = Math.max(1, Math.floor(levels.length / N_BARS));
    p.background(0, 0, 0, 1);
    p.noStroke();
    for (let i = 0; i < N_BARS; i++) {
      let sum = 0;
      for (let j = 0; j < binsPerBar; j++) sum += levels[i * binsPerBar + j] || 0;
      const energy = sum / binsPerBar / 255;
      const h = Math.max(2, energy * p.height * 0.92);
      const hue = (i / N_BARS) * 300 + energy * 60;
      p.fill(hue % 360, 85, 40 + energy * 60, 1);
      p.rect(i * bw + 1, p.height - h, bw - 2, h);
    }
  };

  p.draw = () => {
    if (p.view === 'portal') {
      if (p.portal) {
        // Design switches every 4 bars off the detected grid; without a
        // grid (or paused) it holds the current look.
        let design = 0;
        const beat = p.beat;
        if (beat && p.isPlaying && p.actx) {
          const rel = p.actx.currentTime - p.startedAt - beat.firstBeat;
          if (rel >= 0) design = Math.floor(rel / (beat.period * 16)) % PORTAL_DESIGNS.length;
        }
        p.portal.render(
          p.millis(),
          p.audioReady ? p.sampleFx() : null,
          p.audioReady ? p.getBarLevels() : null,
          design
        );
      }
      return;
    }
    p.background(0, 0, 0, 1);
    if (!p.audioReady) {
      drawIdle(p.millis());
      return;
    }
    drawSpectrum();
  };

  p.mouseClicked = () => {
    const el = document.elementFromPoint(p.mouseX, p.mouseY);
    if (el && typeof el.closest === 'function' && el.closest('[data-portals-upload],input,label,a,button')) return;
    p.togglePlayback();
  };

  p.windowResized = () => {
    p.resizeCanvas(window.innerWidth, window.innerHeight);
    if (p.portal) p.portal.resize();
  };
};

new p5(sketch);
