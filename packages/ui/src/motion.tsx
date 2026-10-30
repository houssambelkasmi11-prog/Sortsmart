import { useEffect, useRef, useState } from "react";

/** True if animations should be skipped: the in-app setting wins over the system one. */
export function motionReduced(): boolean {
  if (typeof document === "undefined") return true;
  const setting = document.documentElement.dataset.motion;
  if (setting === "reduced") return true;
  if (setting === "full") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Animates a number toward `value`, continuing from wherever it currently is. */
export function useCountUp(value: number, ms = 900): number {
  const [shown, setShown] = useState(0);
  const current = useRef(0);
  useEffect(() => {
    if (motionReduced()) {
      current.current = value;
      setShown(value);
      return;
    }
    const from = current.current;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 4);
      current.current = from + (value - from) * eased;
      setShown(current.current);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, ms]);
  return shown;
}

export function CountUp({ value, ms }: { value: number; ms?: number }) {
  return <span className="s-count">{Math.round(useCountUp(value, ms))}</span>;
}

/** Text that assembles character by character. Replays whenever the text changes. */
export function RevealText({ text }: { text: string }) {
  return (
    <span aria-label={text} key={text}>
      {Array.from(text).map((ch, i) => (
        <span key={i} aria-hidden className="s-reveal__c" style={{ "--c": i } as React.CSSProperties}>
          {ch}
        </span>
      ))}
    </span>
  );
}
