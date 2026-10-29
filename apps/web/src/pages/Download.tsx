import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../App";
import { ARCH_LABEL, FORMAT_LABEL, formatBytes, isDownloadable, manifest, type Release } from "../releases/releases";

const PLATFORMS = {
  macos: {
    name: "macOS",
    install: [
      "Open the downloaded .dmg.",
      "Drag SORTÉ into Applications.",
      "Launch SORTÉ from Applications. Signed and notarised builds open without warnings.",
    ],
    unsigned: "Unsigned development builds are blocked by Gatekeeper. Build from source, or right-click → Open on a build you produced yourself.",
  },
  windows: {
    name: "Windows",
    install: ["Run the installer (.exe).", "Follow the setup steps. WebView2 is installed automatically if missing.", "Launch SORTÉ from the Start menu."],
    unsigned: "Unsigned installers trigger SmartScreen. Published releases will be Authenticode-signed.",
  },
} as const;

export function Download() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="Download center"
        title={
          <>
            SORTÉ <em>Desktop</em>
          </>
        }
        lede="Local AI controls, cloud providers with keychain-backed keys, classification history and device settings — for macOS and Windows."
      />

      <div className="dl-grid">
        {(["macos", "windows"] as const).map((p) => (
          <PlatformCard key={p} platform={p} releases={manifest.releases.filter((r) => r.platform === p)} />
        ))}
      </div>

      <section className="section section--tight section--split" aria-labelledby="notes-title">
        <div className="section__head">
          <p className="s-eyebrow">Release notes · {manifest.channel}</p>
          <h2 id="notes-title" className="s-display section__title">What's in 0.1</h2>
        </div>
        <ul className="notes">
          {manifest.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </section>

      <section className="section section--tight section--split" aria-labelledby="source-title">
        <div className="section__head">
          <p className="s-eyebrow">Build from source</p>
          <h2 id="source-title" className="s-display section__title">Available today.</h2>
        </div>
        <div>
          <pre className="code">
            <code>{`npm install\nnpm run tauri dev       # run the desktop app\nnpm run tauri build     # produce installers for this OS`}</code>
          </pre>
          <p className="muted">
            Requires Node 20+, Rust stable, and platform toolchains. <Link to="/docs#development">Development setup →</Link>
          </p>
        </div>
      </section>
    </div>
  );
}

function PlatformCard({ platform, releases }: { platform: "macos" | "windows"; releases: Release[] }) {
  const info = PLATFORMS[platform];
  const first = releases[0];
  return (
    <article className="dl-card s-panel" aria-labelledby={`dl-${platform}`}>
      <div className="dl-card__head">
        <PlatformMark platform={platform} />
        <div>
          <h2 id={`dl-${platform}`}>{info.name}</h2>
          {first && <p className="muted">Version {first.version}</p>}
        </div>
      </div>

      {releases.map((r) => (
        <ReleaseRow key={`${r.arch}-${r.format}`} r={r} />
      ))}

      <dl className="dl-meta">
        <div>
          <dt>Requires</dt>
          <dd>{first?.minOs ?? "—"}</dd>
        </div>
        <div>
          <dt>Architecture</dt>
          <dd>{releases.map((r) => ARCH_LABEL[r.arch]).join(", ")}</dd>
        </div>
        <div>
          <dt>Format</dt>
          <dd>{releases.map((r) => FORMAT_LABEL[r.format]).join(", ")}</dd>
        </div>
        <div>
          <dt>Signature</dt>
          <dd>
            {first?.signed ? "Signed" : "Not signed"}
            {platform === "macos" && (first?.notarized ? " · Notarised" : " · Not notarised")}
          </dd>
        </div>
      </dl>

      <details className="dl-install">
        <summary>Installation</summary>
        <ol>
          {info.install.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        {!first?.signed && <p className="amber">{info.unsigned}</p>}
      </details>
    </article>
  );
}

function ReleaseRow({ r }: { r: Release }) {
  const [copied, setCopied] = useState(false);
  if (!isDownloadable(r)) {
    return (
      <div className="dl-row dl-row--pending">
        <div>
          <strong>{ARCH_LABEL[r.arch]}</strong>
          <span className="muted">{FORMAT_LABEL[r.format]}</span>
        </div>
        <span className="s-pill" data-tone="amber">
          <span className="s-pill__dot" />
          Build not yet published
        </span>
      </div>
    );
  }
  return (
    <div className="dl-row">
      <div>
        <strong>{ARCH_LABEL[r.arch]}</strong>
        <span className="muted">
          {FORMAT_LABEL[r.format]}
          {r.sizeBytes ? ` · ${formatBytes(r.sizeBytes)}` : ""}
          {r.releaseDate ? ` · ${r.releaseDate}` : ""}
        </span>
        <button
          className="dl-sha s-mono"
          onClick={() => navigator.clipboard.writeText(r.sha256).then(() => setCopied(true))}
          title="Copy SHA-256 checksum"
        >
          SHA-256 {r.sha256.slice(0, 16)}… {copied ? "copied" : "copy"}
        </button>
      </div>
      <a className="s-btn s-btn--primary" href={r.url} download>
        Download
      </a>
    </div>
  );
}

/** Original geometric platform marks (not vendor logos). */
function PlatformMark({ platform }: { platform: "macos" | "windows" }) {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden className="dl-mark">
      <rect x="0.5" y="0.5" width="39" height="39" rx="10" fill="none" stroke="var(--line-strong)" />
      {platform === "macos" ? (
        <g fill="none" stroke="var(--ivory)" strokeWidth="1.3">
          <rect x="9" y="11" width="22" height="15" rx="2" />
          <path d="M16 30h8M20 26v4" />
        </g>
      ) : (
        <g fill="none" stroke="var(--ivory)" strokeWidth="1.3">
          <rect x="10" y="10" width="9" height="9" rx="1" />
          <rect x="21" y="10" width="9" height="9" rx="1" />
          <rect x="10" y="21" width="9" height="9" rx="1" />
          <rect x="21" y="21" width="9" height="9" rx="1" />
        </g>
      )}
    </svg>
  );
}
