import { useEffect } from "react";
import { installUpdate, restartApp, describeUpdateError } from "../platform/updates";
import { useApp } from "../state/store";

const RECHECK_MS = 6 * 60 * 60 * 1000;

/** Slim top banner. Never installs on its own — the user clicks Update. */
export function UpdateBanner() {
  const { update, setUpdate, runUpdateCheck, settings } = useApp();

  useEffect(() => {
    if (!settings.updates.autoCheck) return;
    void runUpdateCheck({ silent: true });
    const t = setInterval(() => void runUpdateCheck({ silent: true }), RECHECK_MS);
    return () => clearInterval(t);
  }, [settings.updates.autoCheck, runUpdateCheck]);

  if (update.kind === "available") {
    const u = update.update;
    return (
      <div className="update" role="status">
        <span className="update__dot" />
        <span>
          SORTÉ <strong>{u.version}</strong> is available
        </span>
        {u.body && (
          <span className="update__notes" title={u.body}>
            {u.body.split("\n")[0]}
          </span>
        )}
        <button
          className="update__btn"
          onClick={async () => {
            setUpdate({ kind: "downloading", version: u.version, received: 0, total: null });
            try {
              await installUpdate(u, (received, total) => setUpdate({ kind: "downloading", version: u.version, received, total }));
              setUpdate({ kind: "ready", version: u.version });
            } catch (e) {
              setUpdate({ kind: "error", message: describeUpdateError(e) });
            }
          }}
        >
          Update
        </button>
      </div>
    );
  }
  if (update.kind === "downloading") {
    const pct = update.total ? Math.min(100, Math.round((update.received / update.total) * 100)) : null;
    return (
      <div className="update" role="status">
        <span className="update__dot update__dot--busy" />
        <span>Downloading {update.version}…</span>
        <span className="update__bar" data-indeterminate={pct === null}>
          <span style={{ width: pct === null ? undefined : `${pct}%` }} />
        </span>
        {pct !== null && <span className="s-mono">{pct}%</span>}
      </div>
    );
  }
  if (update.kind === "ready") {
    return (
      <div className="update" role="status">
        <span className="update__dot" />
        <span>{update.version} installed</span>
        <button className="update__btn" onClick={() => void restartApp()}>
          Restart now
        </button>
      </div>
    );
  }
  return null;
}
