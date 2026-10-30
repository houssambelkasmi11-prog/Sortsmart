import { useEffect, useState } from "react";
import { DownloadButtons } from "../components/Download";
import { field } from "../gl/field";
import { RELEASES_URL, useRelease } from "../useRelease";

export function Download() {
  const state = useRelease();
  const [copied, setCopied] = useState<string | null>(null);
  const release = state.kind === "ready" ? state.release : null;
  useEffect(() => {
    field.setMood(0.1, 0.55);
    return () => field.setMood(0, 1);
  }, []);
  const copy = (id: string, value: string) =>
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    });

  return (
    <section className="get">
      <h1>Get Sorte.</h1>
      <DownloadButtons />
      {release && (
        <dl className="get__meta" data-glass="frost">
          {release.mac && (
            <div>
              <dt>Mac</dt>
              <dd>Apple silicon · macOS 11+</dd>
              <dd className="get__hint">Not notarised yet. If macOS blocks it: System Settings → Privacy &amp; Security → Open Anyway.</dd>
              {release.mac.sha256 && (
                <dd>
                  <button className="sha" onClick={() => copy("mac", release.mac!.sha256!)}>
                    SHA-256 {release.mac.sha256.slice(0, 12)}… {copied === "mac" ? "copied" : "copy"}
                  </button>
                </dd>
              )}
            </div>
          )}
          {release.windows && (
            <div>
              <dt>Windows</dt>
              <dd>x64 · Windows 10+</dd>
              <dd className="get__hint">Not code-signed yet. If SmartScreen appears: More info → Run anyway.</dd>
              {release.windows.sha256 && (
                <dd>
                  <button className="sha" onClick={() => copy("win", release.windows!.sha256!)}>
                    SHA-256 {release.windows.sha256.slice(0, 12)}… {copied === "win" ? "copied" : "copy"}
                  </button>
                </dd>
              )}
            </div>
          )}
        </dl>
      )}
      <a className="get__all" href={RELEASES_URL}>
        All versions
      </a>
    </section>
  );
}
