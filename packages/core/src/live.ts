/**
 * Decides when a live camera has something worth classifying, using only small
 * grayscale frames on the device. No model runs and nothing is sent until the
 * scene has changed and held still, which keeps inference calls deliberate.
 */
export interface SceneDetectorOptions {
  /** Fraction of pixels that must change between frames to count as movement. */
  motionThreshold?: number;
  /** Fraction of pixels that must differ from the empty scene to count as an item. */
  changeThreshold?: number;
  /** How long the picture must hold still, in milliseconds. */
  stableMs?: number;
  /** Per-pixel difference (0-255) ignored as sensor noise. */
  pixelTolerance?: number;
  /** A hand never holds perfectly still: after this long, scan an item that is nearly still. */
  maxWaitMs?: number;
}

/** Same item if less than this differs from the frame already scanned, so a wobble doesn't rescan. */
const SAME_ITEM = 0.1;
/** The most a frame may still be moving for a scan once maxWaitMs has passed. */
const NEARLY_STILL = 0.2;

export type ScenePhase = "calibrating" | "empty" | "moving" | "settling" | "ready" | "holding";

export interface SceneUpdate {
  phase: ScenePhase;
  /** True once per settled item: classify this frame now. */
  scan: boolean;
}

export function frameDifference(a: Uint8Array, b: Uint8Array, pixelTolerance = 14): number {
  if (a.length !== b.length || a.length === 0) return 1;
  let changed = 0;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i]! - b[i]!) > pixelTolerance) changed++;
  }
  return changed / a.length;
}

export class SceneDetector {
  private readonly motion: number;
  private readonly change: number;
  private readonly stableMs: number;
  private readonly tolerance: number;
  private previous: Uint8Array | null = null;
  private baseline: Uint8Array | null = null;
  private scanned: Uint8Array | null = null;
  private stableSince = 0;
  private itemSince = 0;
  private waited = false;
  private readonly maxWait: number;

  constructor(opts: SceneDetectorOptions = {}) {
    this.motion = opts.motionThreshold ?? 0.06;
    this.change = opts.changeThreshold ?? 0.05;
    this.stableMs = opts.stableMs ?? 350;
    this.maxWait = opts.maxWaitMs ?? 1500;
    this.tolerance = opts.pixelTolerance ?? 14;
  }

  /** Start over, treating the next settled picture as the empty scene. */
  reset() {
    this.previous = null;
    this.baseline = null;
    this.scanned = null;
    this.stableSince = 0;
    this.itemSince = 0;
    this.waited = false;
  }

  /** The last scan didn't happen (a request was still running): allow it again. */
  forgetScan() {
    this.scanned = null;
  }

  push(frame: Uint8Array, now: number): SceneUpdate {
    const previous = this.previous;
    this.previous = frame;
    if (!previous) {
      this.stableSince = now;
      return { phase: this.baseline ? "moving" : "calibrating", scan: false };
    }
    const isEmpty = !!this.baseline && frameDifference(frame, this.baseline, this.tolerance) < this.change;
    if (isEmpty || !this.baseline) {
      this.itemSince = 0;
      this.waited = false;
    } else {
      this.itemSince ||= now;
    }
    const movement = frameDifference(frame, previous, this.tolerance);
    if (movement > this.motion) {
      this.stableSince = now;
      // Only once per visit, or someone fidgeting in view would scan over and over.
      if (this.itemSince && !this.waited && now - this.itemSince >= this.maxWait && movement < NEARLY_STILL) {
        this.waited = true;
        this.scanned = frame;
        return { phase: "ready", scan: true };
      }
      return { phase: this.baseline ? (isEmpty ? "empty" : "moving") : "calibrating", scan: false };
    }
    if (now - this.stableSince < this.stableMs) {
      return { phase: this.baseline ? (isEmpty ? "empty" : "settling") : "calibrating", scan: false };
    }
    if (!this.baseline) {
      this.baseline = frame;
      return { phase: "empty", scan: false };
    }
    if (isEmpty) {
      // Follow slow lighting changes, and let the same item be scanned again later.
      this.baseline = frame;
      this.scanned = null;
      return { phase: "empty", scan: false };
    }
    if (this.scanned && frameDifference(frame, this.scanned, this.tolerance) < SAME_ITEM) {
      return { phase: "holding", scan: false };
    }
    this.scanned = frame;
    return { phase: "ready", scan: true };
  }
}
