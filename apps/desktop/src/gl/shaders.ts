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
