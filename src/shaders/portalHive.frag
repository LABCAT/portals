// #PortalsNo2 Event Horizon — neon honeycomb tunnel.
//
// The camera flies down a hexagonal tube at a constant, BPM-locked speed
// (as in #PortalsNo1), walls lined with circuit line work and laser beams
// along the corners, through honeycomb gates of seven neon hex frames spaced
// along it; the next gates show through the centre cell, melting into the
// light at the far end. MIDI drives the light: each lead note lights one
// cell, long notes bloom every cell, and each part's own instruments add a
// layer (bass, stabs, arps).
//
// No raymarching: a ray meets the tube once (solved analytically) and each
// gate is a plane. Seamless loops: the camera flies uPeriod units per loop,
// a whole number of gates, and the wall pattern repeats every uPeriod.
precision highp float;

#define TAU 6.28318530718
#define GATES 6

uniform vec2 uRes;        // canvas size, px
uniform float uTime;      // seconds (capture: frame / 60)
uniform float uLoop;      // loop length, seconds (whole beats)
uniform float uFade;      // 0..1 overall brightness (play fade, note dips)

uniform float uPeriod;    // units flown per loop (tube apothem = 1)
uniform float uGates;     // honeycomb gates per loop (integer)
uniform float uFocal;     // lens
uniform float uDepth;     // how fast the far tunnel melts into the light
uniform float uSpin;      // sixth turns per loop (integer)
uniform float uCellsAround; // circuit cells per tunnel side (integer)
uniform float uCellsDeep; // circuit cells per period along the tunnel (integer)
uniform float uDensity;   // share of circuit cells with line work
uniform float uGap;       // gap between honeycomb cells (cell apothem = 1)
uniform float uBand;      // frame bezel width
uniform float uDouble;    // 1 = a second neon line in each frame
uniform float uLasers;    // laser beams: 6 (corners) or 12

uniform vec3 uBg;         // palette, linear RGB (changes on lead notes)
uniform vec3 uFrame;
uniform vec3 uInner;
uniform vec3 uCircuit;
uniform vec3 uLaser;
uniform vec3 uAccent;

uniform float uLit[7];    // per-cell light from lead notes: 0 centre, 1..6 around
uniform float uNote;      // any lead note: the whole picture lifts
uniform float uBloom;     // long lead notes: every cell lights
uniform float uBass;      // Part B bass: frames thicken their glow
uniform float uStab;      // Part C stabs: lasers flare
uniform float uArp;       // Part C arps: circuit sparks
uniform float uArpSeed;   // which sparks (changes per arp note)
uniform float uShimmer;   // the long high note: soft glow swell
uniform float uDrone;     // the drone: lasers breathe
uniform float uFlash;     // part change: burn to white and clear

// Framing and light (lib/framing.js).
uniform float uAimX;      // camera aim off the tunnel axis, radians
uniform float uAimY;
uniform float uSway;      // aim drift per loop, radians (figure eight)
uniform float uRoll;      // camera rock per loop, radians
uniform float uCore;      // far light brightness
uniform float uExposure;  // overall exposure

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Flat-top hexagon distance: 1 on the edge of a hex with apothem 1.
float hexR(vec2 p) {
  p = abs(p);
  return max(p.y, dot(p, vec2(0.8660254, 0.5)));
}

vec2 rot(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

// The camera's ray: it rocks by uRoll and looks off the axis by uAim,
// drifting by uSway, once per loop (phase 0..1).
vec3 aimRay(vec2 uv, float phase) {
  float a = TAU * phase;
  vec3 d = vec3(rot(uv, uRoll * sin(a)), uFocal);
  vec2 aim = vec2(uAimX, uAimY) + uSway * vec2(sin(a), 0.5 * sin(2.0 * a));
  d.xz = rot(d.xz, aim.x);
  d.yz = rot(d.yz, aim.y);
  return normalize(d);
}

// Uniform arrays only take loop indices in GLSL ES 1.0.
float lit(int k) {
  float v = 0.0;
  for (int i = 0; i < 7; i++) {
    if (i == k) v = uLit[i];
  }
  return v;
}

// A neon tube: white-hot core, coloured halo. d and w in the same units.
vec3 neon(float d, float w, vec3 c) {
  float core = exp(-(d * d) / (w * w));
  float halo = exp(-abs(d) / (w * 4.0));
  return c * (core * 1.2 + halo * 0.5) + vec3(core * 0.6);
}

// Circuit line work on the walls, in cell coords x (around, along). Every
// tunnel side carries the same pattern (so a sixth turn is seamless) and it
// repeats every period. fp = pixel footprint in cells: fine detail fades to
// its average instead of shimmering.
vec3 circuits(vec2 x, float fp) {
  vec2 id = floor(x);
  vec2 f = fract(x) - 0.5;
  vec2 key = vec2(mod(id.x, uCellsAround), mod(id.y, uCellsDeep));
  float on = step(hash21(key), uDensity);
  float kind = hash21(key + 7.3);
  float o = hash21(key + 3.1) - 0.5;
  float w = 0.05 + fp * 0.7;
  float d;
  if (kind < 0.45) {
    // streak along the tunnel
    d = abs(f.x - o * 0.7);
  } else if (kind < 0.75) {
    // short bar across
    d = length(vec2(max(abs(f.x) - 0.3, 0.0), f.y - o * 0.7));
  } else {
    // bracket
    float a = length(vec2(f.x - o * 0.5, max(abs(f.y) - 0.35, 0.0)));
    float b = length(vec2(max(abs(f.x - o * 0.5 - 0.15) - 0.15, 0.0), f.y - 0.35));
    d = min(a, b);
  }
  float line = 1.0 - smoothstep(w * 0.4, w, d) + 0.25 * exp(-d / (w * 2.0));
  float detail = 1.0 - smoothstep(0.3, 0.8, fp);
  vec3 c = mix(uCircuit, uAccent, step(0.85, hash21(key + 11.7)));
  // Arp sparks: a different handful of elements on every arp note.
  float spark = step(hash21(key + uArpSeed * 13.1), 0.15) * uArp;
  return c * mix(uDensity * 0.15, on * line, detail) * (1.0 + 4.0 * spark);
}

void main() {
  float phase = fract(uTime / uLoop);
  float minRes = min(uRes.x, uRes.y);
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / minRes * 2.0;
  float pixAng = 2.0 / (minRes * uFocal);
  // The spin turns the tunnel, not the camera, so an off-axis vanishing
  // point stays put.
  vec3 rd = aimRay(uv, phase);
  rd.xy = rot(rd.xy, uSpin * TAU / 6.0 * phase);

  // Constant speed: exactly one period per loop, i.e. set by the BPM.
  float cz = phase * uPeriod;

  // Walls: the ray meets the hex tube once.
  float hr = max(hexR(rd.xy), 1e-4);
  float t = min(1.0 / hr, 80.0);
  float depth = t * rd.z;
  float ang = mod(atan(rd.y, rd.x) / TAU * 6.0, 6.0);
  vec2 x = vec2(ang * uCellsAround, (cz + depth) * uCellsDeep / uPeriod);
  float fp = t * pixAng / hr * uCellsDeep / uPeriod;
  vec3 col = uBg * 1.2 + circuits(x, fp);

  // Lasers along the corners (12: and the middle of each side); angular
  // width, so they widen toward you.
  float la = atan(rd.y, rd.x) / TAU * uLasers;
  float ad = abs(fract(la + 0.5) - 0.5) * TAU / uLasers;
  float beam = exp(-pow(ad / (0.006 + 0.006 * uStab), 2.0)) + 0.3 * exp(-ad / 0.03);
  col += uLaser * beam * (0.35 + 0.5 * uDrone + 2.0 * uStab);

  // The far tunnel melts into the light you fly toward (Gaussian falloff
  // keeps the near walls saturated).
  vec3 core = mix(uFrame, uInner, 0.5) * 1.5 * uCore;
  float far = depth * uDepth;
  col = mix(col, core, 1.0 - exp(-far * far));

  // Honeycomb gates, far to near; each fills the tube.
  float gap = uPeriod / uGates;
  float cell = 0.92 / (3.0 + uGap); // cell apothem in tube units
  float extent = 3.0 + uGap;
  float win = 1.0 - uBand;
  float dz0 = gap - mod(cz, gap);
  for (int i = 0; i < GATES; i++) {
    float dz = dz0 + float(GATES - 1 - i) * gap;
    if (dz > depth) continue; // this pixel's ray hits the wall first
    float s = dz / rd.z;
    vec2 q = rd.xy * s / cell;
    if (hexR(q) > extent + 0.6) continue;
    float fpl = pixAng * s / cell; // one pixel in cell units
    float vis = 1.0 - smoothstep(0.03, 0.12, fpl);
    float fogG = 1.0 - exp(-(dz * uDepth) * (dz * uDepth));
    float lw = max(0.02, fpl * 1.2);
    // Only the centre and the two outer cells either side of q can be near.
    float k0 = floor(atan(q.y, q.x) / TAU * 6.0 - 1.5);
    for (int c = 0; c < 3; c++) {
      vec2 centre = vec2(0.0);
      int idx = 0;
      if (c > 0) {
        float k = k0 + float(c - 1);
        float an = (k + 1.5) * TAU / 6.0;
        centre = (2.0 + uGap) * vec2(cos(an), sin(an));
        idx = 1 + int(mod(k, 6.0) + 0.5);
      }
      float h = hexR(q - centre);
      float L = max(lit(idx), uBloom);
      // Bezel: a dark band hiding what's behind it (fogged with distance).
      float band = step(win, h) * step(h, 1.0);
      col = mix(col, mix(uBg * 0.35, core, fogG), band * vis);
      float glow = (0.5 + 2.5 * L) * vis * (1.0 - fogG);
      vec3 innerCol = uDouble > 0.5 ? uInner : uFrame;
      col += neon(h - 1.0, lw, uFrame) * glow * (1.0 + 1.5 * uBass);
      col += neon(h - win, lw, innerCol) * glow;
      col += neon(h - (win + 1.0) * 0.5, lw * 0.7, uInner) * glow * 0.6 * uDouble;
      // A lit outer cell's window fills with a little of its light.
      if (c > 0) col += uFrame * 0.12 * L * step(h, win) * vis * (1.0 - fogG);
    }
  }

  // Lead notes lift the whole picture, the long high note swells.
  col *= 0.85 + 0.25 * uNote + 0.3 * uShimmer;
  col += core * 0.05 * uShimmer;
  col = mix(col, mix(uFrame, vec3(1.0), 0.6) * 3.0, uFlash);

  // Tonemap, vignette, gamma, dither.
  col = 1.0 - exp(-col * 1.2 * uExposure);
  col *= 1.0 - 0.25 * dot(uv * 0.5, uv * 0.5);
  col = pow(col, vec3(1.0 / 2.2)) * uFade;
  col += (hash21(gl_FragCoord.xy + uTime) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
