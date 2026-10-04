import { createPortalFlight, PORTAL_DESIGNS } from '../lib/portalFlight.js';

// #PortalsNo1 — bespoke custom. Ambient portal flight for now; the fixed
// track + MIDI cues land here later (kick → warp punch, sections → palette
// shifts). The interactive upload version lives in PortalsInteractive.js
// and is NOT this file.

const hideLoader = () => {
  const loader = document.getElementById('loader');
  if (loader) {
    loader.classList.add('loading--complete');
    loader.style.display = 'none';
  }
  const p5Loading = document.getElementById('p5_loading');
  if (p5Loading) p5Loading.style.display = 'none';
};

const canvas = document.createElement('canvas');
canvas.style.position = 'fixed';
canvas.style.top = '0';
canvas.style.left = '0';
canvas.style.zIndex = '1';
document.body.appendChild(canvas);

hideLoader();

const flight = createPortalFlight(canvas);

window.addEventListener('resize', () => flight.resize());

// No fixed track yet: the custom breathes on its own with slow synthetic
// waves until its MIDI-driven engine lands here.
const synthBars = new Float32Array(64);
const loop = (nowMs) => {
  const t = nowMs / 1000;
  for (let i = 0; i < 64; i++) {
    const v =
      0.35 +
      0.3 * Math.sin(t * 0.9 + i * 0.35) +
      0.15 * Math.sin(t * 0.23 + i * 0.11);
    synthBars[i] = Math.max(0, Math.min(1, v));
  }
  flight.render(
    nowMs,
    {
      energy: 0.45 + 0.25 * Math.sin(t * 0.7),
      treble: 0.3 + 0.2 * Math.sin(t * 1.1 + 1),
      kick: Math.max(0, Math.sin((t * Math.PI) / 1.4)),
      playing: true,
    },
    synthBars,
    Math.floor(t / 8) % PORTAL_DESIGNS.length
  );
  window.requestAnimationFrame(loop);
};
window.requestAnimationFrame(loop);
