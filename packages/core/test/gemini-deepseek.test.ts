import { describe, expect, it } from "vitest";
import { GeminiProvider, PROVIDER_PRESETS, createProvider, OpenAICompatibleProvider } from "../src";
import { config, fakeTransport, image, json, validOutput } from "./helpers";

describe("GeminiProvider", () => {
  const cfg = config({ kind: "gemini", endpoint: "https://generativelanguage.googleapis.com", location: "cloud", model: "gemini-test", declaredImageInput: true });

  it("lists only generateContent models and strips the models/ prefix", async () => {
    const { transport, calls } = fakeTransport({
      "GET /v1beta/models": () =>
        json(200, {
          models: [
            { name: "models/gemini-test", displayName: "Gemini Test", supportedGenerationMethods: ["generateContent"] },
            { name: "models/embed-only", supportedGenerationMethods: ["embedContent"] },
          ],
        }),
    });
    const models = await new GeminiProvider(cfg, transport).listModels();
    expect(models.map((m) => m.id)).toEqual(["gemini-test"]);
    expect(calls[0]!.auth).toEqual({ providerId: "p1", header: "x-goog-api-key", scheme: "raw" });
    expect(calls[0]!.url).not.toMatch(/key=/);
  });

  it("sends the image inline with a response schema and validates the answer", async () => {
    const { transport, calls } = fakeTransport({
      "POST /v1beta/models/gemini-test:generateContent": () => json(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(validOutput) }] } }] }),
    });
    const r = await new GeminiProvider(cfg, transport).classify(image);
    expect(r.output.category).toBe("glass");
    const body = JSON.parse(calls[0]!.body!);
    expect(body.contents[0].parts[0].inline_data).toEqual({ mime_type: "image/jpeg", data: "AAAA" });
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseSchema.properties.category.enum).toContain("unknown");
  });

  it("treats 400 API_KEY_INVALID as a non-retryable auth error", async () => {
    const { transport } = fakeTransport({ "GET /v1beta/models": () => json(400, { error: { message: "API key not valid.", status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] } }) });
    const r = await new GeminiProvider(cfg, transport).testConnection();
    expect(!r.ok && r.kind).toBe("auth");
  });

  it("reports blocked prompts and invalid output", async () => {
    const blocked = fakeTransport({ "POST /v1beta/models/gemini-test:generateContent": () => json(200, { promptFeedback: { blockReason: "SAFETY" } }) });
    await expect(new GeminiProvider(cfg, blocked.transport).classify(image)).rejects.toMatchObject({ kind: "invalid-response" });
    const bad = fakeTransport({ "POST /v1beta/models/gemini-test:generateContent": () => json(200, { candidates: [{ content: { parts: [{ text: '{"category":"glass"}' }] } }] }) });
    await expect(new GeminiProvider(cfg, bad.transport).classify(image)).rejects.toMatchObject({ kind: "invalid-response" });
  });
});

describe("DeepSeek preset", () => {
  it("uses the OpenAI-compatible adapter and does not assume image input", async () => {
    const preset = PROVIDER_PRESETS.deepseek!;
    expect(preset.defaults?.declaredImageInput).toBe(false);
    const { transport, calls } = fakeTransport({ "GET /models": () => json(200, { data: [{ id: "deepseek-chat" }] }) });
    const p = createProvider(config({ kind: preset.kind, endpoint: preset.defaultEndpoint, location: "cloud", model: "deepseek-chat", ...preset.defaults }), { transport });
    expect(p).toBeInstanceOf(OpenAICompatibleProvider);
    expect((await p.testConnection()).ok).toBe(true);
    await expect(p.classify(image)).rejects.toMatchObject({ kind: "capability" });
    expect(calls.some((c) => c.url.endsWith("/chat/completions"))).toBe(false);
  });
});
