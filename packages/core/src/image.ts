import { ProviderError } from "./errors";
import { ACCEPTED_MIME, MAX_IMAGE_BYTES, type ImageInput, type ImageMime } from "./providers/types";

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

export function isAcceptedMime(mime: string): mime is ImageMime {
  return (ACCEPTED_MIME as readonly string[]).includes(mime);
}

/** Validate type and size, then hash. Resizing happens in the platform layer before this. */
export async function prepareImage(bytes: Uint8Array<ArrayBuffer>, mimeType: string): Promise<ImageInput> {
  if (!isAcceptedMime(mimeType)) throw new ProviderError("invalid-request", `Unsupported image type "${mimeType}". Use JPEG, PNG or WebP.`);
  if (bytes.byteLength === 0) throw new ProviderError("invalid-request", "The image is empty.");
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new ProviderError("invalid-request", `Image is larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`);
  return { mimeType, base64: bytesToBase64(bytes), sizeBytes: bytes.byteLength, sha256: await sha256Hex(bytes) };
}
