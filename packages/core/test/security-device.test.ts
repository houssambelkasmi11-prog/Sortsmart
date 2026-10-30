import { describe, expect, it } from "vitest";
import {
  MockSortingDevice,
  buildSortCommand,
  createLogger,
  defaultSettings,
  loadSettings,
  maskSecret,
  prepareImage,
  redact,
  validateCommand,
  validateEndpoint,
  type ClassificationResult,
  type LogEntry,
} from "../src";

describe("security", () => {
  it("never logs secrets", () => {
    const entries: LogEntry[] = [];
    const log = createLogger((e) => entries.push(e));
    log.log("info", "calling with Bearer sk-abcdef1234567890", { headers: { Authorization: "Bearer sk-live-xyz123456789", "x-api-key": "sk-ant-api03-zzzzzzzzzz" }, apiKey: "k", nested: { note: "token sk-proj-0123456789abc" } });
    const text = JSON.stringify(entries);
    expect(text).not.toMatch(/sk-(abc|live|ant|proj)/);
    expect(text).toContain("[redacted]");
  });

  it("masks keys using only a hint", () => {
    expect(maskSecret("9f2c")).toBe("••••••••9f2c");
    expect(maskSecret(null)).toBe("Not set");
    expect(redact({ token: "abc" })).toEqual({ token: "[redacted]" });
  });

  it("validates endpoints", () => {
    expect(validateEndpoint("http://127.0.0.1:11434", "local").ok).toBe(true);
    expect(validateEndpoint("http://192.168.1.5:11434", "local").ok).toBe(false);
    expect(validateEndpoint("http://api.openai.com/v1", "cloud").ok).toBe(false);
    expect(validateEndpoint("https://user:pw@api.openai.com/v1", "cloud").ok).toBe(false);
    expect(validateEndpoint("https://api.openai.com/v1?x=1", "cloud").ok).toBe(false);
    expect(validateEndpoint("file:///etc/passwd", "local").ok).toBe(false);
    expect(validateEndpoint("https://api.anthropic.com", "cloud").ok).toBe(true);
  });

  it("rejects unsupported or oversized images", async () => {
    await expect(prepareImage(new Uint8Array([1]), "image/gif")).rejects.toMatchObject({ kind: "invalid-request" });
    await expect(prepareImage(new Uint8Array(0), "image/png")).rejects.toMatchObject({ kind: "invalid-request" });
    const ok = await prepareImage(new Uint8Array([1, 2, 3]), "image/png");
    expect(ok.sha256).toHaveLength(64);
  });
});

describe("settings persistence", () => {
  it("falls back safely on corrupt or invalid settings", () => {
    expect(loadSettings("{nope").recovered).toBe(true);
    expect(loadSettings(JSON.stringify({ version: 99 })).recovered).toBe(true);
    const round = loadSettings(JSON.stringify(defaultSettings()));
    expect(round.recovered).toBe(false);
    expect(round.value.mode).toBe("demo");
    expect(round.value.hybrid.cloudFallbackEnabled).toBe(false);
    expect(round.value.history.enabled).toBe(false);
  });
});

const result = (o: Partial<ClassificationResult>): ClassificationResult => ({
  id: "r1",
  category: "glass",
  confidence: 0.9,
  material: "jar",
  reasoning: "",
  requiresReview: false,
  reviewReasons: [],
  warnings: [],
  flags: [],
  provider: "p",
  model: "m",
  location: "local",
  inference: "ai",
  promptVersion: "v",
  rulesProfile: "default-5",
  timestamp: new Date().toISOString(),
  latencyMs: 1,
  cacheHit: false,
  ...o,
});

describe("device commands", () => {
  it("refuses to route review-pending or hazardous results", () => {
    expect(buildSortCommand(result({ requiresReview: true, category: null }), { confidenceThreshold: 0.75 }).ok).toBe(false);
    expect(buildSortCommand(result({ flags: ["hazardous"] }), { confidenceThreshold: 0.75 }).ok).toBe(false);
    expect(buildSortCommand(result({ confidence: 0.5 }), { confidenceThreshold: 0.75 }).ok).toBe(false);
  });

  it("allows a user decision to route a reviewed item", () => {
    const b = buildSortCommand(result({ requiresReview: true, category: null }), { confidenceThreshold: 0.75, userCategory: "residual" });
    expect(b.ok && b.command.decidedBy).toBe("user");
  });

  it("rejects invalid commands", () => {
    const b = buildSortCommand(result({}), { confidenceThreshold: 0.75 });
    if (!b.ok) throw new Error("expected command");
    expect(validateCommand({ ...b.command, category: "batteries" as never })).toMatch(/Unsupported/);
    expect(validateCommand({ ...b.command, issuedAt: "2000-01-01T00:00:00Z" })).toMatch(/expired/);
  });
});

describe("MockSortingDevice", () => {
  const cmd = () => {
    const b = buildSortCommand(result({}), { confidenceThreshold: 0.75 });
    if (!b.ok) throw new Error();
    return b.command;
  };

  it("is always labelled simulated", async () => {
    const d = new MockSortingDevice("nominal", 0);
    expect((await d.connect()).simulated).toBe(true);
  });

  it("rejects commands while disconnected", async () => {
    const r = await new MockSortingDevice("nominal", 0).executeSort(cmd());
    expect(r.commandAccepted).toBe(false);
  });

  it("keeps acknowledgement and physical verification distinct", async () => {
    const noSensor = new MockSortingDevice("no-verification-sensor", 0);
    await noSensor.connect();
    const r = await noSensor.executeSort(cmd());
    expect(r.deviceAcknowledged).toBe(true);
    expect(r.physicalVerification).toBe("not-supported");

    const jam = new MockSortingDevice("jam", 0);
    await jam.connect();
    const j = await jam.executeSort(cmd());
    expect(j.physicalVerification).toBe("failed");
    expect((await jam.getStatus()).state).toBe("safe-stop");
  });
});
