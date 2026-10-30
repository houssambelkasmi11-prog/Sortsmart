import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { isDesktop } from ".";

/**
 * Signed updates from GitHub Releases (see tauri.conf.json → plugins.updater).
 * The Rust plugin downloads and verifies the signature against the bundled
 * public key; an update that doesn't verify is never installed.
 */
export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "current"; checkedAt: Date }
  | { kind: "available"; update: Update }
  | { kind: "downloading"; version: string; received: number; total: number | null }
  | { kind: "ready"; update: Update }
  | { kind: "error"; message: string };

export const updatesSupported = isDesktop;

export async function appVersion(): Promise<string> {
  return isDesktop ? getVersion() : "dev";
}

export async function checkForUpdate(timeoutMs = 15_000): Promise<Update | null> {
  if (!isDesktop) return null;
  return check({ timeout: timeoutMs });
}

export async function downloadUpdate(update: Update, onProgress: (received: number, total: number | null) => void): Promise<void> {
  let total: number | null = null;
  let received = 0;
  await update.download((e) => {
    if (e.event === "Started") total = e.data.contentLength ?? null;
    if (e.event === "Progress") received += e.data.chunkLength;
    onProgress(received, total);
  });
}

/** Installs a downloaded update (its signature was verified on download) and restarts. */
export async function installAndRestart(update: Update): Promise<void> {
  await update.install();
  await relaunch();
}

export function describeUpdateError(err: unknown): string {
  const msg = String((err as Error)?.message ?? err);
  if (/signature/i.test(msg)) return "Update rejected: its signature didn't verify.";
  if (/404|not found/i.test(msg)) return "No releases published yet.";
  if (/network|connect|dns|timed out|timeout/i.test(msg)) return "Couldn't reach the update server.";
  return "Couldn't check for updates.";
}
