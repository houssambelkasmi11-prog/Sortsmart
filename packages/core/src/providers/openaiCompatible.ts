import { ProviderError } from "../errors";
import { OUTPUT_JSON_SCHEMA, SYSTEM_PROMPT, USER_PROMPT } from "../prompt";
import type { ProviderConfig } from "../schemas";
import { joinUrl } from "../security";
import type { HttpTransport, SecretRef } from "../transport";
import { parseModelOutput, requestJson, requireModel, testViaListModels } from "./base";
import type { AIProvider, ModelInfo, ProviderCapabilities } from "./types";

interface ModelsResponse {
  data?: { id: string }[];
}
interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null; refusal?: string | null } }[];
}

/**
 * OpenAI Chat Completions format. Used for api.openai.com and for local servers
 * that implement the same API (LM Studio, llama.cpp server, vLLM).
 *
 * Image input and JSON-schema output are NOT assumed: the endpoint's capabilities
 * must be declared in the provider config, because a chat-completions API alone
 * says nothing about them.
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly kind = "openai-compatible" as const;

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
  get location() {
    return this.config.location;
  }

  private get auth(): SecretRef | undefined {
    return this.config.location === "cloud" ? { providerId: this.config.id, header: "authorization", scheme: "bearer" } : undefined;
  }

  async capabilities(): Promise<ProviderCapabilities> {
    return { imageInput: this.config.declaredImageInput, structuredOutput: this.config.declaredStructuredOutput, cancellation: true };
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const data = await requestJson<ModelsResponse>(
      this.transport,
      { method: "GET", url: joinUrl(this.config.endpoint, "/models"), timeoutMs: 10_000, auth: this.auth },
      signal,
      false,
    );
    if (!Array.isArray(data.data)) throw new ProviderError("invalid-response", "Unexpected /models response.");
    return data.data.map((m) => ({ id: m.id, name: m.id, imageInput: null }));
  }

  testConnection(signal?: AbortSignal) {
    return testViaListModels(() => this.listModels(signal));
  }

  async classify(input: Parameters<AIProvider["classify"]>[0], signal?: AbortSignal) {
    const model = requireModel(this.config);
    if (!this.config.declaredImageInput) {
      throw new ProviderError("capability", `"${model}" is not marked as accepting images. Confirm the model supports vision, then enable image input in its settings.`);
    }
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: USER_PROMPT },
            { type: "image_url", image_url: { url: `data:${input.mimeType};base64,${input.base64}` } },
          ],
        },
      ],
    };
    if (this.config.declaredStructuredOutput) {
      body.response_format = { type: "json_schema", json_schema: { name: "sorte_classification", strict: true, schema: OUTPUT_JSON_SCHEMA } };
    }
    const data = await requestJson<ChatCompletionResponse>(
      this.transport,
      {
        method: "POST",
        url: joinUrl(this.config.endpoint, "/chat/completions"),
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        timeoutMs: this.config.timeoutMs,
        auth: this.auth,
      },
      signal,
      true,
    );
    const message = data.choices?.[0]?.message;
    if (message?.refusal) throw new ProviderError("invalid-response", `Model refused: ${message.refusal.slice(0, 200)}`, { dataSent: true });
    if (typeof message?.content !== "string") throw new ProviderError("invalid-response", "No message content in response.", { dataSent: true });
    return { output: parseModelOutput(message.content), model };
  }
}
