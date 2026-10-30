import { COMPOSITE_FS, GlassCollector, createProgram } from "@sorte/ui";

/**
 * The site's one idea, as a shader: the world is a muddy churn, and through the
 * lens the same flow resolves into five clean streams.
 */
const FIELD_FS = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uLens;     // x, y (scene px), radius
uniform float uLensOn;
uniform float uOrder;   // 1 = the whole world is sorted
uniform float uDim;
out vec4 frag;

const vec3 STREAMS[5] = vec3[5](
  vec3(1.0, 0.72, 0.3),
  vec3(0.04, 0.46, 1.0),
  vec3(0.3, 0.84, 1.0),
  vec3(0.16, 0.86, 0.42),
  vec3(0.62, 0.62, 0.68)
);

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.02 + 7.0; a *= 0.5; }
  return v;
}

// Everything mixed together: dark, muddy, the colours fighting each other.
vec3 mess(vec2 p) {
  float t = uTime * 0.05;
  vec2 q = vec2(fbm(p * 1.3 + t), fbm(p * 1.3 + 5.2 - t));
  vec2 r = vec2(fbm(p * 1.1 + 3.0 * q + 1.7 + t), fbm(p * 1.1 + 3.0 * q + 8.3 - t));
  float n = fbm(p + 3.2 * r);
  vec3 col = mix(vec3(0.014, 0.014, 0.018), vec3(0.2, 0.19, 0.2), n * n * 1.8);
  vec3 fleck = mix(mix(STREAMS[0], STREAMS[1], q.x), mix(STREAMS[3], STREAMS[2], q.y), r.x);
  float g = dot(fleck, vec3(0.3, 0.59, 0.11));
  col += mix(vec3(g), fleck, 0.42) * smoothstep(0.46, 0.84, n) * 0.3;
  return col;
}

// The same matter, sorted: exactly five laminar ribbons across the lens, each with its own sheen.
vec3 sorted(vec2 p, float span) {
  float t = uTime * 0.16;
  float y = p.y / span + 0.5
    + 0.05 * sin(p.x * 3.4 / span * 0.5 + t)
    + 0.022 * sin(p.x * 8.0 / span * 0.5 - t * 1.4 + 1.3);
  float band = y * 5.0;
  float id = floor(band);
  float f = fract(band);
  int i = int(mod(id, 5.0) + 5.0) % 5;
  vec3 col = STREAMS[i];
  float round = sin(f * 3.14159);
  col *= 0.16 + 0.98 * pow(round, 0.8);
  float sheen = 0.5 + 0.5 * sin(p.x * 5.0 / span - uTime * 0.5 + id * 1.9);
  col += mix(col, vec3(1.0), 0.45) * pow(round, 30.0) * (0.1 + 0.5 * sheen * sheen);
  return col;
}

void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 p = (px - 0.5 * uRes) / uRes.y;
  float d = length(px - uLens.xy);
  float inLens = smoothstep(uLens.z, uLens.z - 10.0, d) * uLensOn;
  float order = max(inLens, uOrder);
  // Streams sit inside the lens; once it fades, they relax into broad bands across the page.
  vec2 lensP = (uLens.xy - 0.5 * uRes) / uRes.y * uLensOn;
  float span = mix(1.25, uLens.z * 2.0 / uRes.y, uLensOn);
  vec3 col = mix(mess(p * 1.5), sorted(p - lensP, span), order);
  col *= mix(uDim, 1.0, inLens);
  frag = vec4(col, 1.0);
}`;

const SCENE_MAX_WIDTH = 1400;
const damp = (a: number, b: number, rate: number, dt: number) => a + (b - a) * (1 - Math.exp(-rate * dt));

class Field {
  private gl: WebGL2RenderingContext | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private scene!: ReturnType<typeof createProgram>;
  private composite!: ReturnType<typeof createProgram>;
  private fbo: WebGLFramebuffer | null = null;
  private tex: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private collector = new GlassCollector();
  private raf = 0;
  private running = false;
  private last = 0;
  private time = 37;
  private w = 0;
  private h = 0;
  private sw = 0;
  private sh = 0;
  private dpr = 1;
  private quality = 1;
  private slow = 0;
  private mouse: [number, number] = [-9999, -9999];
  private order = 0;
  private orderTarget = 0;
  private dim = 1;
  private dimTarget = 1;
  reduced = false;

  attach(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "default" });
    if (!gl) return false;
    try {
      this.scene = createProgram(gl, FIELD_FS);
      this.composite = createProgram(gl, COMPOSITE_FS);
    } catch (err) {
      console.warn("[sorte] glass unavailable, using CSS fallback", err);
      return false;
    }
    this.gl = gl;
    this.canvas = canvas;
    this.vao = gl.createVertexArray();
    this.fbo = gl.createFramebuffer();
    this.tex = gl.createTexture();
    canvas.addEventListener("webglcontextlost", this.onLost);
    window.addEventListener("pointermove", this.onPointer, { passive: true });
    document.addEventListener("visibilitychange", this.onVisibility);
    document.documentElement.classList.add("has-gl");
    this.start();
    return true;
  }

  detach() {
    this.stop();
    this.canvas?.removeEventListener("webglcontextlost", this.onLost);
    window.removeEventListener("pointermove", this.onPointer);
    document.removeEventListener("visibilitychange", this.onVisibility);
    document.documentElement.classList.remove("has-gl");
    this.gl?.getExtension("WEBGL_lose_context")?.loseContext();
    this.gl = null;
    this.w = this.h = 0;
  }

  /** How sorted the world is (0-1) and how bright, usually driven by scroll. */
  setMood(order: number, dim: number) {
    this.orderTarget = order;
    this.dimTarget = dim;
  }

  private onLost = (e: Event) => {
    e.preventDefault();
    this.stop();
    document.documentElement.classList.remove("has-gl");
  };
  private onPointer = (e: PointerEvent) => {
    this.mouse = [e.clientX, e.clientY];
  };
  private onVisibility = () => (document.hidden ? this.stop() : this.start());

  private start() {
    if (this.running || !this.gl) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      // Slow machine: lower the resolution rather than stutter.
      this.slow = dt > 0.03 ? this.slow + 1 : Math.max(0, this.slow - 1);
      if (this.slow > 40 && this.quality > 0.5) {
        this.quality -= 0.25;
        this.slow = 0;
      }
      this.render(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  private stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private resize() {
    const gl = this.gl!;
    const canvas = this.canvas!;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75) * this.quality;
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    this.dpr = dpr;
    if (w === this.w && h === this.h) return;
    this.w = canvas.width = w;
    this.h = canvas.height = h;
    const s = Math.min(1, SCENE_MAX_WIDTH / w);
    this.sw = Math.max(1, Math.round(w * s));
    this.sh = Math.max(1, Math.round(h * s));
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.sw, this.sh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
  }

  private render(dt: number) {
    const gl = this.gl;
    if (!gl || gl.isContextLost()) return;
    this.resize();
    if (!this.reduced) this.time += dt;
    this.order = damp(this.order, this.orderTarget, 3, dt);
    this.dim = damp(this.dim, this.dimTarget, 3, dt);

    const sc = this.scene;
    const scale = this.sw / window.innerWidth;
    const lens = document.querySelector<HTMLElement>("[data-lens]");
    let lx = -9999;
    let ly = -9999;
    let lr = 0;
    let lensOn = 0;
    if (lens) {
      const r = lens.getBoundingClientRect();
      lx = (r.left + r.width / 2) * scale;
      ly = this.sh - (r.top + r.height / 2) * scale;
      lr = (r.width / 2) * scale;
      lensOn = parseFloat(getComputedStyle(lens).opacity);
    }

    gl.bindVertexArray(this.vao);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.sw, this.sh);
    gl.useProgram(sc.p);
    gl.uniform2f(sc.u("uRes"), this.sw, this.sh);
    gl.uniform1f(sc.u("uTime"), this.time);
    gl.uniform3f(sc.u("uLens"), lx, ly, lr);
    gl.uniform1f(sc.u("uLensOn"), lensOn);
    gl.uniform1f(sc.u("uOrder"), this.order);
    gl.uniform1f(sc.u("uDim"), this.dim);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.generateMipmap(gl.TEXTURE_2D);

    const n = this.collector.collect(this.dpr);
    const co = this.composite;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(co.p);
    gl.uniform1i(co.u("uScene"), 0);
    gl.uniform2f(co.u("uRes"), this.w, this.h);
    gl.uniform1f(co.u("uDpr"), this.dpr);
    gl.uniform1i(co.u("uCount"), n);
    gl.uniform4fv(co.u("uRect"), this.collector.rects);
    gl.uniform4fv(co.u("uMeta"), this.collector.meta);
    gl.uniform2f(co.u("uMouse"), this.mouse[0] * this.dpr, this.mouse[1] * this.dpr);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

export const field = new Field();
