import { CATEGORY_IDS } from "../categories";
import { ProviderError } from "../errors";
import { SYSTEM_PROMPT, USER_PROMPT } from "../prompt";
import { FLAG_IDS, type ProviderConfig } from "../schemas";
import { joinUrl } from "../security";
import type { HttpTransport, SecretRef } from "../transport";
import { parseModelOutput, requestJson, requireModel, testViaListModels } from "./base";
import type { AIProvider, ModelInfo, ProviderCapabilities } from "./types";

interface ModelsResponse {
  models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
}
interface GenerateResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

/**
 * Gemini's response schema is an OpenAPI subset: no additionalProperties,
 * upper-case type names. Kept equivalent to OUTPUT_JSON_SCHEMA; the result is
 * still validated by ModelOutputSchema.
 */
const GEMINI_SCHEMA = {
  type: "OBJECT",
  required: ["category", "confidence", "flags", "material", "reasoning", "warnings"],
  propertyOrdering: ["category", "confidence", "flags", "material", "reasoning", "warnings"],
  properties: {
    category: { type: "STRING", enum: [...CATEGORY_IDS, "unknown"] },
    confidence: { type: "NUMBER", minimum: 0, maximum: 1 },
    material: { type: "STRING" },
    reasoning: { type: "STRING" },
    flags: { type: "ARRAY", items: { type: "STRING", enum: [...FLAG_IDS] } },
    warnings: { type: "ARRAY", items: { type: "STRING" } },
  },
} as const;

/**
 * Newer models "think" by default, which adds seconds and isn't needed to name a
 * bin. Each generation takes a different setting, and older ones reject both.
 */
export function geminiThinkingConfig(model: string): Record<string, unknown> | undefined {
  if (/gemini-2\.5/.test(model)) return /pro/.test(model) ? { thinkingBudget: 128 } : { thinkingBudget: 0 };
  if (/gemini-[3-9]/.test(model)) return { thinkingLevel: "low" };
  return undefined;
}

/** Google Gemini API (generativelanguage.googleapis.com), native generateContent. */
export class GeminiProvider implements AIProvider {
  readonly kind = "gemini" as const;
  readonly location = "cloud" as const;

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

  private get auth(): SecretRef {
    return { providerId: this.config.id, header: "x-goog-api-key", scheme: "raw" };
  }

  async capabilities(): Promise<ProviderCapabilities> {
    return { imageInput: this.config.declaredImageInput, structuredOutput: true, cancellation: true };
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const data = await requestJson<ModelsResponse>(
      this.transport,
      { method: "GET", url: joinUrl(this.config.endpoint, "/v1beta/models?pageSize=200"), timeoutMs: 10_000, auth: this.auth },
      signal,
      false,
    );
    if (!Array.isArray(data.models)) throw new ProviderError("invalid-response", "Unexpected /v1beta/models response.");
    return data.models
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => {
        const id = m.name.replace(/^models\//, "");
        return { id, name: m.displayName ? `${m.displayName} (${id})` : id, imageInput: null };
      });
  }

  testConnection(signal?: AbortSignal) {
    return testViaListModels(() => this.listModels(signal));
  }

  async classify(input: Parameters<AIProvider["classify"]>[0], signal?: AbortSignal) {
    const model = requireModel(this.config);
    if (!this.config.declaredImageInput) throw new ProviderError("capability", `Image input is disabled for "${model}" in provider settings.`);
    const thinkingConfig = geminiThinkingConfig(model);
    const data = await requestJson<GenerateResponse>(
      this.transport,
      {
        method: "POST",
        url: joinUrl(this.config.endpoint, `/v1beta/models/${encodeURIComponent(model)}:generateContent`),
        headers: { "content-type": "application/json" },
        timeoutMs: this.config.timeoutMs,
        auth: this.auth,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ inline_data: { mime_type: input.mimeType, data: input.base64 } }, { text: USER_PROMPT }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: GEMINI_SCHEMA,
            ...(thinkingConfig ? { thinkingConfig } : {}),
          },
        }),
      },
      signal,
      true,
    );
    if (data.promptFeedback?.blockReason) {
      throw new ProviderError("invalid-response", `Gemini blocked the request (${data.promptFeedback.blockReason}).`, { dataSent: true });
    }
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("");
    if (!text) throw new ProviderError("invalid-response", `No content in response (finishReason: ${candidate?.finishReason ?? "unknown"}).`, { dataSent: true });
    return { output: parseModelOutput(text), model };
  }
}
