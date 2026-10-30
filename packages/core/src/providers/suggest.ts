import type { ModelInfo } from "./types";

/** Models a provider lists that can't look at a photo and answer in JSON. */
const NOT_FOR_PHOTOS =
  /embed|whisper|tts|audio|speech|image|dall-?e|sora|veo|moderation|realtime|transcribe|search|codex|instruct|babbage|davinci|gpt-3|computer-use|robotics|guard|aqa|learnlm|live|native|deep-research|gemma|nano|chatgpt|^o\d/i;
/** The quick, inexpensive tier of each provider: right for many small photos. "-mini", because "gemini" contains "mini". */
const FAST_TIER = /flash|-mini|haiku/i;
const UNSTABLE = /preview|exp|beta|alpha/i;

const DATE = /\d{4}-\d{2}-\d{2}|\d{8}/;

function version(id: string): number {
  const m = /(\d{1,2})(?:[.-](\d{1,2})(?!\d))?/.exec(id.replace(DATE, ""));
  return m ? Number(m[1]) * 100 + Number(m[2] ?? 0) : 0;
}

/** The best balance of speed and accuracy found so far in testing on Ollama. */
export const RECOMMENDED_LOCAL_MODEL = "gemma3:4b";

/** Picks the recommended model if it's installed; otherwise leaves the order alone. */
export function pickLocalModel(models: readonly string[]): string | null {
  return models.find((m) => m === RECOMMENDED_LOCAL_MODEL) ?? models.find((m) => /^gemma3(:latest)?$/.test(m)) ?? models[0] ?? null;
}

export function usableForPhotos(models: readonly ModelInfo[]): ModelInfo[] {
  return models.filter((m) => m.imageInput !== false && !NOT_FOR_PHOTOS.test(m.id));
}

/** Picks a starting model from what the account actually lists; never invents a name. */
export function pickDefaultModel(models: readonly ModelInfo[]): string | null {
  const rank = (id: string): number[] => [FAST_TIER.test(id) && !/lite/i.test(id) ? 1 : 0, UNSTABLE.test(id) ? 0 : 1, version(id), DATE.test(id) ? 0 : 1, -id.length];
  const sorted = usableForPhotos(models)
    .map((m) => ({ id: m.id, rank: rank(m.id) }))
    .sort((a, b) => {
      for (let i = 0; i < a.rank.length; i++) if (a.rank[i] !== b.rank[i]) return b.rank[i]! - a.rank[i]!;
      return 0;
    });
  return sorted[0]?.id ?? null;
}
