import { useEffect, useState } from "react";

const REPO = "houssambelkasmi11-prog/Sortsmart";
export const RELEASES_URL = `https://github.com/${REPO}/releases`;

export interface Asset {
  url: string;
  sizeBytes: number;
  sha256: string | null;
}
export interface Release {
  version: string;
  date: string;
  mac: Asset | null;
  windows: Asset | null;
}
export type ReleaseState = { kind: "loading" } | { kind: "ready"; release: Release } | { kind: "none" } | { kind: "error" };

interface ApiAsset {
  name: string;
  size: number;
  browser_download_url: string;
  digest?: string | null;
}

let cached: Promise<ReleaseState> | null = null;

function load(): Promise<ReleaseState> {
  cached ??= fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { accept: "application/vnd.github+json" } })
    .then(async (res): Promise<ReleaseState> => {
      if (res.status === 404) return { kind: "none" };
      if (!res.ok) return { kind: "error" };
      const data = (await res.json()) as { tag_name: string; published_at: string; assets: ApiAsset[] };
      const pick = (ext: string): Asset | null => {
        const a = data.assets.find((x) => x.name.endsWith(ext));
        return a ? { url: a.browser_download_url, sizeBytes: a.size, sha256: a.digest?.replace(/^sha256:/, "") ?? null } : null;
      };
      return { kind: "ready", release: { version: data.tag_name.replace(/^v/, ""), date: data.published_at.slice(0, 10), mac: pick(".dmg"), windows: pick("-setup.exe") } };
    })
    .catch((): ReleaseState => ({ kind: "error" }));
  return cached;
}

/** The newest published build, read live from GitHub, so links can't point at nothing. */
export function useRelease() {
  const [state, setState] = useState<ReleaseState>({ kind: "loading" });
  useEffect(() => {
    let alive = true;
    void load().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

export const formatSize = (n: number) => `${(n / 1e6).toFixed(1)} MB`;

export function detectPlatform(): "mac" | "windows" | "other" {
  const ua = navigator.userAgent;
  if (/Mac/.test(ua) && !/iPhone|iPad/.test(ua)) return "mac";
  if (/Windows/.test(ua)) return "windows";
  return "other";
}
