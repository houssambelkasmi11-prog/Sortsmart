import { describe, expect, it } from "vitest";
import { ClassificationEngine, GeminiProvider, OllamaProvider, ProviderError, defaultSettings, geminiThinkingConfig, pickLocalModel, type AIProvider } from "../src";
import { config, fakeTransport, image, json, validOutput } from "./helpers";

const ollamaCfg = config({ kind: "ollama", endpoint: "http://127.0.0.1:11434", location: "local", model: "m" });
const answer = (o: unknown = validOutput) => () => json(200, { message: { content: JSON.stringify(o) } });

describe("Ollama speed", () => {
  it("turns thinking off for models that think, and keeps the model loaded", async () => {
    const { transport, calls } = fakeTransport({ "POST /api/show": () => json(200, { capabilities: ["vision", "thinking"] }), "POST /api/chat": answer() });
    await new OllamaProvider(ollamaCfg, transport).classify(image);
    const chat = JSON.parse(calls.find((c) => c.url.endsWith("/api/chat"))!.body!);
    expect(chat.think).toBe(false);
    expect(chat.keep_alive).toBe("30m");
    expect(chat.messages.at(-1)).toEqual({ role: "assistant", content: "<think>\n\n</think>\n\n" });
  });

  it("asks only for what the screen needs, and accepts the shorter answer", async () => {
    const { reasoning: _r, warnings: _w, ...short } = validOutput;
    const { transport, calls } = fakeTransport({ "POST /api/show": () => json(200, { capabilities: ["vision"] }), "POST /api/chat": answer(short) });
    const { output } = await new OllamaProvider(ollamaCfg, transport).classify(image);
    const chat = JSON.parse(calls.find((c) => c.url.endsWith("/api/chat"))!.body!);
    expect(chat.format.required).toEqual(["material", "category", "confidence", "flags"]);
    expect(output.category).toBe(validOutput.category);
    expect(output.reasoning).toBe("");
    expect(output.warnings).toEqual([]);
  });

  it("leaves models that don't think alone", async () => {
    const { transport, calls } = fakeTransport({ "POST /api/show": () => json(200, { capabilities: ["vision"] }), "POST /api/chat": answer() });
    await new OllamaProvider(ollamaCfg, transport).classify(image);
    const chat = JSON.parse(calls.find((c) => c.url.endsWith("/api/chat"))!.body!);
    expect(chat.think).toBeUndefined();
    expect(chat.messages.at(-1).role).toBe("user");
  });

  it("warms up without sending an image", async () => {
    const { transport, calls } = fakeTransport({ "POST /api/chat": () => json(200, {}) });
    await new OllamaProvider(ollamaCfg, transport).warmUp();
    expect(JSON.parse(calls[0]!.body!)).toEqual({ model: "m", messages: [], keep_alive: "30m" });
  });
});

describe("model answers", () => {
  it("accepts harmless formatting differences", async () => {
    const { transport } = fakeTransport({
      "POST /api/show": () => json(200, { capabilities: ["vision"] }),
      "POST /api/chat": answer({ ...validOutput, category: " Plastic_Metal ", confidence: 85, warnings: null, reasoning: "x".repeat(2000) }),
    });
    const { output } = await new OllamaProvider(ollamaCfg, transport).classify(image);
    expect(output.category).toBe("plastic-metal");
    expect(output.confidence).toBeCloseTo(0.85);
    expect(output.warnings).toEqual([]);
    expect(output.reasoning).toHaveLength(1000);
  });

  it("still rejects a category that doesn't exist", async () => {
    const { transport } = fakeTransport({ "POST /api/show": () => json(200, { capabilities: ["vision"] }), "POST /api/chat": answer({ ...validOutput, category: "batteries" }) });
    await expect(new OllamaProvider(ollamaCfg, transport).classify(image)).rejects.toMatchObject({ kind: "invalid-response" });
  });
});

describe("Gemini", () => {
  it("picks the thinking setting each generation accepts", () => {
    expect(geminiThinkingConfig("gemini-2.5-flash")).toEqual({ thinkingBudget: 0 });
    expect(geminiThinkingConfig("gemini-2.5-pro")).toEqual({ thinkingBudget: 128 });
    expect(geminiThinkingConfig("gemini-3-flash")).toEqual({ thinkingLevel: "low" });
    expect(geminiThinkingConfig("gemini-2.0-flash")).toBeUndefined();
  });

  it("sends it, and reads how long a rate limit asks to wait", async () => {
    const cfg = config({ kind: "gemini", endpoint: "https://generativelanguage.googleapis.com", location: "cloud", model: "gemini-2.5-flash", declaredImageInput: true });
    const { transport, calls } = fakeTransport({
      "POST /v1beta/models/gemini-2.5-flash:generateContent": () => json(429, { error: { message: "Quota", details: [{ retryDelay: "23s" }] } }),
    });
    const err = await new GeminiProvider(cfg, transport).classify(image).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.retryAfterMs).toBe(23_000);
    expect(JSON.parse(calls[0]!.body!).generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });
});

describe("safety net", () => {
  const classifyAs = async (material: string, flags: string[] = []) => {
    const settings = { ...defaultSettings(), mode: "local" as const, localProviderId: "p" };
    const provider = {
      id: "p",
      name: "p",
      kind: "ollama",
      location: "local",
      config: ollamaCfg,
      classify: async () => ({ output: { ...validOutput, category: "residual", confidence: 0.95, material, flags }, model: "m" }),
    } as unknown as AIProvider;
    const out = await new ClassificationEngine({ getSettings: () => settings, getProvider: () => provider }).classify(image);
    if (!out.ok) throw out.error;
    return out.result;
  };

  it("forces review when a model names a battery but doesn't flag it", async () => {
    const r = await classifyAs("lithium battery");
    expect(r.flags).toContain("hazardous");
    expect(r.requiresReview).toBe(true);
  });

  it("does the same for electronics, without duplicating flags", async () => {
    expect((await classifyAs("old phone charger")).flags).toEqual(["electronic"]);
    expect((await classifyAs("AA batteries", ["hazardous"])).flags).toEqual(["hazardous"]);
  });

  it("leaves ordinary items alone", async () => {
    const r = await classifyAs("sneaker");
    expect(r.flags).toEqual([]);
    expect(r.requiresReview).toBe(false);
  });
});

describe("local model choice", () => {
  it("prefers the recommended model, then falls back to what's installed", () => {
    expect(pickLocalModel(["qwen3-vl:8b", "gemma3:4b"])).toBe("gemma3:4b");
    expect(pickLocalModel(["qwen3-vl:8b", "gemma3:latest"])).toBe("gemma3:latest");
    expect(pickLocalModel(["qwen3-vl:8b"])).toBe("qwen3-vl:8b");
    expect(pickLocalModel([])).toBeNull();
  });
});

describe("engine retries", () => {
  const setup = (classify: AIProvider["classify"]) => {
    const settings = { ...defaultSettings(), mode: "local" as const, localProviderId: "p" };
    const provider = { id: "p", name: "p", kind: "ollama", location: "local", config: ollamaCfg, classify } as unknown as AIProvider;
    return new ClassificationEngine({ getSettings: () => settings, getProvider: () => provider, sleep: async () => {} });
  };

  it("retries a garbled answer once", async () => {
    let n = 0;
    const engine = setup(async () => {
      n++;
      throw new ProviderError("invalid-response", "bad");
    });
    expect((await engine.classify(image)).ok).toBe(false);
    expect(n).toBe(2);
  });

  it("doesn't sit on a long rate-limit wait", async () => {
    let n = 0;
    const engine = setup(async () => {
      n++;
      throw new ProviderError("rate-limit", "slow down", { retryAfterMs: 23_000 });
    });
    const out = await engine.classify(image);
    expect(n).toBe(1);
    expect(!out.ok && out.error.retryAfterMs).toBe(23_000);
  });
});
