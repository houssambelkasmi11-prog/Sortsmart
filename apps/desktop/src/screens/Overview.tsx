import { CATEGORIES, type CategoryId } from "@sorte/core";
import { CountUp, categoryColor } from "@sorte/ui";
import { Chutes } from "../components/Chutes";
import { MODE_META, useApp } from "../state/store";

export function Overview() {
  const { settings, engine, history, deviceStatus, go } = useApp();
  const mode = MODE_META[settings.mode];
  const { providers: plan, problems } = engine.plan(settings);
  const backend = plan[0];

  // Prefer real device fill levels; otherwise show the history distribution.
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c.id, history.filter((r) => (r.userCategory ?? r.result.category) === c.id).length])) as Record<CategoryId, number>;
  const max = Math.max(1, ...Object.values(counts));
  const levels = deviceStatus?.fillLevels ?? Object.fromEntries(CATEGORIES.map((c) => [c.id, counts[c.id] / max]));
  const values = deviceStatus?.fillLevels
    ? Object.fromEntries(CATEGORIES.map((c) => [c.id, `${Math.round((deviceStatus.fillLevels?.[c.id] ?? 0) * 100)}%`]))
    : settings.history.enabled
      ? counts
      : undefined;

  return (
    <div className="overview">
      <div className="hud">
        <button className="orb" data-mode={settings.mode} onClick={() => go("settings")} title={mode.description}>
          <span className="orb__ring" />
          <span className="orb__core" />
        </button>
        <div className="hud__text">
          <p className="hud__mode">{mode.label}</p>
          <p className="hud__sub">{settings.mode === "demo" ? "simulated" : backend ? backend.config.model || "no model" : "not configured"}</p>
        </div>

        <div className="hud__stats">
          <Stat n={history.length} label="sorted" />
          <Stat n={history.filter((r) => r.result.requiresReview).length} label="reviewed" />
          <Stat n={engine.cloudRequestCount} label="cloud calls" />
          <button className="hud__device" onClick={() => go("devices")} data-on={!!deviceStatus}>
            <span className="led" data-state={deviceStatus?.state ?? "off"} />
            {deviceStatus ? `${deviceStatus.simulated ? "Simulator" : deviceStatus.name} · ${deviceStatus.state}` : "No bin"}
          </button>
        </div>
      </div>

      {problems.length > 0 && (
        <button className="alert" onClick={() => go("providers")}>
          {problems[0]} →
        </button>
      )}

      <Chutes levels={levels} values={values} />
      {!settings.history.enabled && !deviceStatus && (
        <button className="link center" onClick={() => go("settings")}>
          Turn on history to fill the chutes
        </button>
      )}

      {history.length > 0 && (
        <div className="trail" aria-label="Recent items">
          {history.slice(0, 40).map((r, i) => {
            const c = r.userCategory ?? r.result.category;
            return <span key={r.id} className="trail__dot" style={{ background: c ? categoryColor(c) : "transparent", "--i": i } as React.CSSProperties} data-review={!c} title={`${r.result.material} · ${new Date(r.result.timestamp).toLocaleTimeString()}`} />;
          })}
        </div>
      )}

      <button className="cta" onClick={() => go("sort")}>
        Sort an item
      </button>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="stat">
      <span className="stat__n">
        <CountUp value={n} />
      </span>
      <span className="stat__l">{label}</span>
    </div>
  );
}
