import * as THREE from 'three';

// Helix — barber-pole portal: continuous spiral ribbons wind down the
// tunnel, brightness read live from the bin at each segment's angle.
// Same spectrum tunnel concept, one unbroken motion instead of rings.
const STRANDS = 4;
const PER_STRAND = 90;
const COUNT = STRANDS * PER_STRAND;
const FAR_Z = 3.0;
const NEAR_Z = 0.42;
const SPAN = FAR_Z - NEAR_Z;
const TURNS = 3;
const TWO_PI = Math.PI * 2;

export const createHelix = () => {
  const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.42);

  const camera = new THREE.PerspectiveCamera(15, window.innerWidth / window.innerHeight, 0.01, 1000);
  camera.rotation.y = Math.PI;
  camera.position.z = 0.35;

  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }),
    COUNT
  );
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    dummy.position.set(0, 0, -10);
    dummy.scale.set(0.0001, 0.0001, 0.0001);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, tmpColor.setRGB(0, 0, 0));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  // Strand segment slots: fixed depth slots, pattern rotates through them.
  const slots = [];
  for (let s = 0; s < STRANDS; s++) {
    for (let j = 0; j < PER_STRAND; j++) {
      slots.push({ strand: s, z: FAR_Z - (j / PER_STRAND) * SPAN });
    }
  }

  const onMouseMove = (e) => {
    mouse.tx = e.clientX / window.innerWidth;
    mouse.ty = e.clientY / window.innerHeight;
  };
  window.addEventListener('mousemove', onMouseMove);

  let lastMs = -1;
  let scroll = 0;
  let twist = 0;

  const update = (nowMs, fx = null, levels = null) => {
    const live = fx && fx.playing;
    const held = !live;
    const dt = lastMs < 0 ? 0.016 : Math.max(0, Math.min(0.05, (nowMs - lastMs) / 1000));
    lastMs = nowMs;

    mouse.x += (mouse.tx - mouse.x) / 50;
    mouse.y += (mouse.ty - mouse.y) / 50;

    const energy = live ? fx.energy : 0;
    const kick = live ? Math.min(1, fx.kick * 1.2) : 0;
    const speed = 0.4 + energy * 1.2 + kick * 1.6;
    const radius = 0.055 * (1 + energy * 0.15);

    if (!held) {
      scroll += speed * dt;
      twist += dt * 0.25;
    }

    for (let i = 0; i < COUNT; i++) {
      const slot = slots[i];
      const z = FAR_Z - (((FAR_Z - slot.z + scroll) % SPAN + SPAN) % SPAN);
      const a = (slot.strand / STRANDS) * TWO_PI + (FAR_Z - z) * ((TURNS * TWO_PI) / SPAN) + twist;
      const bin = Math.floor((((a % TWO_PI) + TWO_PI) % TWO_PI) / TWO_PI * 64) % 64;
      const e = live && levels ? levels[bin] || 0 : 0;
      const fade = Math.max(0, Math.min(1, (FAR_Z - z) / 1.0));
      if (fade <= 0) {
        dummy.position.set(0, 0, -10);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(0.0001, 0.0001, 0.0001);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, tmpColor.setRGB(0, 0, 0));
        continue;
      }
      const len = 0.006 + e * 0.05;
      dummy.position.set(Math.cos(a) * radius, Math.sin(a) * radius, z);
      dummy.rotation.set(0, 0, a - Math.PI / 2);
      dummy.scale.set(0.0022, len, 0.0022);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      tmpColor.setHSL((((bin / 64) * 300 + e * 60) % 360) / 360, 0.85, (0.1 + 0.45 * e) * fade);
      mesh.setColorAt(i, tmpColor);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    camera.position.x = mouse.x * 0.044 - 0.025;
    camera.position.y = mouse.y * 0.044 - 0.025;
  };

  const resize = (w, h) => {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  return { scene, camera, update, resize };
};
