import { motionReduced } from "@sorte/ui";
import { useEffect, useRef } from "react";
import { cssColor, glass } from "./glass";

const MODE_TINT: Record<string, string> = {
  demo: "#3a6fe0",
  local: "#2fb37a",
  cloud: "#9a5cf0",
  hybrid: "#e0853a",
};

export function GlassBackground({ mode, motionSetting }: { mode: string; motionSetting: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // A fresh canvas per mount: a detached renderer loses its context for good.
    const canvas = document.createElement("canvas");
    canvas.className = "glass-canvas";
    ref.current?.append(canvas);
    glass.attach(canvas);
    return () => {
      glass.detach();
      canvas.remove();
    };
  }, []);
  useEffect(() => glass.setTint(cssColor(MODE_TINT[mode] ?? MODE_TINT.demo!)), [mode]);
  useEffect(() => {
    glass.reduced = motionReduced();
  }, [motionSetting]);
  return <div ref={ref} aria-hidden />;
}
