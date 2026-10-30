import { Button } from "@sorte/ui";
import { useState } from "react";
import { CategoryTag, Dialog, Empty, LocationTag, Section } from "../components/common";
import { useApp } from "../state/store";

export function History() {
  const { settings, updateSettings, history, clearHistory } = useApp();
  const [confirming, setConfirming] = useState(false);

  if (!settings.history.enabled) {
    return (
      <Section title="History">
        <Empty title="History is off">
          <p>Results and an image hash. Never the image.</p>
          <Button variant="primary" onClick={() => updateSettings((s) => ({ ...s, history: { ...s.history, enabled: true } }))}>
            Enable history
          </Button>
        </Empty>
      </Section>
    );
  }

  const corrected = history.filter((r) => r.userCategory && r.userCategory !== r.result.category).length;

  return (
    <Section
      title={`${history.length} records · kept ${settings.history.retentionDays} days`}
      aside={
        <Button size="sm" variant="danger" disabled={history.length === 0} onClick={() => setConfirming(true)}>
          Clear history
        </Button>
      }
    >
      {history.length === 0 ? (
        <Empty title="No records yet" />
      ) : (
        <>
          <p className="s-hint">{corrected} corrected by you</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Model said</th>
                  <th>Confirmed</th>
                  <th>Confidence</th>
                  <th>Source</th>
                  <th>Model</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id}>
                    <td className="muted nowrap">{new Date(r.result.timestamp).toLocaleString()}</td>
                    <td>
                      <CategoryTag id={r.result.category} />
                    </td>
                    <td>{r.userCategory ? <CategoryTag id={r.userCategory} /> : <span className="muted">—</span>}</td>
                    <td className="s-mono">{Math.round(r.result.confidence * 100)}%</td>
                    <td>
                      <LocationTag r={r.result} />
                    </td>
                    <td className="muted truncate">{r.result.model}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <Dialog open={confirming} title="Clear all history?" onClose={() => setConfirming(false)}>
        <p className="muted">This permanently removes {history.length} records from this device.</p>
        <div className="row row--end">
          <Button onClick={() => setConfirming(false)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => {
              clearHistory();
              setConfirming(false);
            }}
          >
            Clear history
          </Button>
        </div>
      </Dialog>
    </Section>
  );
}
