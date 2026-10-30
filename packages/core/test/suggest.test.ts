import { describe, expect, it } from "vitest";
import { pickDefaultModel, usableForPhotos, type ModelInfo } from "../src";

const list = (...ids: string[]): ModelInfo[] => ids.map((id) => ({ id, name: id, imageInput: null }));

describe("pickDefaultModel", () => {
  it("prefers the newest stable flash model and skips lite, image and preview variants", () => {
    expect(pickDefaultModel(list("gemini-1.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite", "gemini-2.5-flash-image", "gemini-3.0-flash-preview", "gemini-2.5-flash", "text-embedding-004"))).toBe("gemini-2.5-flash");
  });

  it("prefers the undated OpenAI alias and ignores audio, search and reasoning models", () => {
    expect(pickDefaultModel(list("gpt-4o-mini-2024-07-18", "gpt-4o-mini", "gpt-4o-mini-tts", "gpt-4o-mini-search-preview", "o3-mini", "gpt-3.5-turbo", "gpt-4o", "whisper-1"))).toBe("gpt-4o-mini");
  });

  it("reads Anthropic versions in either naming order and does not mistake dates for versions", () => {
    expect(pickDefaultModel(list("claude-3-haiku-20240307", "claude-3-5-haiku-20241022", "claude-haiku-4-5-20251001", "claude-sonnet-4-5-20250929"))).toBe("claude-haiku-4-5-20251001");
  });

  it("falls back to any usable model when no fast tier is listed", () => {
    expect(pickDefaultModel(list("gpt-4o", "gpt-4.1"))).toBe("gpt-4.1");
  });

  it("returns null rather than inventing a model", () => {
    expect(pickDefaultModel([])).toBeNull();
    expect(pickDefaultModel(list("whisper-1", "text-embedding-3-small"))).toBeNull();
  });

  it("drops models known to have no image input", () => {
    expect(usableForPhotos([{ id: "gpt-x-mini", name: "x", imageInput: false }])).toEqual([]);
  });
});
