/**
 * Liquid glass, shared by the app and the website. Each page renders its own scene
 * into a texture; this composite then bends that scene through [data-glass] elements.
 */
export const FULLSCREEN_VS = /* glsl */ `#version 300 es
void main() {
  // One triangle covering the screen, no vertex buffer needed.
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
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
  float bevelWidth = 20.0 * uDpr;
  float k = 12.0 * uDpr;
  for (int i = 0; i < uCount; i++) {
    vec3 box = sdRoundBox(p - uRect[i].xy, uRect[i].zw, uMeta[i].x);
    float h = clamp(0.5 + 0.5 * (d - box.x) / k, 0.0, 1.0);
    d = mix(d, box.x, h) - k * h * (1.0 - h);
    g = mix(g, box.yz, h);
    frost = mix(frost, uMeta[i].z, h);
    alpha = mix(alpha, uMeta[i].y, h);
    bevelWidth = mix(bevelWidth, uMeta[i].w, h);
  }

  // Soft contact shadow around the glass.
  vec3 col = base * (1.0 - 0.3 * alpha * exp(-max(d, 0.0) / (24.0 * uDpr)));

  if (d < 2.0) {
    float t = clamp(-d / bevelWidth, 0.0, 1.0);
    float bevel = 1.0 - sqrt(max(1.0 - (1.0 - t) * (1.0 - t), 0.0));
    vec2 offset = -g * bevel * (bevelWidth * 2.3) / uRes;
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

export const MAX_GLASS_RECTS = 24;

export function createProgram(gl: WebGL2RenderingContext, fragment: string) {
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "Shader failed");
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl.VERTEX_SHADER, FULLSCREEN_VS));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "Link failed");
  const cache = new Map<string, WebGLUniformLocation | null>();
  return {
    p,
    u(name: string) {
      if (!cache.has(name)) cache.set(name, gl.getUniformLocation(p, name));
      return cache.get(name) ?? null;
    },
  };
}

/**
 * Reads every on-screen [data-glass] element into the composite's uniform arrays.
 * Runs per frame, so glass follows all DOM animation. data-bevel widens the lens edge.
 */
export class GlassCollector {
  readonly rects = new Float32Array(MAX_GLASS_RECTS * 4);
  readonly meta = new Float32Array(MAX_GLASS_RECTS * 4);
  private radii = new WeakMap<Element, string>();

  collect(dpr: number): number {
    let n = 0;
    for (const el of document.querySelectorAll<HTMLElement>("[data-glass]")) {
      if (n >= MAX_GLASS_RECTS) break;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > window.innerHeight) continue;
      let raw = this.radii.get(el);
      if (raw === undefined) {
        raw = getComputedStyle(el).borderTopLeftRadius;
        this.radii.set(el, raw);
      }
      // A percentage radius ("50%") resolves against the element's size.
      const radius = raw.endsWith("%") ? (parseFloat(raw) / 100) * Math.min(r.width, r.height) : parseFloat(raw) || 0;
      const hw = (r.width * dpr) / 2;
      const hh = (r.height * dpr) / 2;
      let alpha = parseFloat(getComputedStyle(el).opacity);
      const screen = el.closest<HTMLElement>(".screen");
      if (screen) alpha *= parseFloat(getComputedStyle(screen).opacity);
      if (alpha < 0.01) continue;
      this.rects.set([(r.left + r.width / 2) * dpr, (r.top + r.height / 2) * dpr, hw, hh], n * 4);
      this.meta.set([Math.min(radius * dpr, hw, hh), alpha, el.dataset.glass === "frost" ? 1 : 0, (Number(el.dataset.bevel) || 20) * dpr], n * 4);
      n++;
    }
    return n;
  }
}
