import { ProviderError } from "../errors";
import { OUTPUT_JSON_SCHEMA, SYSTEM_PROMPT, USER_PROMPT } from "../prompt";
import type { ProviderConfig } from "../schemas";
import { joinUrl } from "../security";
import type { HttpTransport, SecretRef } from "../transport";
import { parseModelOutput, requestJson, requireModel, testViaListModels } from "./base";
import type { AIProvider, ModelInfo, ProviderCapabilities } from "./types";

const API_VERSION = "2023-06-01";
const TOOL_NAME = "record_classification";

interface ModelsResponse {
  data?: { id: string; display_name?: string }[];
}
interface MessagesResponse {
  content?: { type: string; name?: string; input?: unknown }[];
  stop_reason?: string;
}

/**
 * Anthropic Messages API. Structured output is obtained by forcing a single
 * tool call whose input schema is the classification schema.
 */
export class AnthropicProvider implements AIProvider {
  readonly kind = "anthropic" as const;
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
    return { providerId: this.config.id, header: "x-api-key", scheme: "raw" };
  }

  private headers() {
    return { "content-type": "application/json", "anthropic-version": API_VERSION };
  }

  async capabilities(): Promise<ProviderCapabilities> {
    // Image input is documented for current Claude models; still verified by the user's model choice.
    return { imageInput: this.config.declaredImageInput, structuredOutput: true, cancellation: true };
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const data = await requestJson<ModelsResponse>(
      this.transport,
      { method: "GET", url: joinUrl(this.config.endpoint, "/v1/models?limit=100"), headers: this.headers(), timeoutMs: 10_000, auth: this.auth },
      signal,
      false,
    );
    if (!Array.isArray(data.data)) throw new ProviderError("invalid-response", "Unexpected /v1/models response.");
    return data.data.map((m) => ({ id: m.id, name: m.display_name ?? m.id, imageInput: null }));
  }

  testConnection(signal?: AbortSignal) {
    return testViaListModels(() => this.listModels(signal));
  }

  async classify(input: Parameters<AIProvider["classify"]>[0], signal?: AbortSignal) {
    const model = requireModel(this.config);
    if (!this.config.declaredImageInput) throw new ProviderError("capability", `Image input is disabled for "${model}" in provider settings.`);
    const data = await requestJson<MessagesResponse>(
      this.transport,
      {
        method: "POST",
        url: joinUrl(this.config.endpoint, "/v1/messages"),
        headers: this.headers(),
        timeoutMs: this.config.timeoutMs,
        auth: this.auth,
        body: JSON.stringify({
          model,
          max_tokens: 600,
          system: SYSTEM_PROMPT,
          tools: [{ name: TOOL_NAME, description: "Record the classification of the waste item.", input_schema: OUTPUT_JSON_SCHEMA }],
          tool_choice: { type: "tool", name: TOOL_NAME },
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: input.mimeType, data: input.base64 } },
                { type: "text", text: USER_PROMPT },
              ],
            },
          ],
        }),
      },
      signal,
      true,
    );
    const block = data.content?.find((b) => b.type === "tool_use" && b.name === TOOL_NAME);
    if (!block) throw new ProviderError("invalid-response", `No structured result (stop_reason: ${data.stop_reason ?? "unknown"}).`, { dataSent: true });
    return { output: parseModelOutput(block.input), model };
  }
}
