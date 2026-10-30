import { RELEASES_URL, detectPlatform, formatSize, useRelease, type Asset } from "../useRelease";

/** Real builds only: reads the newest published GitHub release at runtime. */
export function DownloadButtons() {
  const state = useRelease();
  if (state.kind === "loading") return <div className="dl dl--wait" />;
  if (state.kind === "none") return <p className="dl-note">Build not yet published</p>;
  if (state.kind === "error") {
    return (
      <a className="btn btn--solid btn--lg" href={RELEASES_URL}>
        All builds on GitHub
      </a>
    );
  }
  const { release } = state;
  const entries: { id: "mac" | "windows"; label: string; asset: Asset | null }[] = [
    { id: "mac", label: "Download for Mac", asset: release.mac },
    { id: "windows", label: "Download for Windows", asset: release.windows },
  ];
  // The visitor's own platform comes first, and solid.
  const mine = detectPlatform();
  const sorted = [...entries].sort((a, b) => Number(b.id === mine) - Number(a.id === mine));
  return (
    <div className="dl">
      <div className="dl__row">
        {sorted.map(
          (e, i) =>
            e.asset && (
              <a key={e.id} className={`btn btn--lg ${i === 0 ? "btn--solid" : ""}`} data-glass={i === 0 ? undefined : "clear"} href={e.asset.url}>
                {e.label}
                <small>{formatSize(e.asset.sizeBytes)}</small>
              </a>
            ),
        )}
      </div>
      <p className="dl-note">Version {release.version}</p>
    </div>
  );
}
