import { ProviderError, createFetchTransport, prepareImage, type HttpRequest, type HttpResponse, type HttpTransport, type ImageInput } from "@sorte/core";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * Platform boundary. In SORTÉ Desktop, privileged work (keychain, network
 * with secrets, file storage) runs in Rust. In a plain browser (vite dev
 * without Tauri) the same UI runs with reduced capabilities: no secrets,
 * loopback-only network, localStorage persistence.
 */
export const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// ───────── HTTP ─────────

interface RustHttpError {
  kind: "config" | "timeout" | "network" | "aborted";
  message: string;
}

function tauriTransport(): HttpTransport {
  return {
    name: "tauri",
    supportsSecrets: true,
    async request(req: HttpRequest, signal?: AbortSignal): Promise<HttpResponse> {
      if (signal?.aborted) throw new ProviderError("aborted", "Request cancelled.");
      const id = crypto.randomUUID();
      const onAbort = () => void invoke("http_cancel", { id }).catch(() => {});
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        return await invoke<HttpResponse>("http_request", {
          req: { id, method: req.method, url: req.url, headers: req.headers ?? {}, body: req.body ?? null, timeoutMs: req.timeoutMs, auth: req.auth ?? null },
        });
      } catch (err) {
        const e = (typeof err === "object" && err ? err : { kind: "network", message: String(err) }) as RustHttpError;
        throw new ProviderError(e.kind, e.message);
      } finally {
        signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}

export const transport: HttpTransport = isDesktop ? tauriTransport() : createFetchTransport();

// ───────── Secrets (OS credential store, via Rust) ─────────

export const secretsAvailable = isDesktop;

/** Opens a page in the default browser. The allowed hosts are listed in capabilities/default.json. */
export async function openExternal(url: string): Promise<void> {
  if (isDesktop) await openUrl(url);
  else window.open(url, "_blank", "noopener");
}

/** Store a key bound to the endpoint's host. Returns only the last 4 characters for display. */
export async function saveSecret(providerId: string, secret: string, endpoint: string): Promise<string> {
  if (!isDesktop) throw new Error("Secure key storage is only available in SORTÉ Desktop.");
  return invoke<string>("secret_set", { providerId, secret, endpoint });
}

export async function deleteSecret(providerId: string): Promise<void> {
  if (!isDesktop) return;
  await invoke("secret_delete", { providerId });
}

export async function hasSecret(providerId: string): Promise<boolean> {
  if (!isDesktop) return false;
  return invoke<boolean>("secret_exists", { providerId });
}

// ───────── Storage ─────────

export type StoreName = "settings" | "history";

export async function readStore(name: StoreName): Promise<string | null> {
  if (isDesktop) return invoke<string | null>("store_read", { name });
  try {
    return localStorage.getItem(`sorte.${name}`);
  } catch {
    return null;
  }
}

export async function writeStore(name: StoreName, contents: string): Promise<void> {
  if (isDesktop) return invoke("store_write", { name, contents });
  try {
    localStorage.setItem(`sorte.${name}`, contents);
  } catch {
    /* storage unavailable; settings stay in memory */
  }
}

export async function storeLocation(): Promise<string> {
  return isDesktop ? invoke<string>("store_location") : "Browser localStorage (development mode)";
}

// ───────── Images ─────────

/** Downscale on-device to the configured max edge and re-encode as JPEG before hashing/sending. */
export async function prepareImageSource(source: Blob, maxEdge: number): Promise<{ input: ImageInput; previewUrl: string }> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image."))), "image/jpeg", 0.88));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { input: await prepareImage(bytes, "image/jpeg"), previewUrl: URL.createObjectURL(blob) };
}
