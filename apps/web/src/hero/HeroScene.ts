import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

const STREAM_COLORS = ["#ffc56b", "#4f9dff", "#4ff0d2", "#ff8a5c", "#8d90a3"];
const ACID = new THREE.Color("#c8ff3d");
const BG = "#050507";

export interface HeroSceneOptions {
  reducedMotion: boolean;
  onHoverStream?: (index: number | null) => void;
}

/**
 * The SORTÉ lens: a machined barrel, a five-blade aperture (one blade per
 * stream), a living core and a thin-film iridescent front element. It
 * watches the pointer. Delta-time animation, bloom, full disposal.
 */
export class HeroScene {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80);
  private clock = new THREE.Clock();
  private lens = new THREE.Group();
  private pmrem: THREE.PMREMGenerator;
  private disposables: { dispose(): void }[] = [];
  private blades: THREE.Group[] = [];
  private segments: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
  private hitRing!: THREE.Mesh;
  private core!: THREE.ShaderMaterial;
  private glass!: THREE.ShaderMaterial;
  private particles!: THREE.ShaderMaterial;
  private orbits: THREE.Mesh[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2(0, 0);
  private pointerInside = false;
  private rot = { x: 0, y: 0, vx: 0, vy: 0 };
  private aperture = 0.35;
  private coreColor = ACID.clone();
  private highlighted: number | null = null;
  private hovered: number | null = null;
  private frame = 0;
  private running = false;
  private elapsed = 0;
  private intro = 0;
  private scroll = 0;
  private observer: ResizeObserver;

  constructor(
    private canvas: HTMLCanvasElement,
    private opts: HeroSceneOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.background = new THREE.Color(BG);

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.5;
    this.disposables.push(env);

    this.camera.position.set(0, 0, 11);
    this.scene.add(this.lens);
    this.buildLights();
    this.buildBarrel();
    this.buildIris();
    this.buildCore();
    this.buildGlass();
    this.buildLedRing();
    this.buildOrbits();
    this.buildParticles();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
  }

  private track<T extends { dispose(): void }>(x: T): T {
    this.disposables.push(x);
    return x;
  }

  private buildLights() {
    const key = new THREE.DirectionalLight("#e9eeff", 3);
    key.position.set(-5, 6, 6);
    const rim = new THREE.DirectionalLight("#9d8cff", 4);
    rim.position.set(5, 2, -4);
    const rim2 = new THREE.DirectionalLight("#4ff0d2", 2.5);
    rim2.position.set(-5, -3, -3);
    this.scene.add(key, rim, rim2, new THREE.AmbientLight("#1a1f33", 0.6));
  }

  /** Stepped, machined barrel from a lathe profile, plus knurled grip and index ticks. */
  private buildBarrel() {
    const profile = [
      [1.5, -1.2],
      [1.62, -1.1],
      [1.62, -0.35],
      [1.68, -0.3],
      [1.68, 0.12],
      [1.6, 0.18],
      [1.55, 0.18],
      [1.55, 0.42],
      [1.42, 0.5],
      [1.34, 0.5],
      [1.3, 0.44],
      [1.18, 0.4],
      [1.16, 0.2],
    ].map(([r, y]) => new THREE.Vector2(r!, y!));
    const barrelMat = this.track(new THREE.MeshPhysicalMaterial({ color: "#0c0e15", metalness: 0.9, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25 }));
    const barrel = new THREE.Mesh(this.track(new THREE.LatheGeometry(profile, 160)), barrelMat);
    barrel.rotation.x = Math.PI / 2;
    this.lens.add(barrel);

    // Knurled grip.
    const ridges = 180;
    const ridgeGeo = this.track(new THREE.BoxGeometry(0.035, 0.04, 0.68));
    const ridgeMat = this.track(new THREE.MeshPhysicalMaterial({ color: "#151925", metalness: 0.95, roughness: 0.28 }));
    const grip = new THREE.InstancedMesh(ridgeGeo, ridgeMat, ridges);
    const m = new THREE.Matrix4();
    for (let i = 0; i < ridges; i++) {
      const a = (i / ridges) * Math.PI * 2;
      m.makeRotationZ(a).setPosition(Math.cos(a) * 1.64, Math.sin(a) * 1.64, -0.72);
      grip.setMatrixAt(i, m);
    }
    this.lens.add(grip);

    // Index ticks on the front face.
    const ticks = 72;
    const tickGeo = this.track(new THREE.BoxGeometry(0.008, 0.06, 0.004));
    const tickMat = this.track(new THREE.MeshBasicMaterial({ color: "#5d6481" }));
    const tickMesh = new THREE.InstancedMesh(tickGeo, tickMat, ticks);
    for (let i = 0; i < ticks; i++) {
      const a = (i / ticks) * Math.PI * 2;
      const r = i % 6 === 0 ? 1.47 : 1.49;
      m.makeRotationZ(a - Math.PI / 2).setPosition(Math.cos(a) * r, Math.sin(a) * r, 0.425);
      tickMesh.setMatrixAt(i, m);
    }
    this.lens.add(tickMesh);
  }

  /** Five curved blades pivoting on a ring — a real aperture mechanism. */
  private buildIris() {
    const shape = new THREE.Shape();
    shape.moveTo(0.06, -0.12);
    shape.quadraticCurveTo(-0.55, -0.5, -1.32, -0.3);
    shape.lineTo(-1.26, 0.34);
    shape.quadraticCurveTo(-0.5, 0.2, 0.06, 0.14);
    shape.closePath();
    const geo = this.track(new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 24 }));
    const mat = this.track(new THREE.MeshPhysicalMaterial({ color: "#0d0f17", metalness: 0.7, roughness: 0.45, envMapIntensity: 0.25, clearcoat: 0.5, clearcoatRoughness: 0.2, iridescence: 0.45, iridescenceIOR: 1.6, sheen: 0.6, sheenColor: new THREE.Color("#6a5cff") }));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
      const pivot = new THREE.Group();
      pivot.position.set(Math.cos(a) * 1.12, Math.sin(a) * 1.12, 0.14 + i * 0.006);
      pivot.rotation.z = a;
      const blade = new THREE.Mesh(geo, mat);
      pivot.add(blade);
      this.blades.push(pivot);
      this.lens.add(pivot);
    }
    // Back plate so the iris reads against darkness.
    const plate = new THREE.Mesh(this.track(new THREE.CircleGeometry(1.2, 96)), this.track(new THREE.MeshBasicMaterial({ color: "#030305" })));
    plate.position.z = -0.25;
    this.lens.add(plate);
  }

  private buildCore() {
    this.core = this.track(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        uniforms: { uColor: { value: this.coreColor.clone() }, uTime: { value: 0 }, uPulse: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform float uTime; uniform float uPulse;
          varying vec2 vUv;
          void main() {
            vec2 p = vUv - 0.5;
            float r = length(p) * 2.0;
            float a = atan(p.y, p.x);
            float core = smoothstep(0.22, 0.0, r);
            float halo = smoothstep(1.0, 0.1, r) * 0.35;
            // Radial filaments like an eye's stroma.
            float fil = pow(0.5 + 0.5 * sin(a * 23.0 + sin(a * 7.0 + uTime * 0.6) * 2.0), 6.0) * smoothstep(0.85, 0.25, r) * smoothstep(0.1, 0.3, r);
            float ring = smoothstep(0.03, 0.0, abs(r - (0.55 + 0.04 * sin(uTime * 1.3)))) * 0.6;
            vec3 col = uColor * (core * (1.3 + uPulse) + halo + fil * 1.1 + ring) + vec3(1.0) * core * core * core * 0.35;
            gl_FragColor = vec4(col, clamp(core + halo + fil + ring, 0.0, 1.0));
          }
        `,
      }),
    );
    const core = new THREE.Mesh(this.track(new THREE.PlaneGeometry(2.6, 2.6)), this.core);
    core.position.z = -0.2;
    this.lens.add(core);
  }

  /** Front element: thin-film iridescence driven by view angle (fresnel). */
  private buildGlass() {
    const R = 2.2;
    const theta = Math.asin(1.2 / R);
    const geo = this.track(new THREE.SphereGeometry(R, 96, 32, 0, Math.PI * 2, 0, theta));
    this.glass = this.track(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec3 vN; varying vec3 vV; varying vec3 vP;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vN = normalize(normalMatrix * normal);
            vV = normalize(-mv.xyz);
            vP = position;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          varying vec3 vN; varying vec3 vV; varying vec3 vP;
          vec3 film(float t) { return 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + t)); }
          void main() {
            float f = pow(1.0 - clamp(dot(vN, vV), 0.0, 1.0), 2.2);
            float swirl = sin(vP.x * 3.0 + uTime * 0.4) * 0.08 + sin(vP.z * 4.0 - uTime * 0.3) * 0.06;
            vec3 irid = film(f * 1.6 + swirl + uTime * 0.03);
            vec3 L = normalize(vec3(-0.5, 0.7, 0.6));
            float spec = pow(max(dot(reflect(-L, vN), vV), 0.0), 140.0);
            vec3 col = irid * (0.06 + f * 1.1) + vec3(spec) * 0.55;
            gl_FragColor = vec4(col, clamp(0.03 + f * 0.7 + spec * 0.5, 0.0, 1.0));
          }
        `,
      }),
    );
    const glass = new THREE.Mesh(geo, this.glass);
    glass.rotation.x = Math.PI / 2;
    glass.position.z = 0.44 - R * Math.cos(theta);
    this.lens.add(glass);
  }

  /** Five-segment LED ring: one arc per stream. Also the pointer hit target. */
  private buildLedRing() {
    const gap = 0.08;
    STREAM_COLORS.forEach((hex, i) => {
      const start = (i / 5) * Math.PI * 2 + Math.PI / 2 - Math.PI / 5 + gap / 2;
      const mat = this.track(new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(0.55), toneMapped: false, transparent: true }));
      const seg = new THREE.Mesh(this.track(new THREE.RingGeometry(1.36, 1.4, 48, 1, start, (Math.PI * 2) / 5 - gap)), mat);
      seg.position.z = 0.505;
      seg.userData.base = new THREE.Color(hex);
      this.segments.push(seg);
      this.lens.add(seg);
    });
    this.hitRing = new THREE.Mesh(this.track(new THREE.RingGeometry(1.1, 1.75, 64)), this.track(new THREE.MeshBasicMaterial({ visible: false })));
    this.hitRing.position.z = 0.5;
    this.lens.add(this.hitRing);
  }

  private buildOrbits() {
    const specs: [number, string, number][] = [
      [2.35, "#9d8cff", 0.45],
      [2.75, "#c8ff3d", 0.25],
      [3.2, "#4ff0d2", 0.15],
    ];
    for (const [r, color, opacity] of specs) {
      const mesh = new THREE.Mesh(
        this.track(new THREE.TorusGeometry(r, 0.0045, 6, 256)),
        this.track(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, toneMapped: false })),
      );
      this.orbits.push(mesh);
      this.scene.add(mesh);
    }
  }

  private buildParticles() {
    const count = window.innerWidth < 700 ? 500 : 1100;
    const seeds = new Float32Array(count * 4);
    const colors = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      seeds.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
      c.set(STREAM_COLORS[i % 5]!);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    const geo = this.track(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute("seed", new THREE.BufferAttribute(seeds, 4));
    geo.setAttribute("tint", new THREE.BufferAttribute(colors, 3));
    this.particles = this.track(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        uniforms: { uTime: { value: 0 }, uPixelRatio: { value: this.renderer.getPixelRatio() }, uHighlight: { value: -1 } },
        vertexShader: /* glsl */ `
          attribute vec4 seed; attribute vec3 tint;
          uniform float uTime; uniform float uPixelRatio; uniform float uHighlight;
          varying vec3 vTint; varying float vAlpha;
          void main() {
            // Matter drifts in from the field and is pulled into the aperture.
            float phase = fract(seed.y + uTime * (0.03 + seed.z * 0.03));
            float e = phase * phase;
            float radius = mix(3.6 + seed.w * 3.0, 0.05, e);
            float angle = seed.x * 6.2831 + uTime * 0.08 + e * 3.5;
            float z = mix(-1.5 + seed.z * 3.0, 0.2, e);
            vec3 p = vec3(cos(angle) * radius, sin(angle) * radius * 0.85, z);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            float idx = floor(mod(float(gl_VertexID), 5.0));
            float hl = uHighlight < 0.0 ? 1.0 : (abs(idx - uHighlight) < 0.5 ? 2.2 : 0.25);
            gl_PointSize = (1.4 + seed.z * 2.6) * uPixelRatio * (9.0 / -mv.z);
            vTint = tint;
            vAlpha = smoothstep(0.0, 0.15, phase) * (1.0 - smoothstep(0.8, 1.0, phase)) * 0.75 * hl;
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec3 vTint; varying float vAlpha;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d);
            gl_FragColor = vec4(vTint * a * 1.4, a * vAlpha);
          }
        `,
      }),
    );
    const points = new THREE.Points(geo, this.particles);
    points.frustumCulled = false;
    this.lens.add(points);
  }

  private onPointerMove = (e: PointerEvent) => {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.pointerInside = true;
  };

  private onPointerLeave = () => {
    this.pointerInside = false;
  };

  setScroll(p: number) {
    this.scroll = p;
  }

  setHighlight(index: number | null) {
    this.highlighted = index;
  }

  setReducedMotion(v: boolean) {
    this.opts.reducedMotion = v;
    if (!this.running) this.tick(0);
  }

  private resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    const narrow = w / h < 0.9;
    this.camera.position.z = narrow ? 15 : 12;
    this.lens.position.set(narrow ? 0 : THREE.MathUtils.clamp((w / h - 1) * 4, 1.2, 3.6), narrow ? 2.2 : 0.2, 0);
    this.camera.updateProjectionMatrix();
    if (!this.running) this.tick(0);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.getDelta();
    const loop = () => {
      if (!this.running) return;
      this.tick(Math.min(this.clock.getDelta(), 1 / 20));
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  private tick(dt: number) {
    const reduced = this.opts.reducedMotion;
    if (!reduced) this.elapsed += dt;
    const t = this.elapsed;

    // Intro: the lens settles in while its iris opens and the bloom calms down.
    this.intro = reduced ? 1 : Math.min(1, this.intro + dt / 2.2);
    const introEase = 1 - Math.pow(1 - this.intro, 4);
    this.lens.scale.setScalar(0.8 + 0.2 * introEase);
    this.bloom.strength = 0.75 + (1 - introEase) * 1.3;

    // The lens looks toward the pointer (spring-damped).
    const look = this.pointerInside && !reduced;
    const targetY = -0.32 + (1 - introEase) * -0.7 + this.scroll * 0.8 + (look ? this.pointer.x * 0.55 : Math.sin(t * 0.3) * 0.12);
    const targetX = 0.08 + (look ? -this.pointer.y * 0.4 : Math.sin(t * 0.23) * 0.06);
    const k = 22;
    this.rot.vy += (targetY - this.rot.y) * k * dt;
    this.rot.vx += (targetX - this.rot.x) * k * dt;
    const decay = Math.exp(-8 * dt);
    this.rot.vy *= decay;
    this.rot.vx *= decay;
    this.rot.y += this.rot.vy * dt;
    this.rot.x += this.rot.vx * dt;
    if (dt === 0) {
      this.rot.y = targetY;
      this.rot.x = targetX;
    }
    this.lens.rotation.set(this.rot.x, this.rot.y, 0);

    // Hover: which LED segment is the pointer over?
    let hit: number | null = null;
    let centerFocus = 0;
    if (this.pointerInside) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const h = this.raycaster.intersectObject(this.hitRing, false)[0];
      if (h) {
        const local = this.lens.worldToLocal(h.point.clone());
        let a = Math.atan2(local.y, local.x) - (Math.PI / 2 - Math.PI / 5);
        a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        hit = Math.floor(a / ((Math.PI * 2) / 5)) % 5;
      }
      const lensScreen = this.lens.position.clone().project(this.camera);
      centerFocus = Math.max(0, 1 - this.pointer.distanceTo(new THREE.Vector2(lensScreen.x, lensScreen.y)) * 2.5);
    }
    if (hit !== this.hovered) {
      this.hovered = hit;
      this.opts.onHoverStream?.(hit);
      this.canvas.style.cursor = hit !== null ? "pointer" : "";
    }
    const active = this.hovered ?? this.highlighted;
    const lerp = dt === 0 ? 1 : 1 - Math.exp(-6 * dt);

    // Aperture: breathes; opens for a stream; contracts when you look straight in.
    const breathe = reduced ? 0 : Math.sin(t * 0.9) * 0.06;
    const open = (active !== null ? 0.62 : 0.4) + breathe - centerFocus * 0.22 - this.scroll * 0.3;
    const targetAperture = 0.02 + (open - 0.02) * introEase;
    this.aperture += (targetAperture - this.aperture) * lerp;
    this.blades.forEach((b) => (b.children[0]!.rotation.z = this.aperture));

    // Core colour follows the active stream.
    const target = active !== null ? new THREE.Color(STREAM_COLORS[active]!) : ACID;
    this.coreColor.lerp(target, lerp);
    this.core.uniforms.uColor!.value.copy(this.coreColor);
    this.core.uniforms.uTime!.value = t;
    this.core.uniforms.uPulse!.value = centerFocus * 1.5;

    this.segments.forEach((seg, i) => {
      const on = active === null ? 0.55 : active === i ? 1.6 : 0.12;
      seg.material.color.lerp((seg.userData.base as THREE.Color).clone().multiplyScalar(on), lerp);
    });

    this.orbits.forEach((o, i) => {
      o.position.copy(this.lens.position);
      o.rotation.set(1.15 + i * 0.25 + Math.sin(t * 0.1 + i) * 0.1, 0.35 * (i - 1) + t * 0.05 * (i % 2 ? -1 : 1), t * 0.04 * (i + 1));
    });

    this.glass.uniforms.uTime!.value = t;
    this.particles.uniforms.uTime!.value = t;
    this.particles.uniforms.uHighlight!.value = active ?? -1;
    this.camera.lookAt(0, this.camera.aspect < 0.9 ? 0.6 : 0, 0);
    this.composer.render();
  }

  dispose() {
    this.stop();
    this.observer.disconnect();
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    for (const d of this.disposables) d.dispose();
    this.composer.dispose();
    this.bloom.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
