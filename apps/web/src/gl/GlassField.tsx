import { motionReduced } from "@sorte/ui";
import { useEffect, useRef } from "react";
import { field } from "./field";

/** The single canvas behind the whole site. */
export function GlassField() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // A fresh canvas per mount: a detached renderer loses its context for good.
    const canvas = document.createElement("canvas");
    canvas.className = "field";
    ref.current?.append(canvas);
    field.reduced = motionReduced();
    field.attach(canvas);
    return () => {
      field.detach();
      canvas.remove();
    };
  }, []);
  return <div ref={ref} aria-hidden />;
}
