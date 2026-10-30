import { ProviderError } from "../errors";
import { LOCAL_OUTPUT_SCHEMA, LOCAL_SYSTEM_PROMPT, USER_PROMPT } from "../prompt";
import type { ProviderConfig } from "../schemas";
import { joinUrl } from "../security";
import type { HttpTransport } from "../transport";
import { parseModelOutput, requestJson, requireModel, testViaListModels } from "./base";
import type { AIProvider, ModelInfo, ProviderCapabilities } from "./types";

interface TagsResponse {
  models?: { name: string; model?: string; size?: number; details?: { families?: string[] | null; parameter_size?: string } }[];
}
interface ShowResponse {
  capabilities?: string[];
  details?: { families?: string[] | null };
  projector_info?: unknown;
}
interface ChatResponse {
  message?: { content?: string };
}

const VISION_FAMILIES = ["clip", "mllama"];
/** How long Ollama keeps the model in memory between scans. Loading it again takes many seconds. */
const KEEP_ALIVE = "30m";
/** An empty thought: stops thinking models on Ollama versions that ignore think:false. */
const NO_THOUGHTS = "<think>\n\n</think>\n\n";

/** Ollama native API (https://github.com/ollama/ollama/blob/main/docs/api.md). */
export class OllamaProvider implements AIProvider {
  readonly kind = "ollama" as const;
  readonly location = "local" as const;
  private capabilityCache = new Map<string, boolean | null>();
  private thinkingModels = new Set<string>();

  constructor(
    readonly config: ProviderConfig,
    private transport: HttpTransport,
  ) {}

  get id() {
    return this.config.id;
  }
  get name() {
    return this.config.name;
  }

  private url(path: string) {
    return joinUrl(this.config.endpoint, path);
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const data = await requestJson<TagsResponse>(this.transport, { method: "GET", url: this.url("/api/tags"), timeoutMs: 8_000 }, signal, false);
    if (!Array.isArray(data.models)) throw new ProviderError("invalid-response", "Unexpected /api/tags response.");
    return data.models.map((m) => {
      const families = m.details?.families ?? [];
      const hinted = families.some((f) => VISION_FAMILIES.includes(f)) ? true : null;
      return { id: m.name, name: m.name, imageInput: this.capabilityCache.get(m.name) ?? hinted, sizeBytes: m.size, details: m.details?.parameter_size };
    });
  }

  /** Asks Ollama for the model's declared capabilities. Never assumes vision support. */
  async modelSupportsImages(model: string, signal?: AbortSignal): Promise<boolean | null> {
    if (this.capabilityCache.has(model)) return this.capabilityCache.get(model)!;
    const data = await requestJson<ShowResponse>(
      this.transport,
      { method: "POST", url: this.url("/api/show"), headers: { "content-type": "application/json" }, body: JSON.stringify({ model }), timeoutMs: 8_000 },
      signal,
      false,
    );
    let result: boolean | null = null;
    if (data.capabilities?.includes("thinking")) this.thinkingModels.add(model);
    if (Array.isArray(data.capabilities)) result = data.capabilities.includes("vision");
    else if (data.projector_info) result = true;
    else if (data.details?.families?.some((f) => VISION_FAMILIES.includes(f))) result = true;
    this.capabilityCache.set(model, result);
    return result;
  }

  /** Loads the model ahead of the first scan. */
  async warmUp(signal?: AbortSignal) {
    const model = requireModel(this.config);
    await requestJson(
      this.transport,
      { method: "POST", url: this.url("/api/chat"), headers: { "content-type": "application/json" }, timeoutMs: this.config.timeoutMs, body: JSON.stringify({ model, messages: [], keep_alive: KEEP_ALIVE }) },
      signal,
      false,
    );
  }

  async capabilities(model = this.config.model): Promise<ProviderCapabilities> {
    const imageInput = model ? await this.modelSupportsImages(model) : null;
    return { imageInput, structuredOutput: true, cancellation: true };
  }

  testConnection(signal?: AbortSignal) {
    return testViaListModels(() => this.listModels(signal));
  }

  async classify(input: Parameters<AIProvider["classify"]>[0], signal?: AbortSignal) {
    const model = requireModel(this.config);
    const vision = await this.modelSupportsImages(model, signal);
    if (vision !== true) {
      throw new ProviderError(
        "capability",
        vision === false
          ? `"${model}" does not accept images. Choose a vision model (e.g. one listing the "vision" capability in Ollama).`
          : `Could not verify that "${model}" accepts images. Update Ollama or choose a model with the "vision" capability.`,
      );
    }
    const thinks = this.thinkingModels.has(model);
    const data = await requestJson<ChatResponse>(
      this.transport,
      {
        method: "POST",
        url: this.url("/api/chat"),
        headers: { "content-type": "application/json" },
        timeoutMs: this.config.timeoutMs,
        body: JSON.stringify({
          model,
          stream: false,
          format: LOCAL_OUTPUT_SCHEMA,
          keep_alive: KEEP_ALIVE,
          options: { temperature: 0 },
          ...(thinks ? { think: false } : {}),
          messages: [
            { role: "system", content: LOCAL_SYSTEM_PROMPT },
            { role: "user", content: USER_PROMPT, images: [input.base64] },
            ...(thinks ? [{ role: "assistant", content: NO_THOUGHTS }] : []),
          ],
        }),
      },
      signal,
      true,
    );
    const content = data.message?.content;
    if (typeof content !== "string") throw new ProviderError("invalid-response", "Ollama returned no message content.", { dataSent: true });
    return { output: parseModelOutput(content), model };
  }
}
