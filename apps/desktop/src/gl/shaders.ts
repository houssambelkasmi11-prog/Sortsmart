export const FULLSCREEN_VS = /* glsl */ `#version 300 es
void main() {
  // One triangle covering the screen, no vertex buffer needed.
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** What sits behind the glass: a flowing colour field, or the camera. */
export const SCENE_FS = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform sampler2D uCam;
uniform float uCamOn;
uniform vec2 uCamSize;
uniform float uMirror;
uniform vec3 uTint;
uniform float uScan;
uniform float uPulse;
uniform vec3 uPulseColor;
out vec4 frag;

vec3 field(vec2 uv) {
  float t = uTime;
  vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0) * 2.1;
  vec2 q = p + 0.7 * vec2(sin(p.y * 1.5 + t * 0.13), cos(p.x * 1.3 - t * 0.11));
  vec2 r = q + 0.55 * vec2(sin(q.y * 2.4 - t * 0.17 + 1.7), cos(q.x * 2.1 + t * 0.09 + 0.4));
  float a = 0.5 + 0.5 * sin(r.x * 1.7 + r.y * 1.2);
  float b = 0.5 + 0.5 * cos(r.x * 1.1 - r.y * 2.0 + t * 0.07);
  float c = 0.5 + 0.5 * sin(length(r) * 2.6 - t * 0.1);
  vec3 col = vec3(0.012, 0.016, 0.04);
  col = mix(col, vec3(0.02, 0.14, 0.42), a * a);
  col = mix(col, uTint * 0.75, b * b * b * 0.85);
  col = mix(col, vec3(0.2, 0.08, 0.5), c * c * c * c * 0.7);
  col += vec3(0.5, 0.3, 0.7) * pow(a * b * c, 3.0) * 0.8;
  return col;
}

void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 uv = px / uRes;
  vec2 center = uRes * 0.5;
  vec2 fromCenter = px - center;
  float dist = length(fromCenter);
  float unit = uRes.y;

  // While analysing, the picture ripples outward from the centre.
  float wave = sin(dist / unit * 34.0 - uTime * 7.0) * exp(-dist / unit * 2.6) * uScan;
  vec2 warped = uv + normalize(fromCenter + 0.001) * wave * 0.008;

  vec3 col = field(warped);
  if (uCamOn > 0.001) {
    float screenAspect = uRes.x / uRes.y;
    float camAspect = uCamSize.x / max(uCamSize.y, 1.0);
    vec2 scale = camAspect > screenAspect ? vec2(screenAspect / camAspect, 1.0) : vec2(1.0, camAspect / screenAspect);
    vec2 cuv = (warped - 0.5) * scale + 0.5;
    if (uMirror > 0.5) cuv.x = 1.0 - cuv.x;
    cuv.y = 1.0 - cuv.y;
    vec3 cam = texture(uCam, cuv).rgb;
    float vig = smoothstep(1.25, 0.35, length((uv - 0.5) * vec2(1.25, 1.6)));
    col = mix(col, cam * mix(0.5, 1.0, vig), uCamOn);
  }

  // Analysing glow, and a ring of the stream's colour when a result lands.
  col += uTint * exp(-abs(dist / unit - fract(uTime * 0.45) * 0.9) * 26.0) * uScan * 0.28;
  float ring = uPulse * max(uRes.x, uRes.y) * 0.85;
  col += uPulseColor * exp(-abs(dist - ring) / (unit * 0.09)) * (1.0 - uPulse) * 0.65;
  frag = vec4(col, 1.0);
}`;

/**
 * Liquid glass. Every [data-glass] element becomes a rounded box in a signed
 * distance field; neighbours melt together through a smooth union. Inside the
 * field the scene is refracted at the bevel, split into colour fringes, blurred
 * through its mip chain, and lit along the rim.
 */
export const COMPOSITE_FS = /* glsl */ `#version 300 es
precision highp float;
#define MAX_RECTS 24
uniform sampler2D uScene;
uniform vec2 uRes;
uniform float uDpr;
uniform int uCount;
uniform vec4 uRect[MAX_RECTS];
uniform vec4 uMeta[MAX_RECTS];
uniform vec2 uMouse;
out vec4 frag;

vec3 sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 s = vec2(p.x < 0.0 ? -1.0 : 1.0, p.y < 0.0 ? -1.0 : 1.0);
  vec2 w = abs(p) - b + r;
  float g = max(w.x, w.y);
  vec2 q = max(w, 0.0);
  float l = length(q);
  vec2 dir = g > 0.0 ? q / max(l, 0.0001) : (w.x > w.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
  return vec3((g > 0.0 ? l : g) - r, s * dir);
}

vec3 frosted(vec2 uv, float lod) {
  if (lod < 0.5) return textureLod(uScene, uv, lod).rgb;
  vec2 o = pow(2.0, lod) * 0.6 / uRes;
  return (textureLod(uScene, uv, lod).rgb * 2.0
    + textureLod(uScene, uv + vec2(o.x, o.y), lod).rgb
    + textureLod(uScene, uv + vec2(-o.x, o.y), lod).rgb
    + textureLod(uScene, uv + vec2(o.x, -o.y), lod).rgb
    + textureLod(uScene, uv + vec2(-o.x, -o.y), lod).rgb) / 6.0;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 base = texture(uScene, uv).rgb;

  float d = 1e5;
  vec2 g = vec2(0.0);
  float frost = 0.0;
  float alpha = 0.0;
  float k = 12.0 * uDpr;
  for (int i = 0; i < uCount; i++) {
    vec3 box = sdRoundBox(p - uRect[i].xy, uRect[i].zw, uMeta[i].x);
    float h = clamp(0.5 + 0.5 * (d - box.x) / k, 0.0, 1.0);
    d = mix(d, box.x, h) - k * h * (1.0 - h);
    g = mix(g, box.yz, h);
    frost = mix(frost, uMeta[i].z, h);
    alpha = mix(alpha, uMeta[i].y, h);
  }

  // Soft contact shadow around the glass.
  vec3 col = base * (1.0 - 0.3 * alpha * exp(-max(d, 0.0) / (24.0 * uDpr)));

  if (d < 2.0) {
    float bevelWidth = 20.0 * uDpr;
    float t = clamp(-d / bevelWidth, 0.0, 1.0);
    float bevel = 1.0 - sqrt(max(1.0 - (1.0 - t) * (1.0 - t), 0.0));
    vec2 offset = -g * bevel * (46.0 * uDpr) / uRes;
    float lod = mix(1.0, 5.2 + log2(uDpr), frost);
    vec3 glass = vec3(
      frosted(uv + offset, lod).r,
      frosted(uv + offset * 1.08, lod).g,
      frosted(uv + offset * 1.16, lod).b
    );
    float luma = dot(glass, vec3(0.299, 0.587, 0.114));
    glass = mix(vec3(luma), glass, 1.35);
    // Frosted panels sink darker so text stays readable over any picture.
    glass = mix(glass * 1.06 + 0.035, glass * 0.42 + 0.03, frost);
    // Tame bright pictures so white text and icons hold up on clear glass too.
    glass *= 1.0 - 0.5 * smoothstep(0.45, 1.0, luma);

    vec2 light = normalize(vec2(-0.45, -0.9));
    float rim = smoothstep(2.4 * uDpr, 0.0, -d);
    float facing = dot(g, light);
    glass += rim * (0.42 * max(facing, 0.0) + 0.17 * max(-facing, 0.0) + 0.05);
    glass += bevel * bevel * 0.1 * max(facing, 0.0);

    vec2 toMouse = uMouse - p;
    float near = exp(-length(toMouse) / (200.0 * uDpr));
    glass += pow(max(dot(g, normalize(toMouse + 0.001)), 0.0), 5.0) * near * bevel * 0.9;

    col = mix(col, glass, smoothstep(0.8, -0.8, d) * alpha);
  }

  // Dither, so slow gradients don't band.
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  frag = vec4(col + (n - 0.5) / 255.0 * 1.5, 1.0);
}`;
