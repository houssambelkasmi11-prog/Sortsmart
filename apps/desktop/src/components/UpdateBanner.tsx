import { useEffect, useState } from "react";
import { describeUpdateError, installAndRestart } from "../platform/updates";
import { useApp } from "../state/store";

const RECHECK_MS = 6 * 60 * 60 * 1000;

/** Downloads happen in the background; the restart is always the user's click. */
export function UpdateBanner() {
  const { update, setUpdate, runUpdateCheck, startUpdateDownload, settings } = useApp();
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!settings.updates.autoCheck) return;
    void runUpdateCheck({ silent: true });
    const t = setInterval(() => void runUpdateCheck({ silent: true }), RECHECK_MS);
    return () => clearInterval(t);
  }, [settings.updates.autoCheck, runUpdateCheck]);

  if (update.kind === "available") {
    const u = update.update;
    return (
      <div className="update" data-glass="frost" role="status">
        <span className="update__dot" />
        <span>
          SORTÉ <strong>{u.version}</strong> is available
        </span>
        <button className="update__btn" onClick={() => void startUpdateDownload(u)}>
          Download
        </button>
      </div>
    );
  }
  if (update.kind === "downloading") {
    const pct = update.total ? Math.min(100, Math.round((update.received / update.total) * 100)) : null;
    return (
      <div className="update" data-glass="frost" role="status">
        <span className="update__dot update__dot--busy" />
        <span>Downloading {update.version}</span>
        <span className="update__bar" data-indeterminate={pct === null}>
          <span style={{ width: pct === null ? undefined : `${pct}%` }} />
        </span>
        {pct !== null && <span className="s-mono">{pct}%</span>}
      </div>
    );
  }
  if (update.kind === "ready") {
    const u = update.update;
    return (
      <div className="update" data-glass="frost" role="status">
        <span className="update__dot" />
        <span>
          SORTÉ <strong>{u.version}</strong> is ready
        </span>
        {u.body && (
          <span className="update__notes" title={u.body}>
            {u.body.split("\n")[0]}
          </span>
        )}
        <button
          className="update__btn"
          disabled={installing}
          onClick={async () => {
            setInstalling(true);
            try {
              await installAndRestart(u);
            } catch (e) {
              setInstalling(false);
              setUpdate({ kind: "error", message: describeUpdateError(e) });
            }
          }}
        >
          {installing ? "Installing…" : "Restart to update"}
        </button>
      </div>
    );
  }
  return null;
}
