import * as THREE from 'three';

// Lattice — the tunnel walls ARE the spectrum: 64 longitudinal rails
// (one per bin) plus hoop rings, drawn as a single line segments mesh.
// Rails burn with their bin; hoops breathe slowly. Tron-grade portal,
// all vector.
const BINS = 64;
const RAIL_PTS = 24;
const HOOPS = 12;
const HOOP_PTS = 64;
const FAR_Z = 3.0;
const NEAR_Z = 0.42;
const SPAN = FAR_Z - NEAR_Z;
const TWO_PI = Math.PI * 2;

// rail segments + hoop segments, 2 verts each
const SEGMENTS = BINS * (RAIL_PTS - 1) + HOOPS * HOOP_PTS;

export const createLattice = () => {
  const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.4);

  const camera = new THREE.PerspectiveCamera(15, window.innerWidth / window.innerHeight, 0.01, 1000);
  camera.rotation.y = Math.PI;
  camera.position.z = 0.35;

  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(SEGMENTS * 2 * 3);
  const col = new Float32Array(SEGMENTS * 2 * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  const lines = new THREE.LineSegments(
    geo,
    // fog:false — thin lines can't survive exponential fog; distance
    // fade is painted into the vertex colors instead.
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
  );
  lines.frustumCulled = false;
  scene.add(lines);

  const tmpColor = new THREE.Color();
  const onMouseMove = (e) => {
    mouse.tx = e.clientX / window.innerWidth;
    mouse.ty = e.clientY / window.innerHeight;
  };
  window.addEventListener('mousemove', onMouseMove);

  let lastMs = -1;
  let scroll = 0;

  const setVert = (s, x, y, z, r, g, b) => {
    const o = s * 3;
    pos[o] = x;
    pos[o + 1] = y;
    pos[o + 2] = z;
    col[o] = r;
    col[o + 1] = g;
    col[o + 2] = b;
  };

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
    const speed = 0.35 + energy * 1.0 + kick * 1.5;
    const radius = 0.06 * (1 + energy * 0.15);

    if (!held) scroll += speed * dt;

    const eAt = (bin) => (live && levels ? levels[((bin % BINS) + BINS) % BINS] || 0 : 0);
    let s = 0;
    // Rails: one per bin, brightness follows the bin along its length.
    for (let i = 0; i < BINS; i++) {
      const a = (i / BINS) * TWO_PI;
      const e = Math.min(1, eAt(i) + (live ? kick * 0.08 : 0));
      tmpColor.setHSL((((i / BINS) * 300 + e * 60) % 360) / 360, 0.85, 0.1 + 0.5 * e);
      for (let j = 0; j < RAIL_PTS - 1; j++) {
        const z0 = NEAR_Z + (((j / (RAIL_PTS - 1)) * SPAN + scroll) % SPAN);
        let z1 = NEAR_Z + ((((j + 1) / (RAIL_PTS - 1)) * SPAN + scroll) % SPAN);
        // Wrapped segments collapse instead of streaking across the tunnel.
        if (z1 < z0) z1 = z0;
        const wobble0 = 1 + 0.04 * Math.sin(st * 0.7 + a * 3 + z0 * 4);
        const wobble1 = 1 + 0.04 * Math.sin(st * 0.7 + a * 3 + z1 * 4);
        setVert(s++, Math.cos(a) * radius * wobble0, Math.sin(a) * radius * wobble0, z0, tmpColor.r, tmpColor.g, tmpColor.b);
        setVert(s++, Math.cos(a) * radius * wobble1, Math.sin(a) * radius * wobble1, z1, tmpColor.r, tmpColor.g, tmpColor.b);
      }
    }
    // Hoops: slow hue cycle drifting down the tunnel.
    for (let k = 0; k < HOOPS; k++) {
      const z = NEAR_Z + (((k / HOOPS) * SPAN + scroll) % SPAN);
      const fade = Math.max(0, Math.min(1, (FAR_Z - z) / 1.2));
      tmpColor.setHSL((0.55 + 0.25 * Math.sin(st * 0.4 + k * 0.5)) % 1, 0.8, 0.3 * fade * (0.5 + energy));
      for (let j = 0; j < HOOP_PTS; j++) {
        const a0 = (j / HOOP_PTS) * TWO_PI;
        const a1 = ((j + 1) / HOOP_PTS) * TWO_PI;
        setVert(s++, Math.cos(a0) * radius, Math.sin(a0) * radius, z, tmpColor.r, tmpColor.g, tmpColor.b);
        setVert(s++, Math.cos(a1) * radius, Math.sin(a1) * radius, z, tmpColor.r, tmpColor.g, tmpColor.b);
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;

    camera.position.x = mouse.x * 0.044 - 0.025;
    camera.position.y = mouse.y * 0.044 - 0.025;
  };

  const resize = (w, h) => {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  return { scene, camera, update, resize };
};
