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
uniform float uTime;
uniform vec4 uLiquid[MAX_RECTS]; // rgb colour, a fill level (0-1)
uniform float uSlosh[MAX_RECTS];
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
  float hasLiquid = 0.0;
  vec2 lp = vec2(0.0), lHalf = vec2(1.0);
  vec3 lColor = vec3(0.0);
  float lLevel = 0.0, lSlosh = 0.0, lSeed = 0.0;
  for (int i = 0; i < uCount; i++) {
    vec3 box = sdRoundBox(p - uRect[i].xy, uRect[i].zw, uMeta[i].x);
    float h = clamp(0.5 + 0.5 * (d - box.x) / k, 0.0, 1.0);
    d = mix(d, box.x, h) - k * h * (1.0 - h);
    g = mix(g, box.yz, h);
    frost = mix(frost, uMeta[i].z, h);
    alpha = mix(alpha, uMeta[i].y, h);
    bevelWidth = mix(bevelWidth, uMeta[i].w, h);
    if (box.x < 0.0 && uLiquid[i].a > 0.001) {
      hasLiquid = 1.0;
      lHalf = uRect[i].zw;
      lp = (p - uRect[i].xy) / lHalf;
      lColor = uLiquid[i].rgb;
      lLevel = uLiquid[i].a;
      lSlosh = uSlosh[i];
      lSeed = float(i);
    }
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

    // Water in a glass tube. lp runs -1..1 across the tube, y downward.
    if (hasLiquid > 0.5) {
      float x = clamp(lp.x, -1.0, 1.0);
      float curve = sqrt(max(1.0 - x * x, 0.0));
      float wave = sin(x * 2.6 + uTime * 1.5 + lSeed * 1.7) * (0.006 + lSlosh * 0.05)
        + sin(x * 6.3 - uTime * 2.1 + lSeed) * (0.002 + lSlosh * 0.02);
      float surfaceY = 1.0 - 2.0 * lLevel + wave;
      // The surface is a disc seen slightly from above: back and front edges of an ellipse.
      float ell = (lHalf.x / lHalf.y) * 0.13;
      float front = surfaceY + ell * curve;
      float back = surfaceY - ell * curve;
      float aa = 1.6 / lHalf.y;
      // The glass has thickness: water stops short of the outer wall.
      float wall = smoothstep(3.0 * uDpr, 6.0 * uDpr, -d);
      float body = smoothstep(front - aa, front + aa, lp.y) * wall;
      float disc = smoothstep(back - aa, back + aa, lp.y) * (1.0 - smoothstep(front - aa, front + aa, lp.y)) * wall;
      if (body + disc > 0.001) {
        float depth = max(lp.y - front, 0.0) * 0.5;
        // A water-filled cylinder is a strong lens: it flips and stretches what's behind it.
        vec2 bend = vec2(-x * lHalf.x * 1.85, sin(lp.y * 9.0 + uTime * 0.9 + lSeed) * 3.0 * uDpr) / uRes;
        vec3 behind = vec3(
          textureLod(uScene, uv + bend, 1.2).r,
          textureLod(uScene, uv + bend * 1.06, 1.2).g,
          textureLod(uScene, uv + bend * 1.12, 1.2).b
        );
        // Light through the water: colour by absorption, stronger through longer paths.
        vec3 absorb = (1.0 - lColor) * 2.4 + 0.1;
        vec3 transmit = exp(-absorb * (0.3 + curve * 0.75) * (0.55 + depth * 1.3));
        // Light scattered inside: brightest under the surface, falling off with depth.
        vec3 scatter = lColor * (0.03 + 0.2 * exp(-depth * 3.2)) * (0.5 + 0.5 * curve);
        // Caustics: faint, irregular light, only just below the surface.
        vec2 cp = vec2(lp.x * 3.1 + lSeed * 2.3, lp.y * 6.0 * lHalf.y / lHalf.x * 0.3 - uTime * 0.13);
        cp += 0.7 * vec2(sin(cp.y * 2.3 + uTime * 0.4), sin(cp.x * 1.9 - uTime * 0.31));
        cp += 0.35 * vec2(sin(cp.y * 4.7 - uTime * 0.27), sin(cp.x * 5.3 + uTime * 0.23));
        float caustic = pow(max(1.0 - abs(sin(cp.x * 2.1) + sin(cp.y * 2.7)) * 0.9, 0.0), 7.0);
        vec3 water = behind * transmit * 2.0 + scatter
          + mix(lColor, vec3(1.0), 0.5) * caustic * 0.06 * exp(-depth * 5.5) * curve;
        // Roll off highlights like a camera, so nothing burns out.
        water = 1.0 - exp(-water * 1.35);

        // A few rising bubbles.
        for (int j = 0; j < 5; j++) {
          float fj = float(j);
          float r1 = fract(sin((fj + lSeed * 3.1) * 12.9898) * 43758.5453);
          float r2 = fract(sin((fj + lSeed * 3.1) * 78.233) * 12543.123);
          float rise = fract(uTime * (0.035 + r2 * 0.05) + r1);
          vec2 bc = vec2((r1 - 0.5) * 1.3 + sin(rise * 14.0 + r2 * 6.0) * 0.05, 1.0 - rise * (1.0 - front) * 1.0);
          vec2 bd = (lp - vec2(bc.x, front + (1.0 - front) * (1.0 - rise))) * lHalf;
          float br = (0.8 + r2 * 2.0) * uDpr * clamp(lHalf.x / (110.0 * uDpr), 0.5, 1.3);
          float ring = smoothstep(1.4 * uDpr, 0.0, abs(length(bd) - br));
          float spark = smoothstep(br * 0.5, 0.0, length(bd + vec2(br * 0.35, br * 0.35)));
          water += (ring * 0.2 + spark * 0.5) * smoothstep(1.0, 0.75, rise) * smoothstep(0.0, 0.06, rise);
        }

        // The disc catches the sky; the front edge is a bright meniscus line.
        float across = clamp((lp.y - back) / max(front - back, 0.001), 0.0, 1.0);
        vec3 discCol = water * 0.75 + mix(lColor, vec3(1.0), 0.6) * (0.12 + 0.3 * across);
        vec3 inner = mix(water, discCol, disc);
        inner += exp(-abs(lp.y - front) * lHalf.y / (1.5 * uDpr)) * 0.5 * mix(lColor, vec3(1.0), 0.75) * curve;
        // Round the column: dark at the sides, one long soft highlight.
        inner *= mix(1.0, 0.58, pow(abs(x), 5.0));
        inner += body * exp(-pow((x + 0.56) / 0.075, 2.0)) * 0.16;
        inner += body * exp(-pow((x - 0.68) / 0.03, 2.0)) * 0.06;
        glass = mix(glass, inner, body + disc);
      }
    }

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
  readonly liquid = new Float32Array(MAX_GLASS_RECTS * 4);
  readonly slosh = new Float32Array(MAX_GLASS_RECTS);
  private levels = new WeakMap<Element, { y: number; v: number }>();
  private colors = new Map<string, [number, number, number]>();
  private radii = new WeakMap<Element, string>();

  private color(value: string): [number, number, number] {
    let c = this.colors.get(value);
    if (!c) {
      const name = value.match(/var\((--[^)]+)\)/)?.[1];
      const hex = (name ? getComputedStyle(document.documentElement).getPropertyValue(name) : value).trim();
      const m = hex.match(/^#([0-9a-f]{6})$/i);
      const v = m ? parseInt(m[1]!, 16) : 0xffffff;
      c = [(v >> 16) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
      this.colors.set(value, c);
    }
    return c;
  }

  /** data-liquid (colour) and data-level (0-1) fill a tube; the level moves like a spring, so it sloshes. */
  private water(el: HTMLElement, n: number, dt: number) {
    if (!el.dataset.liquid) {
      this.liquid.set([0, 0, 0, 0], n * 4);
      this.slosh[n] = 0;
      return;
    }
    const target = Math.max(0, Math.min(1, Number(el.dataset.level) || 0));
    let s = this.levels.get(el);
    if (!s) {
      s = { y: 0, v: 0 };
      this.levels.set(el, s);
    }
    s.v += (target - s.y) * 16 * dt;
    s.v *= Math.exp(-3.2 * dt);
    s.y += s.v * dt;
    this.liquid.set([...this.color(el.dataset.liquid), Math.max(0, s.y)], n * 4);
    this.slosh[n] = Math.min(1, Math.abs(s.v) * 1.4);
  }

  collect(dpr: number, dt = 0.016): number {
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
      this.water(el, n, dt);
      n++;
    }
    return n;
  }
}
