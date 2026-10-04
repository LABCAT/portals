import * as THREE from 'three';
import { createHelix } from './helix.js';
import { createLattice } from './lattice.js';
import { createGates } from './gates.js';

// Portals switcher — one shared renderer, four structural designs on the
// same concept (tunnels you fly through, driven by the spectrum):
//   Prism — rainbow bar tunnel + warp streaks (the reference look)
//   Helix — barber-pole spiral ribbons winding down the tunnel
//   Lattice — wireframe tunnel walls, rails lit by their bin
//   Gates — minimal neon torus gates streaming at you
// The sketch switches design every 4 bars off the beat grid.
export const PORTAL_DESIGNS = [{ name: 'Prism' }, { name: 'Helix' }, { name: 'Lattice' }, { name: 'Gates' }];

const BARS = 64;
const RINGS = 14;
const STREAKS = 260;
const FAR_Z = 3.0;
const NEAR_Z = 0.42;
const SPAN = FAR_Z - NEAR_Z;
const BASE_RADIUS = 0.055;
const BASE_SPEED = 0.4;

const makeGlowTexture = () => {
  const size = 128;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(170,225,255,0.5)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

const createPrism = () => {
  const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.4);

  const camera = new THREE.PerspectiveCamera(15, window.innerWidth / window.innerHeight, 0.01, 1000);
  camera.rotation.y = Math.PI;
  camera.position.z = 0.35;

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: makeGlowTexture(), fog: false, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  glow.position.z = FAR_Z - 0.05;
  glow.scale.set(0.22, 0.22, 1);
  scene.add(glow);

  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();
  const hideInstance = (mesh, idx) => {
    dummy.position.set(0, 0, -10);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(0.0001, 0.0001, 0.0001);
    dummy.updateMatrix();
    mesh.setMatrixAt(idx, dummy.matrix);
    mesh.setColorAt(idx, tmpColor.setRGB(0, 0, 0));
  };

  const RING_COUNT = RINGS * BARS;
  const ringsMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }),
    RING_COUNT
  );
  ringsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ringsMesh.frustumCulled = false;
  scene.add(ringsMesh);
  for (let i = 0; i < RING_COUNT; i++) hideInstance(ringsMesh, i);
  ringsMesh.instanceMatrix.needsUpdate = true;
  if (ringsMesh.instanceColor) ringsMesh.instanceColor.needsUpdate = true;

  const hist = [];
  for (let k = 0; k < RINGS; k++) hist.push(new Float32Array(BARS));

  const slots = [];
  for (let k = 0; k < RINGS; k++) {
    slots.push({ idx: k, z: FAR_Z - (k / RINGS) * SPAN });
  }

  const streaksMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }),
    STREAKS
  );
  streaksMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  streaksMesh.frustumCulled = false;
  scene.add(streaksMesh);
  const streaks = [];
  const rollStreak = (s, randomZ) => {
    s.a = Math.random() * Math.PI * 2;
    s.r = 0.008 + Math.random() * 0.122;
    s.z = randomZ ? NEAR_Z + Math.random() * SPAN : FAR_Z;
    s.jitter = 0.7 + Math.random() * 0.6;
    s.pink = Math.random() < 0.08;
  };
  for (let i = 0; i < STREAKS; i++) {
    const s = {};
    rollStreak(s, true);
    streaks.push(s);
    hideInstance(streaksMesh, i);
  }
  streaksMesh.instanceMatrix.needsUpdate = true;
  if (streaksMesh.instanceColor) streaksMesh.instanceColor.needsUpdate = true;

  const onMouseMove = (e) => {
    mouse.tx = e.clientX / window.innerWidth;
    mouse.ty = e.clientY / window.innerHeight;
  };
  window.addEventListener('mousemove', onMouseMove);

  let lastMs = -1;
  let rot = 0;
  const TWO_PI = Math.PI * 2;

  const update = (nowMs, fx = null, levels = null) => {
    const live = fx && fx.playing;
    const held = !live;
    const st = held ? 0 : nowMs / 1000;
    const dt = lastMs < 0 ? 0.016 : Math.max(0, Math.min(0.05, (nowMs - lastMs) / 1000));
    lastMs = nowMs;

    mouse.x += (mouse.tx - mouse.x) / 50;
    mouse.y += (mouse.ty - mouse.y) / 50;
    const rx = mouse.x;
    const ry = mouse.y;

    const energy = live ? fx.energy : 0;
    const kick = live ? Math.min(1, fx.kick * 1.2) : 0;
    const pulse = held ? 0.5 : Math.max(0.5 + 0.5 * Math.sin((st * Math.PI * 2) / 9), kick);
    const speed = BASE_SPEED + energy * 1.4 + kick * 2.0;
    const radius = BASE_RADIUS * (1 + energy * 0.22 + kick * 0.12);
    const flash = live ? kick * 0.08 : 0;

    if (!held) {
      rot += dt * ((Math.PI * 2) / 24) * (0.7 + 0.6 * energy);
      for (const slot of slots) {
        slot.z -= speed * dt;
        if (slot.z < NEAR_Z) slot.z += SPAN;
      }
      if (levels) {
        hist.unshift(hist.pop());
        hist[0].set(levels);
      }
      for (const s of streaks) {
        s.z -= speed * s.jitter * dt;
        if (s.z < NEAR_Z) {
          s.z += SPAN;
          rollStreak(s, false);
          s.z = FAR_Z - Math.random() * 0.3;
        }
      }
    }

    glow.material.opacity = 0.2 + 0.18 * pulse;
    const glowScale = 0.22 * (1 + 0.15 * pulse);
    glow.scale.set(glowScale, glowScale, 1);

    const order = [...slots].sort((a, b) => a.z - b.z);
    const barW = ((2 * Math.PI * radius) / BARS) * 0.62;
    for (let r = 0; r < RINGS; r++) {
      const slot = order[r];
      const h = hist[r];
      const fade = Math.max(0, Math.min(1, (FAR_Z - slot.z) / 1.0));
      for (let i = 0; i < BARS; i++) {
        const e = Math.min(1, (h[i] || 0) + flash);
        const eg = Math.pow(e, 1.35);
        const a = (i / BARS) * TWO_PI + rot;
        const len = 0.005 + eg * 0.12;
        const idx = slot.idx * BARS + i;
        if (fade <= 0) {
          hideInstance(ringsMesh, idx);
          continue;
        }
        dummy.position.set(Math.cos(a) * (radius + len / 2), Math.sin(a) * (radius + len / 2), slot.z);
        dummy.rotation.set(0, 0, a - Math.PI / 2);
        dummy.scale.set(barW, len, 0.02);
        dummy.updateMatrix();
        ringsMesh.setMatrixAt(idx, dummy.matrix);
        tmpColor.setHSL((((i / BARS) * 300 + eg * 60) % 360) / 360, 0.85, (0.1 + 0.42 * eg) * fade);
        ringsMesh.setColorAt(idx, tmpColor);
      }
    }
    ringsMesh.instanceMatrix.needsUpdate = true;
    if (ringsMesh.instanceColor) ringsMesh.instanceColor.needsUpdate = true;

    for (let i = 0; i < STREAKS; i++) {
      const s = streaks[i];
      const bin = Math.floor((((s.a % TWO_PI) + TWO_PI) % TWO_PI) / TWO_PI * BARS) % BARS;
      const e = Math.min(1, (held ? 0 : levels ? levels[bin] || 0 : 0) + flash);
      const eg = Math.pow(e, 1.35);
      const fade = Math.max(0, Math.min(1, (FAR_Z - s.z) / 1.0));
      const len = 0.008 + eg * 0.13 + s.r * 0.35;
      if (fade <= 0) {
        hideInstance(streaksMesh, i);
        continue;
      }
      const sa = s.a + rot;
      dummy.position.set(Math.cos(sa) * (s.r + len / 2), Math.sin(sa) * (s.r + len / 2), s.z);
      dummy.rotation.set(0, 0, sa - Math.PI / 2);
      dummy.scale.set(0.0012, len, 0.004);
      dummy.updateMatrix();
      streaksMesh.setMatrixAt(i, dummy.matrix);
      if (s.pink) tmpColor.setHSL(0.87, 0.9, (0.1 + 0.34 * eg) * fade);
      else tmpColor.setHSL(0.6, 0.85, (0.06 + 0.38 * eg) * fade);
      streaksMesh.setColorAt(i, tmpColor);
    }
    streaksMesh.instanceMatrix.needsUpdate = true;
    if (streaksMesh.instanceColor) streaksMesh.instanceColor.needsUpdate = true;

    camera.position.x = rx * 0.044 - 0.025 + Math.sin(st * 0.4) * 0.002;
    camera.position.y = ry * 0.044 - 0.025 + Math.cos(st * 0.33) * 0.002;
  };

  const resize = (w, h) => {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  return { scene, camera, update, resize };
};

const makers = [createPrism, createHelix, createLattice, createGates];

export const createPortalFlight = (canvas) => {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const designs = makers.map((make) => make());

  const render = (nowMs, fx = null, levels = null, designIdx = 0) => {
    const active = designs[designIdx % designs.length] || designs[0];
    active.update(nowMs, fx, levels);
    renderer.render(active.scene, active.camera);
  };

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    designs.forEach((d) => d.resize(w, h));
  };

  return { render, resize };
};
