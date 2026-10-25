// Portal Loops — nebula tube flight.
//
// No raymarching: each camera ray hits the inside of a tube exactly once
// (solved analytically, refined twice for the bend). The wall carries a
// procedural nebula (domain-warped noise) plus stars. Forward motion is the
// wall streaming past at a constant, BPM-locked speed toward a bright core.
//
// Seamless loops: the noise tiles around the tube and every uPeriod units
// along it, and the camera flies exactly one period per loop.
precision highp float;

#define TAU 6.28318530718
#define PI 3.14159265359
#define OCTAVES 5

uniform vec2 uRes;        // canvas size, px
uniform float uTime;      // seconds (capture: frame / 60)
uniform float uLoop;      // loop length, seconds (whole beats)
uniform float uBeats;     // beats per loop
uniform float uPeriod;    // units flown per loop = texture period along z
uniform float uFade;      // 0..1 overall brightness (fade on play)

uniform float uRadius;    // tube radius
uniform float uSides;     // 0 = round tube, else polygon side count
uniform float uCells;     // noise cells around the tube (integer)
uniform float uTwist;     // texture turns per period: spiral
uniform float uSpin;      // whole turns per loop, constant rate
uniform vec2 uPathAmp;    // tube bend amplitude
uniform vec2 uPathFreq;   // bends per period (integers)
uniform float uFocal;     // lens

uniform float uStretch;   // cell elongation along the tube

uniform float uWarp;      // nebula domain-warp strength
uniform float uContrast;  // nebula contrast
uniform float uStars;     // star density/brightness
uniform float uDepth;     // how fast the far tube melts into the core light

uniform vec3 uDeep;       // palette, linear RGB
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uHot;

// Fly-through between parts: the camera keeps its speed, only the ring moves.
uniform float uRing;      // 0 none; 0 → 1 over a part's last bar, 1 = passing through
uniform float uFlash;     // 1 → 0: the light clearing in the next part

float gPhase;

vec2 path(float z) {
  float w = TAU * z / uPeriod;
  return uPathAmp * vec2(sin(w * uPathFreq.x), sin(w * uPathFreq.y + 1.7));
}

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

// Fractal noise; octaves finer than ~2px (blur = cell footprint) fade out,
// so the far tube doesn't shimmer.
float fbm(vec2 x, vec2 per, float blur) {
  float sum = 0.0;
  float amp = 0.5;
  float fr = 1.0;
  for (int o = 0; o < OCTAVES; o++) {
    float keep = 1.0 - smoothstep(0.25, 0.7, blur * fr);
    sum += amp * keep * noise(x * fr, per * fr);
    fr *= 2.0;
    amp *= 0.5;
  }
  return sum;
}

float stars(vec2 x, vec2 per, float scale, float blur) {
  vec2 sx = x * scale;
  vec2 si = mod(floor(sx), per * scale);
  vec2 sd = fract(sx) - vec2(hash21(si + 3.1), hash21(si + 7.7)) * 0.8 - 0.1;
  float on = step(0.8, hash21(si));
  float size = 0.04 + 0.05 * hash21(si + 1.9);
  float b = blur * scale;
  return on * exp(-dot(sd, sd) / (size * size + b * b)) * size * size / (size * size + b * b);
}

// Ray vs the inside of the tube (round or polygon) centred on c.
float tubeHit(vec2 o, vec2 d) {
  if (uSides < 2.5) {
    float a = max(dot(d, d), 1e-6);
    float b = dot(o, d);
    float c = dot(o, o) - uRadius * uRadius;
    return (-b + sqrt(max(b * b - a * c, 0.0))) / a;
  }
  float t = 1e4;
  for (int k = 0; k < 8; k++) {
    if (float(k) >= uSides) break;
    float ang = TAU * float(k) / uSides;
    vec2 n = vec2(cos(ang), sin(ang));
    float dn = dot(d, n);
    if (dn > 1e-5) t = min(t, (uRadius - dot(o, n)) / dn);
  }
  return t;
}

// Distance from the tube's axis in the tube's own shape (1 = on the wall).
float shapeR(vec2 q) {
  if (uSides < 2.5) return length(q);
  float r = 0.0;
  for (int k = 0; k < 8; k++) {
    if (float(k) >= uSides) break;
    float ang = TAU * float(k) / uSides;
    r = max(r, dot(q, vec2(cos(ang), sin(ang))));
  }
  return r;
}

void main() {
  float loopT = mod(uTime, uLoop);
  gPhase = loopT / uLoop;

  float minRes = min(uRes.x, uRes.y);
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / minRes * 2.0;
  float pixAng = 2.0 / (minRes * uFocal);

  // Constant speed: exactly one period per loop, i.e. set by the BPM.
  float cz = gPhase * uPeriod;
  vec3 ro = vec3(path(cz), cz);
  vec3 ta = vec3(path(cz + 4.0), cz + 4.0);
  vec3 fw = normalize(ta - ro);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(uv.x * rt + uv.y * up + uFocal * fw);

  // Hit the wall; refine for the bending centreline.
  vec2 c0 = path(cz);
  float t = 0.0;
  for (int it = 0; it < 3; it++) {
    t = tubeHit(ro.xy - c0, rd.xy);
    c0 = path(ro.z + rd.z * min(t, 60.0));
  }
  t = min(t, 60.0);
  vec3 p = ro + rd * t;
  vec2 q = p.xy - path(p.z);
  float depth = p.z - cz;

  // Wall texture coordinates: around (u) and along (v). uStretch elongates
  // the cells along the tube (streakier = faster feel); per keeps it tiling.
  float ang = atan(q.y, q.x) / TAU + uTwist * p.z / uPeriod + uSpin * gPhase;
  float vk = max(1.0, floor(uCells * uPeriod / (TAU * uRadius * uStretch) + 0.5)) / uPeriod;
  vec2 per = vec2(uCells, uPeriod * vk);
  vec2 x = vec2(ang * uCells, p.z * vk);

  // Footprint of one pixel in texture cells (grazing walls compress).
  float graze = max(abs(dot(rd.xy, normalize(q))), 0.08);
  float blur = t * pixAng * vk / graze;

  // Nebula: fbm warped by fbm, two-tone from the warp field.
  vec2 w = vec2(fbm(x, per, blur), fbm(x + vec2(5.2, 1.3), per, blur));
  float n = fbm(x + uWarp * 4.0 * w, per, blur);
  float neb = clamp(0.5 + uContrast * n, 0.0, 1.0);
  vec3 col = mix(uDeep, mix(uColA, uColB, smoothstep(-0.25, 0.25, w.y)), smoothstep(0.2, 0.9, neb));
  col += uHot * pow(neb, 8.0) * 0.7;
  col *= 0.08 + 1.2 * neb * neb;

  // Stars: two layers of small points (one candidate per fine cell),
  // elongated along the tube by uStretch.
  col += mix(uHot, uColB, 0.3) * (stars(x, per, 12.0, blur) + 0.6 * stars(x + 0.5, per, 28.0, blur)) * 1.5 * uStars;

  // Depth: the far tube melts into a bright core, the light you fly toward.
  vec3 core = mix(uColB, uHot, 0.6);
  // Gaussian falloff keeps the near walls saturated, only the distance glows.
  float far = depth * uDepth;
  col = mix(col, core, 1.0 - exp(-far * far));

  // Fly-through ring: a band of light just inside the wall, in the tube's
  // shape, that emerges from the core and rushes at the camera (distance
  // falls with the square of the time left, so it accelerates), passing
  // over it on the bar line as everything burns to white. The new part
  // opens out of that white (uFlash).
  if (uRing > 0.0) {
    float left = 1.0 - uRing;
    float zr = cz + 0.05 + 28.0 * left * left;
    float tr = (zr - ro.z) / max(rd.z, 1e-4);
    if (tr > 0.0 && tr < t) {
      float r = shapeR(ro.xy + rd.xy * tr - path(zr));
      // Never thinner than ~1.5px, so it doesn't sparkle far away.
      float width = max(0.03 + 0.08 * uRing, 1.5 * tr * pixAng);
      float band = exp(-pow((r - 0.82 * uRadius) / width, 2.0));
      col += mix(uHot, uColB, 0.25) * band * (2.5 + 6.0 * uRing) * smoothstep(0.0, 0.15, uRing);
    }
    col *= 1.0 + 1.5 * uRing * uRing * uRing;
  }
  float white = max(pow(uRing, 6.0), uFlash * uFlash * (3.0 - 2.0 * uFlash));
  col = mix(col, core * 3.0, white);

  // Tonemap, vignette, gamma, dither.
  col = 1.0 - exp(-col * 1.25);
  col *= 1.0 - 0.3 * dot(uv * 0.5, uv * 0.5);
  col = pow(col, vec3(1.0 / 2.2)) * uFade;
  col += (hash21(gl_FragCoord.xy + loopT) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
