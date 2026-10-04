import * as THREE from 'three';

// Gates — minimal neon portals: thin glowing torus gates stream at you
// down a dark tunnel, each gate's radius and heat read the low-end.
// Nothing but destination, repeated. Hypnotic by restraint.
const GATES = 7;
const FAR_Z = 3.0;
const NEAR_Z = 0.5;
const SPAN = FAR_Z - NEAR_Z;

export const createGates = () => {
  const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.42);

  const camera = new THREE.PerspectiveCamera(15, window.innerWidth / window.innerHeight, 0.01, 1000);
  camera.rotation.y = Math.PI;
  camera.position.z = 0.35;

  // Unit torus scaled per gate: varied base radii so nested gates read
  // as structure instead of stacking into soup.
  const geoBase = new THREE.TorusGeometry(1, 0.03, 10, 72);
  const gates = [];
  for (let k = 0; k < GATES; k++) {
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const mesh = new THREE.Mesh(geoBase, mat);
    mesh.position.z = FAR_Z - (k / GATES) * SPAN;
    scene.add(mesh);
    gates.push({ mesh, mat, hue: (0.52 + k * 0.12) % 1, baseR: 0.022 + (k % 3) * 0.009 });
  }

  const onMouseMove = (e) => {
    mouse.tx = e.clientX / window.innerWidth;
    mouse.ty = e.clientY / window.innerHeight;
  };
  window.addEventListener('mousemove', onMouseMove);

  let lastMs = -1;

  const update = (nowMs, fx = null, levels = null) => {
    const live = fx && fx.playing;
    const held = !live;
    const t = nowMs / 1000;
    const st = held ? 0 : t;
    const dt = lastMs < 0 ? 0.016 : Math.max(0, Math.min(0.05, (nowMs - lastMs) / 1000));
    lastMs = nowMs;

    mouse.x += (mouse.tx - mouse.x) / 50;
    mouse.y += (mouse.ty - mouse.y) / 50;

    const energy = live ? fx.energy : 0;
    const kick = live ? Math.min(1, fx.kick * 1.2) : 0;
    const speed = 0.3 + energy * 0.9 + kick * 1.4;

    // Low-end readout shared by the gates: mean of the bottom bins.
    let low = 0;
    if (live && levels) {
      for (let i = 0; i < 10; i++) low += levels[i] || 0;
      low = Math.min(1, low / 10 + kick * 0.15);
    }

    if (!held) {
      for (const g of gates) {
        g.mesh.position.z -= speed * dt;
        if (g.mesh.position.z < NEAR_Z) g.mesh.position.z += SPAN;
        g.hue = (g.hue + dt * 0.008 * (1 + energy * 2)) % 1;
      }
    }

    for (const g of gates) {
      const depthFade = Math.max(0, Math.min(1, (FAR_Z - g.mesh.position.z) / 1.2));
      const nearFade = Math.max(0, Math.min(1, (g.mesh.position.z - NEAR_Z) / 0.6));
      const s = g.baseR * (1 + low * 0.9 + kick * 0.25);
      g.mesh.scale.set(s, s, 1);
      g.mat.color.setHSL(g.hue, 1.0, (0.25 + 0.3 * low) * depthFade * nearFade + 0.02);
      g.mat.opacity = Math.max(0, Math.min(1, (0.1 + 0.25 * low) * depthFade * nearFade + 0.02));
    }

    camera.position.x = mouse.x * 0.044 - 0.025 + Math.sin(st * 0.4) * 0.002;
    camera.position.y = mouse.y * 0.044 - 0.025 + Math.cos(st * 0.33) * 0.002;
  };

  const resize = (w, h) => {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  return { scene, camera, update, resize };
};
