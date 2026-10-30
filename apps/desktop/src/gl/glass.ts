import { COMPOSITE_FS, FULLSCREEN_VS, SCENE_FS } from "./shaders";

const MAX_RECTS = 24;
const SCENE_MAX_WIDTH = 1600;

type Source = HTMLVideoElement | HTMLImageElement;
type Rgb = [number, number, number];

/** Reads a design token ("var(--cat-glass)" or a hex colour) as 0-1 RGB. */
export function cssColor(value: string): Rgb {
  const name = value.match(/var\((--[^)]+)\)/)?.[1];
  const hex = (name ? getComputedStyle(document.documentElement).getPropertyValue(name) : value).trim();
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return [1, 1, 1];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function program(gl: WebGL2RenderingContext, fs: string) {
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "Shader failed");
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl.VERTEX_SHADER, FULLSCREEN_VS));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
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
 * Full-window renderer behind the DOM. Elements marked data-glass="frost" or
 * "clear" get real refraction of whatever is behind them. If WebGL2 is missing
 * the html.has-gl class stays off and CSS provides a plain blurred fallback.
 */
class GlassRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private scene!: ReturnType<typeof program>;
  private composite!: ReturnType<typeof program>;
  private fbo: WebGLFramebuffer | null = null;
  private sceneTex: WebGLTexture | null = null;
  private camTex: WebGLTexture | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private frame = 0;
  private running = false;
  private time = 0;
  private last = 0;
  private w = 0;
  private h = 0;
  private sceneW = 0;
  private sceneH = 0;
  private dpr = 1;
  private quality = 1;
  private slowFrames = 0;
  private source: Source | null = null;
  private sourceSize: [number, number] = [1, 1];
  private lastVideoTime = -1;
  private sourceDirty = false;
  private camOn = 0;
  private mirror = true;
  private tint: Rgb = [0.3, 0.4, 0.9];
  private tintTarget: Rgb = [0.3, 0.4, 0.9];
  private scan = 0;
  private scanTarget = 0;
  private pulse = 1;
  private pulseColor: Rgb = [1, 1, 1];
  private mouse: [number, number] = [-9999, -9999];
  private radii = new WeakMap<Element, number>();
  private rects = new Float32Array(MAX_RECTS * 4);
  private meta = new Float32Array(MAX_RECTS * 4);
  reduced = false;

  attach(canvas: HTMLCanvasElement): boolean {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
    if (!gl) return false;
    try {
      this.scene = program(gl, SCENE_FS);
      this.composite = program(gl, COMPOSITE_FS);
    } catch (err) {
      console.warn("[sorte] glass shaders unavailable, using CSS fallback", err);
      return false;
    }
    this.gl = gl;
    this.vao = gl.createVertexArray();
    this.fbo = gl.createFramebuffer();
    this.sceneTex = gl.createTexture();
    this.camTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.camTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
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
    this.source = null;
    this.w = this.h = 0;
  }

  /** Show a camera or still picture behind the glass, or null for the colour field. */
  setSource(source: Source | null, mirror = false) {
    this.source = source;
    this.mirror = mirror;
    this.lastVideoTime = -1;
    this.sourceDirty = true;
  }
  setMirror(mirror: boolean) {
    this.mirror = mirror;
  }
  setTint(rgb: Rgb) {
    this.tintTarget = rgb;
  }
  setAnalysing(on: boolean) {
    this.scanTarget = on ? 1 : 0;
  }
  firePulse(rgb: Rgb) {
    this.pulseColor = rgb;
    this.pulse = 0;
  }

  private onLost = (e: Event) => {
    e.preventDefault();
    this.stop();
    document.documentElement.classList.remove("has-gl");
  };
  private onPointer = (e: PointerEvent) => {
    this.mouse = [e.clientX, e.clientY];
  };
  private onVisibility = () => {
    if (document.hidden) this.stop();
    else this.start();
  };

  private start() {
    if (this.running || !this.gl) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.adapt(dt);
      this.render(dt);
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }
  private stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  /** Lower the resolution if this machine can't keep up, instead of stuttering. */
  private adapt(dt: number) {
    if (dt > 0.03) this.slowFrames++;
    else this.slowFrames = Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 45 && this.quality > 0.5) {
      this.quality -= 0.25;
      this.slowFrames = 0;
    }
  }

  private resize() {
    const gl = this.gl!;
    const canvas = this.canvas!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.quality;
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    this.dpr = dpr;
    if (w === this.w && h === this.h) return;
    this.w = canvas.width = w;
    this.h = canvas.height = h;
    const s = Math.min(1, SCENE_MAX_WIDTH / w);
    this.sceneW = Math.max(1, Math.round(w * s));
    this.sceneH = Math.max(1, Math.round(h * s));
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.sceneW, this.sceneH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneTex, 0);
  }

  private uploadSource() {
    const gl = this.gl!;
    const src = this.source;
    if (!src) return false;
    let ready = false;
    if (src instanceof HTMLVideoElement) {
      ready = src.readyState >= 2 && src.videoWidth > 0;
      if (ready && src.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = src.currentTime;
        this.sourceSize = [src.videoWidth, src.videoHeight];
        gl.bindTexture(gl.TEXTURE_2D, this.camTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      }
    } else {
      ready = src.complete && src.naturalWidth > 0;
      if (ready && this.sourceDirty) {
        this.sourceDirty = false;
        this.sourceSize = [src.naturalWidth, src.naturalHeight];
        gl.bindTexture(gl.TEXTURE_2D, this.camTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      }
    }
    return ready;
  }

  /** Collects glass elements. Reads layout once per frame, so glass follows every DOM animation. */
  private collect(): number {
    const dpr = this.dpr;
    let n = 0;
    for (const el of document.querySelectorAll<HTMLElement>("[data-glass]")) {
      if (n >= MAX_RECTS) break;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > window.innerHeight) continue;
      let radius = this.radii.get(el);
      if (radius === undefined) {
        radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
        this.radii.set(el, radius);
      }
      const hw = (r.width * dpr) / 2;
      const hh = (r.height * dpr) / 2;
      let alpha = parseFloat(getComputedStyle(el).opacity);
      const screen = el.closest<HTMLElement>(".screen");
      if (screen) alpha *= parseFloat(getComputedStyle(screen).opacity);
      if (alpha < 0.01) continue;
      this.rects.set([(r.left + r.width / 2) * dpr, (r.top + r.height / 2) * dpr, hw, hh], n * 4);
      this.meta.set([Math.min(radius * dpr, hw, hh), alpha, el.dataset.glass === "frost" ? 1 : 0, 0], n * 4);
      n++;
    }
    return n;
  }

  private render(dt: number) {
    const gl = this.gl;
    if (!gl || gl.isContextLost()) return;
    this.resize();
    if (!this.reduced) this.time += dt;
    const ease = 1 - Math.exp(-dt * 5);
    const hasSource = this.uploadSource();
    this.camOn += ((hasSource ? 1 : 0) - this.camOn) * ease;
    this.scan += (this.scanTarget - this.scan) * ease;
    this.pulse = Math.min(1, this.pulse + dt / 1.1);
    this.tint = this.tint.map((v, i) => v + (this.tintTarget[i]! - v) * ease) as Rgb;

    gl.bindVertexArray(this.vao);
    gl.disable(gl.BLEND);

    // Scene pass, with a mip chain the glass can blur through.
    const sc = this.scene;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.sceneW, this.sceneH);
    gl.useProgram(sc.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.camTex);
    gl.uniform1i(sc.u("uCam"), 0);
    gl.uniform2f(sc.u("uRes"), this.sceneW, this.sceneH);
    gl.uniform1f(sc.u("uTime"), this.time);
    gl.uniform1f(sc.u("uCamOn"), this.camOn);
    gl.uniform2f(sc.u("uCamSize"), this.sourceSize[0], this.sourceSize[1]);
    gl.uniform1f(sc.u("uMirror"), this.mirror ? 1 : 0);
    gl.uniform3fv(sc.u("uTint"), this.tint);
    gl.uniform1f(sc.u("uScan"), this.reduced ? 0 : this.scan);
    gl.uniform1f(sc.u("uPulse"), this.reduced ? 1 : this.pulse);
    gl.uniform3fv(sc.u("uPulseColor"), this.pulseColor);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.generateMipmap(gl.TEXTURE_2D);

    // Composite pass: the glass itself.
    const n = this.collect();
    const co = this.composite;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(co.p);
    gl.uniform1i(co.u("uScene"), 0);
    gl.uniform2f(co.u("uRes"), this.w, this.h);
    gl.uniform1f(co.u("uDpr"), this.dpr);
    gl.uniform1i(co.u("uCount"), n);
    gl.uniform4fv(co.u("uRect"), this.rects);
    gl.uniform4fv(co.u("uMeta"), this.meta);
    gl.uniform2f(co.u("uMouse"), this.mouse[0] * this.dpr, this.mouse[1] * this.dpr);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

export const glass = new GlassRenderer();
