import { useEffect, useState } from "react";
import { Dialog } from "./common";
import { describeUpdateError, installAndRestart } from "../platform/updates";
import { useApp } from "../state/store";

const RECHECK_MS = 6 * 60 * 60 * 1000;

/** Corner status: shows the launch check, and an update the user postponed. */
export function UpdateBanner() {
  const { update, runUpdateCheck, settings, updateSheetOpen } = useApp();

  useEffect(() => {
    if (!settings.updates.autoCheck) return;
    const t = setInterval(() => void runUpdateCheck({ silent: true }), RECHECK_MS);
    return () => clearInterval(t);
  }, [settings.updates.autoCheck, runUpdateCheck]);

  if (update.kind === "checking") {
    return (
      <div className="update update--slim" data-glass="clear" role="status">
        <span className="update__dot update__dot--busy" />
        <span>Checking for updates</span>
      </div>
    );
  }
  const later = (update.kind === "available" || update.kind === "downloading" || update.kind === "ready") && !updateSheetOpen;
  if (!later) return null;
  const version = update.kind === "downloading" ? update.version : update.update.version;
  return (
    <button className="update update--btn" data-glass="frost" onClick={() => void runUpdateCheck()}>
      <span className="update__dot" />
      <span>
        Update <strong>{version}</strong> {update.kind === "ready" ? "ready" : update.kind === "downloading" ? "downloading" : "available"}
      </span>
    </button>
  );
}

/** Tells the user a new version exists. Downloads by itself; restarting is their click. */
export function UpdateSheet() {
  const { update, setUpdate, startUpdateDownload, updateSheetOpen, closeUpdateSheet } = useApp();
  const [installing, setInstalling] = useState(false);
  const live = update.kind === "available" || update.kind === "downloading" || update.kind === "ready";
  const open = updateSheetOpen && live;
  const version = update.kind === "downloading" ? update.version : live ? update.update.version : "";
  const notes = update.kind === "available" || update.kind === "ready" ? update.update.body?.split("\n")[0] : undefined;
  const pct = update.kind === "downloading" && update.total ? Math.min(100, Math.round((update.received / update.total) * 100)) : null;

  return (
    <Dialog open={open} title={`SORTÉ ${version} is here`} onClose={closeUpdateSheet}>
      <div className="dialog__body">
        {notes && <p>{notes}</p>}
        {update.kind === "downloading" && (
          <div className="update__sheetbar">
            <span className="update__bar" data-indeterminate={pct === null}>
              <span style={{ width: pct === null ? undefined : `${pct}%` }} />
            </span>
            {pct !== null && <span className="s-mono">{pct}%</span>}
          </div>
        )}
      </div>
      <div className="row row--end">
        <button className="s-btn" disabled={installing} onClick={closeUpdateSheet}>
          Later
        </button>
        {update.kind === "available" ? (
          <button className="s-btn s-btn--primary" onClick={() => void startUpdateDownload(update.update)}>
            Download
          </button>
        ) : (
          <button
            className="s-btn s-btn--primary"
            disabled={update.kind !== "ready" || installing}
            onClick={async () => {
              if (update.kind !== "ready") return;
              setInstalling(true);
              try {
                await installAndRestart(update.update);
              } catch (e) {
                setInstalling(false);
                setUpdate({ kind: "error", message: describeUpdateError(e) });
              }
            }}
          >
            {installing ? "Installing…" : update.kind === "ready" ? "Restart to update" : "Downloading…"}
          </button>
        )}
      </div>
    </Dialog>
  );
}
