import { describe, expect, it, vi } from "vitest";
import {
  ClassificationEngine,
  MockProvider,
  ProviderError,
  defaultSettings,
  type AIProvider,
  type ApplicationSettings,
  type ModelOutput,
} from "../src";
import { config, image, validOutput } from "./helpers";

function stubProvider(id: string, location: "local" | "cloud", impl: () => Promise<ModelOutput>): AIProvider & { calls: number } {
  const p = {
    id,
    name: id,
    kind: "ollama" as const,
    location,
    config: config({ id, location }),
    calls: 0,
    capabilities: async () => ({ imageInput: true, structuredOutput: true, cancellation: true }),
    listModels: async () => [],
    testConnection: async () => ({ ok: true as const, message: "", modelCount: 0, latencyMs: 0 }),
    classify: async () => {
      p.calls++;
      return { output: await impl(), model: "m" };
    },
  };
  return p;
}

function setup(over: Partial<ApplicationSettings>, providers: AIProvider[]) {
  const settings = { ...defaultSettings(), ...over };
  const map = new Map(providers.map((p) => [p.id, p]));
  map.set("demo", new MockProvider(undefined, 0));
  const engine = new ClassificationEngine({ getSettings: () => settings, getProvider: (id) => map.get(id) ?? null, sleep: async () => {} });
  return { engine, settings };
}

const out = (o: Partial<ModelOutput>): ModelOutput => ({ ...(validOutput as ModelOutput), ...o });

describe("ClassificationEngine policy", () => {
  it("accepts a confident valid result", async () => {
    const local = stubProvider("l", "local", async () => out({}));
    const { engine } = setup({ mode: "local", localProviderId: "l" }, [local]);
    const r = await engine.classify(image);
    expect(r.ok && r.result.category).toBe("glass");
    expect(r.ok && r.result.requiresReview).toBe(false);
    expect(r.ok && r.result.inference).toBe("ai");
  });

  it("requires review below the threshold", async () => {
    const local = stubProvider("l", "local", async () => out({ confidence: 0.6 }));
    const { engine } = setup({ mode: "local", localProviderId: "l", confidenceThreshold: 0.75 }, [local]);
    const r = await engine.classify(image);
    expect(r.ok && r.result.requiresReview).toBe(true);
    expect(r.ok && r.result.reviewReasons.join()).toMatch(/below/);
  });

  it("sends unknown and hazardous items to review, never a stream", async () => {
    const local = stubProvider("l", "local", async () => out({ category: "unknown", flags: ["hazardous"] }));
    const { engine } = setup({ mode: "local", localProviderId: "l" }, [local]);
    const r = await engine.classify(image);
    expect(r.ok && r.result.category).toBeNull();
    expect(r.ok && r.result.requiresReview).toBe(true);
  });

  it("applies local rules: disabled stream redirected", async () => {
    const local = stubProvider("l", "local", async () => out({ category: "organic" }));
    const s = defaultSettings();
    const rules = { ...s.rules, enabled: { ...s.rules.enabled, organic: false }, redirects: { organic: "residual" as const } };
    const { engine } = setup({ mode: "local", localProviderId: "l", rules }, [local]);
    const r = await engine.classify(image);
    expect(r.ok && r.result.category).toBe("residual");
  });

  it("does not retry auth failures", async () => {
    const local = stubProvider("l", "local", async () => {
      throw new ProviderError("auth", "nope");
    });
    const { engine } = setup({ mode: "local", localProviderId: "l" }, [local]);
    const r = await engine.classify(image);
    expect(r.ok).toBe(false);
    expect(local.calls).toBe(1);
  });

  it("retries transient failures a bounded number of times", async () => {
    const local = stubProvider("l", "local", async () => {
      throw new ProviderError("timeout", "slow");
    });
    const { engine } = setup({ mode: "local", localProviderId: "l" }, [local]);
    const r = await engine.classify(image);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.kind).toBe("timeout");
    expect(local.calls).toBe(3);
  });

  it("caches results and invalidates when the model changes", async () => {
    const local = stubProvider("l", "local", async () => out({}));
    const { engine } = setup({ mode: "local", localProviderId: "l" }, [local]);
    await engine.classify(image);
    const second = await engine.classify(image);
    expect(second.ok && second.result.cacheHit).toBe(true);
    expect(local.calls).toBe(1);
    local.config.model = "other";
    await engine.classify(image);
    expect(local.calls).toBe(2);
  });

  it("deduplicates identical in-flight requests", async () => {
    let resolve!: (o: ModelOutput) => void;
    const local = stubProvider("l", "local", () => new Promise((r) => (resolve = r)));
    const { engine } = setup({ mode: "local", localProviderId: "l" }, [local]);
    const a = engine.classify(image);
    const b = engine.classify(image);
    await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
    resolve(out({}));
    await Promise.all([a, b]);
    expect(local.calls).toBe(1);
  });

  it("enforces the session cloud budget", async () => {
    const cloud = stubProvider("c", "cloud", async () => out({}));
    const s = defaultSettings();
    const { engine } = setup({ mode: "cloud", cloudProviderId: "c", budget: { maxCloudRequestsPerSession: 1 } }, [cloud]);
    await engine.classify(image);
    const r = await engine.classify({ ...image, sha256: "ffffffff00" });
    expect(!r.ok && r.error.kind).toBe("budget");
    expect(s.budget.maxCloudRequestsPerSession).toBe(50);
  });

  it("mock mode is labelled as mock, never AI", async () => {
    const { engine } = setup({ mode: "demo" }, []);
    const r = await engine.classify(image);
    expect(r.ok && r.result.inference).toBe("mock");
    expect(r.ok && r.result.location).toBe("demo");
  });
});

describe("Hybrid mode", () => {
  const uncertain = async () => out({ confidence: 0.4 });

  it("never escalates to cloud unless enabled AND disclosed", async () => {
    const local = stubProvider("l", "local", uncertain);
    const cloud = stubProvider("c", "cloud", async () => out({}));
    const base = { mode: "hybrid" as const, localProviderId: "l", cloudProviderId: "c" };

    const notEnabled = setup({ ...base, hybrid: { cloudFallbackEnabled: false, disclosureAcknowledgedAt: "2026-01-01" } }, [local, cloud]);
    await notEnabled.engine.classify(image);
    const notDisclosed = setup({ ...base, hybrid: { cloudFallbackEnabled: true, disclosureAcknowledgedAt: null } }, [local, cloud]);
    await notDisclosed.engine.classify(image);
    expect(cloud.calls).toBe(0);

    const ok = setup({ ...base, hybrid: { cloudFallbackEnabled: true, disclosureAcknowledgedAt: "2026-01-01" } }, [local, cloud]);
    const r = await ok.engine.classify(image);
    expect(cloud.calls).toBe(1);
    expect(r.ok && r.result.location).toBe("cloud");
    expect(r.attempts.map((a) => a.location)).toEqual(["local", "cloud"]);
  });

  it("does not escalate hazardous items to cloud", async () => {
    const local = stubProvider("l", "local", async () => out({ category: "unknown", flags: ["hazardous"] }));
    const cloud = stubProvider("c", "cloud", async () => out({}));
    const { engine } = setup(
      { mode: "hybrid", localProviderId: "l", cloudProviderId: "c", hybrid: { cloudFallbackEnabled: true, disclosureAcknowledgedAt: "x" } },
      [local, cloud],
    );
    await engine.classify(image);
    expect(cloud.calls).toBe(0);
  });

  it("local mode rejects a cloud provider", async () => {
    const cloud = stubProvider("c", "cloud", async () => out({}));
    const { engine } = setup({ mode: "local", localProviderId: "c" }, [cloud]);
    const r = await engine.classify(image);
    expect(r.ok).toBe(false);
    expect(cloud.calls).toBe(0);
  });
});
