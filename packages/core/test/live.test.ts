import { describe, expect, it } from "vitest";
import { SceneDetector, frameDifference } from "../src";

const SIZE = 100;
const empty = () => new Uint8Array(SIZE).fill(50);
/** A frame with `n` pixels changed, standing in for an item in view. */
const item = (n = 30, value = 200) => {
  const f = empty();
  f.fill(value, 0, n);
  return f;
};

function run(d: SceneDetector, frame: () => Uint8Array, from: number, ms: number, step = 200) {
  const out = [];
  for (let t = from; t <= from + ms; t += step) out.push(d.push(frame(), t));
  return out;
}

describe("frameDifference", () => {
  it("ignores sensor noise and counts real change", () => {
    const noisy = empty().map((v, i) => v + (i % 2 ? 6 : -6));
    expect(frameDifference(empty(), noisy)).toBe(0);
    expect(frameDifference(empty(), item(30))).toBeCloseTo(0.3);
    expect(frameDifference(empty(), new Uint8Array(4))).toBe(1);
  });
});

describe("SceneDetector", () => {
  it("learns the empty scene first and never scans it", () => {
    const d = new SceneDetector();
    const updates = run(d, empty, 0, 3000);
    expect(updates[0]!.phase).toBe("calibrating");
    expect(updates.at(-1)!.phase).toBe("empty");
    expect(updates.some((u) => u.scan)).toBe(false);
  });

  it("scans an item exactly once after it holds still", () => {
    const d = new SceneDetector();
    run(d, empty, 0, 1000);
    const updates = run(d, item, 1200, 4000);
    expect(updates[0]!.phase).toBe("moving");
    expect(updates.some((u) => u.phase === "settling")).toBe(true);
    expect(updates.filter((u) => u.scan)).toHaveLength(1);
    expect(updates.at(-1)!.phase).toBe("holding");
  });

  it("scans a hand-held item that never fully stops, but only once", () => {
    const d = new SceneDetector();
    run(d, empty, 0, 1000);
    let i = 0;
    // 10% of the picture shimmers on every frame: a hand, not a thrown item.
    const updates = run(d, () => item(40 + (i++ % 2) * 10), 1200, 6000, 120);
    expect(updates.filter((u) => u.scan)).toHaveLength(1);
  });

  it("does not rescan an item that only wobbles after settling", () => {
    const d = new SceneDetector();
    run(d, empty, 0, 1000);
    run(d, () => item(40), 1200, 1500);
    const updates = run(d, () => item(44), 2800, 1500);
    expect(updates.some((u) => u.scan)).toBe(false);
  });

  it("does not scan while the picture keeps moving", () => {
    const d = new SceneDetector();
    run(d, empty, 0, 1000);
    let i = 0;
    const updates = run(d, () => item(20 + (i++ % 2) * 30), 1200, 4000);
    expect(updates.some((u) => u.scan)).toBe(false);
  });

  it("scans the same item again after it was taken away", () => {
    const d = new SceneDetector();
    run(d, empty, 0, 1000);
    run(d, item, 1200, 2000);
    run(d, empty, 3400, 1000);
    const again = run(d, item, 4600, 2000);
    expect(again.filter((u) => u.scan)).toHaveLength(1);
  });

  it("scans a different item that replaces the first", () => {
    const d = new SceneDetector();
    run(d, empty, 0, 1000);
    run(d, item, 1200, 2000);
    const next = run(d, () => item(70, 120), 3400, 2000);
    expect(next.filter((u) => u.scan)).toHaveLength(1);
  });

  it("retries after forgetScan and starts over after reset", () => {
    const d = new SceneDetector();
    run(d, empty, 0, 1000);
    expect(run(d, item, 1200, 2000).filter((u) => u.scan)).toHaveLength(1);
    d.forgetScan();
    expect(run(d, item, 3400, 400).filter((u) => u.scan)).toHaveLength(1);
    d.reset();
    expect(run(d, item, 4000, 2000).some((u) => u.scan)).toBe(false);
  });
});
