import { CATEGORIES } from "@sorte/core";
import { categoryColor } from "@sorte/ui";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useReducedMotion } from "../useReducedMotion";
import { HeroScene, webglAvailable } from "./HeroScene";

export function Hero() {
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HeroScene | null>(null);
  const reduced = useReducedMotion();
  const [mode, setMode] = useState<"pending" | "webgl" | "fallback">("pending");
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !webglAvailable()) {
      setMode("fallback");
      return;
    }
    // A fresh canvas per mount: a disposed renderer loses its context, which must not leak into the next one.
    const canvas = document.createElement("canvas");
    canvas.className = "hero__canvas";
    canvas.setAttribute("aria-hidden", "true");
    stage.prepend(canvas);
    let scene: HeroScene;
    try {
      scene = new HeroScene(canvas, { reducedMotion: reduced, onHoverStream: setActive });
    } catch (err) {
      console.warn("[sorte] WebGL hero unavailable, using static fallback.", err);
      canvas.remove();
      setMode("fallback");
      return;
    }
    sceneRef.current = scene;
    setMode("webgl");

    // Render only while visible.
    let inView = true;
    const sync = () => (inView && !document.hidden ? scene.start() : scene.stop());
    const io = new IntersectionObserver(([e]) => {
      inView = !!e?.isIntersecting;
      sync();
    });
    io.observe(canvas);
    document.addEventListener("visibilitychange", sync);
    const onLost = (e: Event) => {
      e.preventDefault();
      console.warn("[sorte] WebGL context lost, using static fallback.");
      setMode("fallback");
    };
    canvas.addEventListener("webglcontextlost", onLost);
    sync();

    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      canvas.removeEventListener("webglcontextlost", onLost);
      scene.dispose();
      canvas.remove();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => sceneRef.current?.setReducedMotion(reduced), [reduced]);

  // Scrolling away: the copy lifts and fades, and the lens turns and stops down.
  const heroRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const hero = heroRef.current;
        if (!hero) return;
        const p = Math.min(1, window.scrollY / hero.offsetHeight);
        hero.style.setProperty("--p", p.toFixed(3));
        sceneRef.current?.setScroll(p);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [reduced]);

  const highlight = (i: number | null) => {
    setActive(i);
    sceneRef.current?.setHighlight(i);
  };

  return (
    <section className="hero" aria-labelledby="hero-title" ref={heroRef}>
      <div className="hero__stage" data-mode={mode} ref={stageRef}>
        {mode === "fallback" && <StaticLens />}
      </div>

      <div className="hero__copy">
        <p className="s-eyebrow hero__eyebrow">AI material vision</p>
        <h1 id="hero-title" className="s-display hero__title">
          <span className="line">
            <span className="line__in">Waste,</span>
          </span>
          <span className="line">
            <span className="line__in line__in--2">
              <em>understood</em>
            </span>
          </span>
        </h1>
        <p className="hero__lede">It sees what you throw away — and knows where it goes.</p>
        <div className="hero__ctas">
          <Link to="/technology" className="s-btn s-btn--primary s-btn--lg">
            Explore SORTÉ
          </Link>
          <Link to="/download" className="s-btn s-btn--lg">
            Download the app
          </Link>
        </div>
      </div>

      <ul className="hero__streams" aria-label="Five default streams">
        {CATEGORIES.map((c, i) => (
          <li key={c.id}>
            <Link
              to={`/sorting#${c.id}`}
              className="hero__stream"
              data-active={active === i}
              onMouseEnter={() => highlight(i)}
              onMouseLeave={() => highlight(null)}
              onFocus={() => highlight(i)}
              onBlur={() => highlight(null)}
              style={{ "--c": categoryColor(c.id) } as React.CSSProperties}
            >
              <span className="hero__stream-index">0{c.index}</span>
              <span>{c.short}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** CSS-only lens used when WebGL is unavailable. Same message, same product. */
function StaticLens() {
  return (
    <div className="static-lens" role="img" aria-label="SORTÉ lens">
      <div className="static-lens__barrel" />
      <div className="static-lens__led" />
      <div className="static-lens__iris" />
      <div className="static-lens__core" />
      <div className="static-lens__glass" />
    </div>
  );
}
