import { Insignia, StatusPill, Wordmark } from "@sorte/ui";
import { useEffect } from "react";
import { isDesktop } from "./platform";
import { Devices } from "./screens/Devices";
import { History } from "./screens/History";
import { LocalModels } from "./screens/LocalModels";
import { Overview } from "./screens/Overview";
import { Providers } from "./screens/Providers";
import { Settings } from "./screens/Settings";
import { Sort } from "./screens/Sort";
import { MODE_META, useApp, type Screen } from "./state/store";

const NAV: { id: Screen; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "M4 5h7v6H4zM13 5h7v3h-7zM13 10h7v9h-7zM4 13h7v6H4z" },
  { id: "sort", label: "Sort", icon: "M12 4v16M5 9l7-5 7 5M6 20h12" },
  { id: "providers", label: "AI Providers", icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" },
  { id: "local", label: "Local Models", icon: "M5 6h14v9H5zM9 19h6M12 15v4" },
  { id: "devices", label: "Devices", icon: "M7 4h10l1 3v13H6V7zM6 7h12M10 11h4" },
  { id: "history", label: "History", icon: "M12 7v5l3 2M3.5 12a8.5 8.5 0 1 0 2.5-6M3 4v4h4" },
  { id: "settings", label: "Settings", icon: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4" },
];

export function App() {
  const { screen, go, settings, providers, ready, notices, dismissNotice } = useApp();
  const mode = MODE_META[settings.mode];
  const activeId = settings.mode === "cloud" ? settings.cloudProviderId : settings.mode === "demo" ? "demo" : settings.localProviderId;
  const active = activeId ? providers.get(activeId) : undefined;

  useEffect(() => {
    const r = settings.reducedMotion;
    if (r === "system") delete document.documentElement.dataset.motion;
    else document.documentElement.dataset.motion = r === "on" ? "reduced" : "full";
  }, [settings.reducedMotion]);

  if (!ready) return <div className="boot" aria-busy="true" />;

  return (
    <div className="shell">
      <aside className="rail" aria-label="Main navigation">
        <div className="rail__brand" title="SORTÉ">
          <Insignia size={22} />
        </div>
        <nav className="rail__nav">
          {NAV.map((n) => (
            <button key={n.id} className="rail__item" aria-current={screen === n.id ? "page" : undefined} onClick={() => go(n.id)} title={n.label} aria-label={n.label}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={n.icon} />
              </svg>
            </button>
          ))}
        </nav>
        <div className="rail__foot">
          {!isDesktop && (
            <span className="led" data-state="dev" title="Browser dev mode: no keychain, localhost-only network" />
          )}
        </div>
      </aside>

      <div className="main">
        <header className="topbar" data-tauri-drag-region>
          <h1 className="topbar__title">{NAV.find((n) => n.id === screen)?.label}</h1>
          <Wordmark size={11} />
          <button className="topbar__mode" onClick={() => go("settings")} title={mode.description} aria-label={`AI mode: ${mode.label}. ${mode.description}`}>
            <StatusPill tone={mode.tone}>
              {mode.label}
              {settings.mode === "demo" ? " · simulated" : active ? ` · ${active.config.model || "no model"}` : " · not configured"}
            </StatusPill>
          </button>
        </header>
        {notices.map((n) => (
          <div key={n} className="banner banner--amber" role="status">
            <span>{n}</span>
            <button className="s-btn s-btn--ghost s-btn--sm" onClick={() => dismissNotice(n)}>
              Dismiss
            </button>
          </div>
        ))}
        <main className="content" id="content">
          {screen === "overview" && <Overview />}
          {screen === "sort" && <Sort />}
          {screen === "providers" && <Providers />}
          {screen === "local" && <LocalModels />}
          {screen === "devices" && <Devices />}
          {screen === "history" && <History />}
          {screen === "settings" && <Settings />}
        </main>
      </div>
    </div>
  );
}
