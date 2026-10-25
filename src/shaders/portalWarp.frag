// #PortalsNo3 Continuum — flight down a hyperspace tunnel.
//
// The camera flies down a round tube at a constant, BPM-locked speed (as in
// #PortalsNo1) toward a soft light at the far end, through hyperspace:
// lanes of starlight streaks rushing past, faster than you. Singularity's
// nebula seeps through, flooding in with uBack (Thor 2, the first
// movement's pad), and uLayer adds a third, fastest streak layer (Part C).
//
// No raymarching: from the axis a ray meets the wall at radius/|rd.xy|.
// Seamless loops: everything on the wall repeats every uPeriod along the
// tube and turns a whole number of times per loop, and the camera flies one
// period per loop.
precision highp float;

#define TAU 6.28318530718

uniform vec2 uRes;        // canvas size, px
uniform float uTime;      // seconds (capture: frame / 60)
uniform float uLoop;      // loop length, seconds (whole beats)
uniform float uFade;      // 0..1 overall brightness (play fade, change dips)

uniform float uPeriod;    // units flown per loop (tube radius 1)
uniform float uFocal;     // lens
uniform float uDepth;     // how fast the far tunnel melts into the light
uniform float uCells;     // nebula/star cells around the tube (integer)
uniform float uStretch;   // their elongation along the tube
uniform float uTwist;     // turns per period (integer)
uniform float uSpin;      // streak turns per loop (integer)
uniform float uLanes;     // streak lanes around (integer)
uniform float uStreak;    // streak cell length, units

uniform vec3 uC0;         // colours, linear RGB (change with the music)
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform vec3 uC4;
uniform vec3 uLight;      // the light at the end

uniform float uTurn;      // extra streak turn, radians (lead notes, part end)
uniform float uNote;      // any lead note: everything flares
uniform float uBass;      // bass: the tunnel breathes out
uniform float uStab;      // stabs: flashes of light
uniform float uPulse;     // the 8th-note pluck: stars twinkle
uniform float uPulseSeed; // which stars (changes per pluck)
uniform float uShimmer;   // the long high note: soft glow swell
uniform float uDrone;     // Thor 1 chords: the far light breathes
uniform float uBack;      // Thor 2: Singularity's nebula floods in
uniform float uLayer;     // 0..1 a third, fastest streak layer (Part C)
uniform float uFlash;     // part change: burn to white and clear

float gPhase;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Gradient noise that tiles with period per (integer cell counts).
float noise(vec2 x, vec2 per) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(mod(i, per)) * TAU;
  float b = hash21(mod(i + vec2(1.0, 0.0), per)) * TAU;
  float c = hash21(mod(i + vec2(0.0, 1.0), per)) * TAU;
  float d = hash21(mod(i + vec2(1.0, 1.0), per)) * TAU;
  float na = dot(vec2(cos(a), sin(a)), f);
  float nb = dot(vec2(cos(b), sin(b)), f - vec2(1.0, 0.0));
  float nc = dot(vec2(cos(c), sin(c)), f - vec2(0.0, 1.0));
  float nd = dot(vec2(cos(d), sin(d)), f - vec2(1.0, 1.0));
  return mix(mix(na, nb, u.x), mix(nc, nd, u.x), u.y);
}

// Fractal noise; octaves finer than ~2px (blur = cell footprint) fade out.
float fbm(vec2 x, vec2 per, float blur) {
  float sum = 0.0;
  float amp = 0.5;
  float fr = 1.0;
  for (int o = 0; o < 4; o++) {
    float keep = 1.0 - smoothstep(0.25, 0.7, blur * fr);
    if (keep <= 0.0) break;
    sum += amp * keep * noise(x * fr, per * fr);
    fr *= 2.0;
    amp *= 0.5;
  }
  return sum;
}

float stars(vec2 x, vec2 per, float scale, float blur, float salt) {
  vec2 sx = x * scale;
  vec2 si = mod(floor(sx), per * scale);
  vec2 sd = fract(sx) - vec2(hash21(si + 3.1 + salt), hash21(si + 7.7 + salt)) * 0.8 - 0.1;
  float on = step(0.8, hash21(si + salt));
  float size = 0.04 + 0.05 * hash21(si + 1.9 + salt);
  float b = blur * scale;
  return on * exp(-dot(sd, sd) / (size * size + b * b)) * size * size / (size * size + b * b);
}

vec3 tone(float h) {
  if (h < 0.2) return uC0;
  if (h < 0.4) return uC1;
  if (h < 0.6) return uC2;
  if (h < 0.8) return uC3;
  return uC4;
}

// A thin line at distance d (in its own units), w = its width there:
// dimmer as it thins, so far lines don't sparkle.
float line(float d, float w) {
  return exp(-d * d / (w * w)) * (0.03 / w);
}

// Hyperspace: lanes of streaks, each layer rushing at you faster than the
// last (whole extra periods per loop). u = turns round, z along the tube.
vec3 warp(float u, float z, float pixU, float pixZ) {
  vec3 c = vec3(0.0);
  for (int l = 0; l < 3; l++) {
    float fl = float(l);
    float gate = l == 2 ? uLayer : 1.0;
    if (gate <= 0.0) break;
    float around = uLanes * (1.0 + fl);
    float along = max(1.0, floor(uPeriod / (uStreak * (1.0 + 0.5 * fl)) + 0.5));
    vec2 g = vec2(u * around, (z + gPhase * uPeriod * (1.0 + fl)) / uPeriod * along);
    vec2 id = vec2(mod(floor(g.x), around), mod(floor(g.y), along));
    vec2 f = fract(g);
    float salt = fl * 13.1;
    float on = step(0.45, hash21(id + salt));
    float lane = abs(f.x - 0.2 - 0.6 * hash21(id + 3.3 + salt));
    float s0 = 0.5 * hash21(id + 7.1 + salt);
    float len = 0.3 + 0.5 * hash21(id + 8.2 + salt);
    float k = (f.y - s0) / len;
    // Bright head nearest you, fading tail.
    float profile = step(0.0, k) * step(k, 1.0) * (1.0 - k) * (1.0 - k);
    float w = max(0.05, 1.5 * pixU * around);
    profile *= 1.0 - smoothstep(0.3, 1.0, pixZ * along / uPeriod / len);
    c += mix(tone(hash21(id + 5.5 + salt)), uLight, 0.45) * on * profile * line(lane, w) * 1.6 * gate;
  }
  return c;
}

void main() {
  float loopT = mod(uTime, uLoop);
  gPhase = loopT / uLoop;

  float minRes = min(uRes.x, uRes.y);
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / minRes * 2.0;
  float pixAng = 2.0 / (minRes * uFocal);

  // Constant speed: exactly one period per loop, i.e. set by the BPM.
  float cz = gPhase * uPeriod;
  vec3 rd = normalize(vec3(uv, uFocal));
  float dl = max(length(rd.xy), 1e-4);
  float t = min((1.0 + 0.06 * uBass) / dl, 60.0);
  vec3 p = rd * t;
  p.z += cz;
  float depth = p.z - cz;
  float u = atan(p.y, p.x) / TAU;
  float graze = max(dl, 0.08);
  float pixU = t * pixAng / TAU;   // a pixel, in turns round the tube
  float pixZ = t * pixAng / graze; // a pixel, in units along it

  // Cell coords for the nebula and stars (tile round and along).
  float vk = max(1.0, floor(uCells * uPeriod / (TAU * uStretch) + 0.5)) / uPeriod;
  vec2 per = vec2(uCells, uPeriod * vk);
  float tw = u + uTwist * p.z / uPeriod;
  vec2 x = vec2(tw * uCells, p.z * vk);
  float blur = max(pixU * uCells, pixZ * vk);

  // The streaks turn with the look's spin, a click per lead note and the
  // spin-up at the part end.
  vec3 col = warp(u - uSpin * gPhase + uTurn / TAU, p.z, pixU, pixZ);

  // Background stars (twinkling on the plucks) and Singularity's nebula,
  // faint until Thor 2 floods it in.
  float tw2 = stars(x, per, 16.0, blur, 0.0);
  col += uLight * tw2 * (0.5 + 2.0 * uPulse * step(0.5, hash21(floor(x * 16.0) + uPulseSeed)));
  vec2 w = vec2(fbm(x, per, blur), fbm(x + vec2(5.2, 1.3), per, blur));
  float neb = clamp(0.5 + 2.2 * fbm(x + 3.0 * w, per, blur), 0.0, 1.0);
  col += mix(uC0, uC1, smoothstep(-0.25, 0.25, w.y)) * neb * neb * (0.06 + 0.9 * uBack);

  col *= (0.8 + 0.4 * smoothstep(0.0, 20.0, depth)) * (1.0 + 0.6 * uNote + 0.3 * uShimmer + 0.8 * uStab);

  // Depth: the far tunnel melts into the light you fly toward.
  // A small, soft light: the far walls fade into it rather than a bright
  // disc swallowing the middle of the frame.
  vec3 core = uLight * (0.7 + 0.4 * uBack + 0.3 * uDrone);
  float far = depth * uDepth;
  col = mix(col, core, 1.0 - exp(-far * far));

  float white = uFlash * uFlash * (3.0 - 2.0 * uFlash);
  col = mix(col, uLight * 3.0, white);

  // Tonemap, vignette, gamma, dither.
  col = 1.0 - exp(-col * 1.25);
  col *= 1.0 - 0.35 * dot(uv * 0.5, uv * 0.5);
  col = pow(col, vec3(1.0 / 2.2)) * uFade;
  col += (hash21(gl_FragCoord.xy + loopT) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
