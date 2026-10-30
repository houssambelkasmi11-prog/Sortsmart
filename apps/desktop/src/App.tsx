import { StatusPill } from "@sorte/ui";
import { motionReduced } from "@sorte/ui";
import { useEffect, useRef, useState } from "react";
import { isDesktop } from "./platform";
import { UpdateBanner, UpdateSheet } from "./components/UpdateBanner";
import { Devices } from "./screens/Devices";
import { History } from "./screens/History";
import { LocalModels } from "./screens/LocalModels";
import { Overview } from "./screens/Overview";
import { Providers } from "./screens/Providers";
import { Settings } from "./screens/Settings";
import { Live } from "./screens/Live";
import { GlassBackground } from "./gl/GlassBackground";
import { MODE_META, useApp, type Screen } from "./state/store";

const NAV: { id: Screen; label: string; icon: string }[] = [
  { id: "live", label: "Live", icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 3l2.6 6.3M21 12l-6.7.9M12 21l-2.6-6.3M3 12l6.7-.9" },
  { id: "overview", label: "Insights", icon: "M5 20V11M12 20V5M19 20v-6" },
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

  const [splash, setSplash] = useState(true);

  if (!ready) return <div className="boot" aria-busy="true" />;

  return (
    <>
      <GlassBackground mode={settings.mode} motionSetting={settings.reducedMotion} />
      <div className="app">
        {splash && (
          <div className="splash" aria-hidden onAnimationEnd={(e) => e.target === e.currentTarget && setSplash(false)}>
            <span className="splash__ring" />
            <span className="splash__core" />
          </div>
        )}
        <div className="dragbar" data-tauri-drag-region />
        <nav className="nav" data-glass="frost" aria-label="Main navigation" style={{ "--idx": Math.max(0, NAV.findIndex((n) => n.id === screen)) } as React.CSSProperties}>
          <span className="nav__pill" aria-hidden />
          {NAV.map((n) => (
            <button key={n.id} className="nav__item" aria-current={screen === n.id ? "page" : undefined} onClick={() => go(n.id)} aria-label={n.label}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={n.icon} />
              </svg>
              <span className="nav__tip" aria-hidden>
                {n.label}
              </span>
            </button>
          ))}
          {!isDesktop && <span className="nav__dev" title="Browser dev mode: no keychain, localhost-only network" />}
        </nav>
        <div className="corner">
          <button className="mode-pill" data-glass="clear" onClick={() => go("settings")} title={mode.description} aria-label={`AI mode: ${mode.label}. ${mode.description}`}>
            <StatusPill tone={mode.tone}>
              {mode.label}
              {settings.mode === "demo" ? " · simulated" : active ? ` · ${active.config.model || "no model"}` : " · not configured"}
            </StatusPill>
          </button>
          <UpdateBanner />
          <UpdateSheet />
          {notices.map((n) => (
            <div key={n} className="update" data-glass="frost" role="status">
              <span>{n}</span>
              <button className="update__btn" onClick={() => dismissNotice(n)}>
                Dismiss
              </button>
            </div>
          ))}
        </div>
        <main className="stage" data-full={shown === "live"} ref={contentRef}>
          <div className="screen" key={shown} data-dir={dir} data-leaving={leaving}>
            {shown === "live" && <Live />}
            {shown === "overview" && <Overview />}
            {shown === "providers" && <Providers />}
            {shown === "local" && <LocalModels />}
            {shown === "devices" && <Devices />}
            {shown === "history" && <History />}
            {shown === "settings" && <Settings />}
          </div>
        </main>
      </div>
    </>
  );
}
