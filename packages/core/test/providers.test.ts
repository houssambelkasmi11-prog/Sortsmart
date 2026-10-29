import { describe, expect, it } from "vitest";
import { AnthropicProvider, OllamaProvider, OpenAICompatibleProvider, ProviderError, createFetchTransport, createProvider } from "../src";
import { config, fakeTransport, image, json, validOutput } from "./helpers";

describe("OllamaProvider", () => {
  const visionShow = () => json(200, { capabilities: ["completion", "vision"] });

  it("lists models and tests connection", async () => {
    const { transport } = fakeTransport({ "GET /api/tags": () => json(200, { models: [{ name: "a" }, { name: "b" }] }) });
    const p = new OllamaProvider(config({}), transport);
    const r = await p.testConnection();
    expect(r.ok).toBe(true);
    expect(r.ok && r.modelCount).toBe(2);
  });

  it("reports model discovery failure without throwing", async () => {
    const { transport } = fakeTransport({ "GET /api/tags": () => json(500, { error: "boom" }) });
    const r = await new OllamaProvider(config({}), transport).testConnection();
    expect(r.ok).toBe(false);
    expect(!r.ok && r.kind).toBe("server");
  });

  it("refuses to send images to a text-only model", async () => {
    const { transport, calls } = fakeTransport({ "POST /api/show": () => json(200, { capabilities: ["completion"] }) });
    const p = new OllamaProvider(config({}), transport);
    await expect(p.classify(image)).rejects.toMatchObject({ kind: "capability" });
    expect(calls.some((c) => c.url.endsWith("/api/chat"))).toBe(false);
  });

  it("refuses when vision capability cannot be verified", async () => {
    const { transport } = fakeTransport({ "POST /api/show": () => json(200, { details: { families: ["llama"] } }) });
    await expect(new OllamaProvider(config({}), transport).classify(image)).rejects.toMatchObject({ kind: "capability" });
  });

  it("classifies with a vision model and validates output", async () => {
    const { transport, calls } = fakeTransport({
      "POST /api/show": visionShow,
      "POST /api/chat": () => json(200, { message: { content: JSON.stringify(validOutput) } }),
    });
    const r = await new OllamaProvider(config({}), transport).classify(image);
    expect(r.output.category).toBe("glass");
    const chat = JSON.parse(calls.find((c) => c.url.endsWith("/api/chat"))!.body!);
    expect(chat.format.required).toContain("category");
    expect(chat.messages[1].images).toEqual(["AAAA"]);
  });

  it("rejects an invalid structured response", async () => {
    const { transport } = fakeTransport({
      "POST /api/show": visionShow,
      "POST /api/chat": () => json(200, { message: { content: JSON.stringify({ ...validOutput, category: "batteries" }) } }),
    });
    await expect(new OllamaProvider(config({}), transport).classify(image)).rejects.toMatchObject({ kind: "invalid-response" });
  });

  it("propagates cancellation", async () => {
    const { transport } = fakeTransport({ "POST /api/show": visionShow });
    const ac = new AbortController();
    ac.abort();
    await expect(new OllamaProvider(config({}), transport).classify(image, ac.signal)).rejects.toMatchObject({ kind: "aborted" });
  });
});

describe("OpenAICompatibleProvider", () => {
  const cloud = config({ kind: "openai-compatible", endpoint: "https://api.openai.com/v1", location: "cloud", declaredImageInput: true, declaredStructuredOutput: true });

  it("maps 401 to a non-retryable auth error and attaches secret by reference only", async () => {
    const { transport, calls } = fakeTransport({ "GET /models": () => json(401, { error: { message: "bad key" } }) });
    const r = await new OpenAICompatibleProvider(cloud, transport).testConnection();
    expect(!r.ok && r.kind).toBe("auth");
    expect(calls[0]!.auth).toEqual({ providerId: "p1", header: "authorization", scheme: "bearer" });
    expect(JSON.stringify(calls[0]!.headers ?? {})).not.toMatch(/bearer/i);
    expect(new ProviderError("auth", "x").retryable).toBe(false);
  });

  it("does not assume image support", async () => {
    const { transport, calls } = fakeTransport({});
    const p = new OpenAICompatibleProvider({ ...cloud, declaredImageInput: false }, transport);
    await expect(p.classify(image)).rejects.toMatchObject({ kind: "capability" });
    expect(calls).toHaveLength(0);
  });

  it("sends json_schema only when declared and parses fenced JSON otherwise", async () => {
    const { transport, calls } = fakeTransport({
      "POST /chat/completions": () => json(200, { choices: [{ message: { content: "```json\n" + JSON.stringify(validOutput) + "\n```" } }] }),
    });
    const local = config({ kind: "openai-compatible", endpoint: "http://127.0.0.1:1234/v1", declaredImageInput: true });
    const r = await new OpenAICompatibleProvider(local, transport).classify(image);
    expect(r.output.material).toBe("clear glass jar");
    const body = JSON.parse(calls[0]!.body!);
    expect(body.response_format).toBeUndefined();
    expect(calls[0]!.auth).toBeUndefined();
  });

  it("rejects missing fields", async () => {
    const { transport } = fakeTransport({ "POST /chat/completions": () => json(200, { choices: [{ message: { content: JSON.stringify({ category: "glass" }) } }] }) });
    await expect(new OpenAICompatibleProvider(cloud, transport).classify(image)).rejects.toMatchObject({ kind: "invalid-response" });
  });
});

describe("AnthropicProvider", () => {
  const cfg = config({ kind: "anthropic", endpoint: "https://api.anthropic.com", location: "cloud", declaredImageInput: true });

  it("forces a tool call and validates its input", async () => {
    const { transport, calls } = fakeTransport({
      "POST /v1/messages": () => json(200, { content: [{ type: "tool_use", name: "record_classification", input: validOutput }], stop_reason: "tool_use" }),
    });
    const r = await new AnthropicProvider(cfg, transport).classify(image);
    expect(r.output.category).toBe("glass");
    const body = JSON.parse(calls[0]!.body!);
    expect(body.tool_choice).toEqual({ type: "tool", name: "record_classification" });
    expect(calls[0]!.auth).toEqual({ providerId: "p1", header: "x-api-key", scheme: "raw" });
    expect(calls[0]!.headers!["anthropic-version"]).toBe("2023-06-01");
  });

  it("rejects invalid confidence", async () => {
    const { transport } = fakeTransport({
      "POST /v1/messages": () => json(200, { content: [{ type: "tool_use", name: "record_classification", input: { ...validOutput, confidence: 1.7 } }] }),
    });
    await expect(new AnthropicProvider(cfg, transport).classify(image)).rejects.toMatchObject({ kind: "invalid-response" });
  });
});

describe("registry & transport", () => {
  it("rejects cloud providers over plain HTTP", () => {
    const { transport } = fakeTransport({});
    expect(() => createProvider(config({ kind: "anthropic", location: "cloud", endpoint: "http://api.example.com" }), { transport })).toThrow(/HTTPS|localhost/);
  });

  it("browser fetch transport refuses authenticated and non-loopback requests", async () => {
    const t = createFetchTransport((async () => new Response("{}")) as typeof fetch);
    await expect(t.request({ method: "GET", url: "http://127.0.0.1/x", timeoutMs: 1000, auth: { providerId: "a", header: "x-api-key", scheme: "raw" } })).rejects.toMatchObject({ kind: "config" });
    await expect(t.request({ method: "GET", url: "https://api.openai.com/v1/models", timeoutMs: 1000 })).rejects.toMatchObject({ kind: "config" });
    await expect(t.request({ method: "GET", url: "http://localhost:11434/api/tags", timeoutMs: 1000 })).resolves.toMatchObject({ status: 200 });
  });
});
