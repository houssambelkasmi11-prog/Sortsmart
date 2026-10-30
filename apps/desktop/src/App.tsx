import { Insignia, StatusPill, Wordmark } from "@sorte/ui";
import { motionReduced } from "@sorte/ui";
import { useEffect, useRef, useState } from "react";
import { isDesktop } from "./platform";
import { UpdateBanner } from "./components/UpdateBanner";
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

  // Screen changes: quick exit, then the new screen enters in the direction of travel.
  const [shown, setShown] = useState(screen);
  const [leaving, setLeaving] = useState(false);
  const [dir, setDir] = useState<"up" | "down">("up");
  const contentRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (screen === shown) return;
    const index = (s: Screen) => NAV.findIndex((n) => n.id === s);
    setDir(index(screen) > index(shown) ? "up" : "down");
    if (motionReduced()) {
      setShown(screen);
      return;
    }
    setLeaving(true);
    const t = setTimeout(() => {
      setShown(screen);
      setLeaving(false);
      contentRef.current?.scrollTo(0, 0);
    }, 130);
    return () => clearTimeout(t);
  }, [screen, shown]);

  // Cards and chutes pick up a soft highlight under the pointer.
  useEffect(() => {
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = (e.target as Element | null)?.closest?.<HTMLElement>(".card, .chute");
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  const [splash, setSplash] = useState(true);

  if (!ready) return <div className="boot" aria-busy="true" />;

  return (
    <div className="shell" data-mode={settings.mode}>
      {splash && (
        <div className="splash" aria-hidden onAnimationEnd={(e) => e.target === e.currentTarget && setSplash(false)}>
          <span className="splash__ring" />
          <span className="splash__core" />
        </div>
      )}
      <aside className="rail" aria-label="Main navigation">
        <div className="rail__brand" title="SORTÉ">
          <Insignia size={22} />
        </div>
        <nav className="rail__nav" style={{ "--idx": Math.max(0, NAV.findIndex((n) => n.id === screen)) } as React.CSSProperties}>
          <span className="rail__pill" aria-hidden />
          {NAV.map((n) => (
            <button key={n.id} className="rail__item" aria-current={screen === n.id ? "page" : undefined} onClick={() => go(n.id)} aria-label={n.label}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={n.icon} />
              </svg>
              <span className="rail__tip" aria-hidden>
                {n.label}
              </span>
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
          <h1 className="topbar__title" key={shown}>
            {NAV.find((n) => n.id === shown)?.label}
          </h1>
          <Wordmark size={11} />
          <button className="topbar__mode" onClick={() => go("settings")} title={mode.description} aria-label={`AI mode: ${mode.label}. ${mode.description}`}>
            <StatusPill tone={mode.tone}>
              {mode.label}
              {settings.mode === "demo" ? " · simulated" : active ? ` · ${active.config.model || "no model"}` : " · not configured"}
            </StatusPill>
          </button>
        </header>
        <UpdateBanner />
        {notices.map((n) => (
          <div key={n} className="banner banner--amber" role="status">
            <span>{n}</span>
            <button className="s-btn s-btn--ghost s-btn--sm" onClick={() => dismissNotice(n)}>
              Dismiss
            </button>
          </div>
        ))}
        <main className="content" id="content" ref={contentRef}>
          <div className="screen" key={shown} data-dir={dir} data-leaving={leaving}>
            {shown === "overview" && <Overview />}
            {shown === "sort" && <Sort />}
            {shown === "providers" && <Providers />}
            {shown === "local" && <LocalModels />}
            {shown === "devices" && <Devices />}
            {shown === "history" && <History />}
            {shown === "settings" && <Settings />}
          </div>
        </main>
      </div>
    </div>
  );
}
