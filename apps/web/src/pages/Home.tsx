import { CATEGORIES, type CategoryId } from "@sorte/core";
import { CategoryGlyph, categoryColor, motionReduced } from "@sorte/ui";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DownloadButtons } from "../components/Download";
import { field } from "../gl/field";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function Home() {
  // The world gets calmer and more ordered the further you read.
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const h = window.innerHeight;
      const y = window.scrollY;
      const p = clamp01(y / h);
      // Backlight peaks while the tubes are on screen, and again around the app preview.
      const glow = Math.max(0, 1 - Math.abs(y - h) / (h * 0.75));
      field.setMood(clamp01((y - h * 0.3) / h) * 0.16, 1 - clamp01((y - h * 0.15) / (h * 0.9)) * 0.62, glow, 1 - clamp01(p * 1.5));
      document.documentElement.style.setProperty("--hero-p", p.toFixed(3));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      field.setMood(0, 1);
      document.documentElement.style.removeProperty("--hero-p");
    };
  }, []);

  useReveal();

  return (
    <>
      <Hero />
      <Streams />
      <Preview />
      <Modes />
      <section className="last" id="get">
        <h2 className="rv">Get Sorte.</h2>
        <div className="rv">
          <DownloadButtons />
        </div>
      </section>
      <footer className="foot">
        <span>Streams are a default. Your local rules decide.</span>
        <Link to="/docs">Docs</Link>
      </footer>
    </>
  );
}

/** Fades sections in once, as they arrive. Armed by JS, so content is never hidden without it. */
function useReveal() {
  useEffect(() => {
    if (motionReduced()) return;
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    document.querySelectorAll(".rv").forEach((el) => {
      el.classList.add("rv--armed");
      io.observe(el);
    });
    return () => io.disconnect();
  }, []);
}

function Hero() {
  return (
    <section className="hero">
      <div className="hero__copy">
        <h1>
          <span>Waste,</span>
          <span>understood.</span>
        </h1>
        <p>A camera that knows where it goes.</p>
        <div className="hero__cta">
          <a className="btn btn--solid btn--lg" href="#get">
            Download
          </a>
          <a className="btn btn--lg" data-glass="clear" href="#streams">
            See how
          </a>
        </div>
      </div>
    </section>
  );
}

const TUBE_LEVELS = [0.74, 0.58, 0.42, 0.66, 0.3];

function Streams() {
  const [hover, setHover] = useState<CategoryId | null>(null);
  const [filled, setFilled] = useState(0);
  const tubes = useRef<HTMLDivElement>(null);
  // Tubes pour in one after another when they arrive on screen.
  useEffect(() => {
    if (motionReduced()) return setFilled(5);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      io.disconnect();
      for (let i = 1; i <= 5; i++) timers.push(setTimeout(() => setFilled(i), i * 130));
    });
    if (tubes.current) io.observe(tubes.current);
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);
  const shown = CATEGORIES.find((c) => c.id === hover);
  return (
    <section className="streams" id="streams">
      <h2 className="rv">Five streams.</h2>
      <div className="tubes rv" ref={tubes}>
        {CATEGORIES.map((c, i) => (
          <div
            key={c.id}
            className="tube"
            data-glass="clear"
            data-liquid={categoryColor(c.id)}
            data-level={i < filled ? TUBE_LEVELS[i]! + (hover === c.id ? 0.08 : 0) : 0}
            tabIndex={0}
            style={{ "--c": categoryColor(c.id), "--i": i, "--l": TUBE_LEVELS[i] } as React.CSSProperties}
            onPointerEnter={() => setHover(c.id)}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(c.id)}
            onBlur={() => setHover(null)}
          >
            <span className="tube__clip">
              <span className="tube__liquid" />
            </span>
            <span className="tube__glyph">
              <CategoryGlyph id={c.id} size={22} color="#fff" />
            </span>
            <span className="tube__name">{c.short}</span>
          </div>
        ))}
      </div>
      <p className="streams__eg" aria-live="polite" key={hover ?? "none"}>
        {shown ? shown.examples.slice(0, 3).join(" · ") : " "}
      </p>
    </section>
  );
}

const DEMO: { glyph: CategoryId; word: string; num: number; item: string }[] = [
  { glyph: "glass", word: "Glass", num: 94, item: "Clear jar" },
  { glyph: "plastic-metal", word: "Plastic · Metal", num: 91, item: "Aluminium can" },
  { glyph: "paper", word: "Paper", num: 88, item: "Cardboard" },
];

/** The app's Live screen in miniature, looping through what it really does. Illustrative values. */
function Preview() {
  const [i, setI] = useState(0);
  const [step, setStep] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting));
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || motionReduced()) return;
    const durations = [1500, 1100, 1300, 2800];
    const t = setTimeout(() => {
      if (step === 3) {
        setStep(0);
        setI((n) => (n + 1) % DEMO.length);
      } else setStep(step + 1);
    }, durations[step]);
    return () => clearTimeout(t);
  }, [step, visible]);
  const d = DEMO[i]!;
  const c = categoryColor(d.glyph);
  const reducedStep = motionReduced() ? 3 : step;
  const label = ["Show an item", "Hold still", "Analysing", d.word][reducedStep];

  return (
    <section className="preview" ref={ref}>
      <h2 className="rv">Show it. Know it.</h2>
      <div className="win rv" data-step={reducedStep} style={{ "--c": c } as React.CSSProperties}>
        <div className="win__bar">
          <i /><i /><i />
          <span className="win__tag">Illustration</span>
        </div>
        <div className="win__view">
          <div className="win__stage" aria-hidden />
          <div className="win__capsule" data-glass="frost">
            {reducedStep === 2 && <span className="win__spin" />}
            <b key={label} style={{ color: reducedStep === 3 ? c : undefined }}>
              {label}
            </b>
            {reducedStep === 3 && <em>{d.num}%</em>}
          </div>
          <div className="win__item" data-in={reducedStep > 0} key={i}>
            <CategoryGlyph id={d.glyph} size={128} color="#fff" />
          </div>
          <div className="win__finder">
            <s /><s /><s /><s />
          </div>
          <div className="win__dock">
            {CATEGORIES.map((cat) => (
              <span
                key={cat.id}
                className="win__tube"
                data-glass="clear"
                data-liquid={categoryColor(cat.id)}
                data-level={reducedStep === 3 && cat.id === d.glyph ? 0.74 : 0}
                data-on={reducedStep === 3 && cat.id === d.glyph}
                style={{ "--c": categoryColor(cat.id) } as React.CSSProperties}
              >
                <u />
                <CategoryGlyph id={cat.id} size={18} color="#fff" />
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const MODES = [
  { id: "Local", tint: "#30d158", line: "Runs on your machine. Nothing leaves." },
  { id: "Cloud", tint: "#bf5af2", line: "Your key, your provider. You see what's sent." },
  { id: "Hybrid", tint: "#ff9f0a", line: "Local first. Cloud only if you allow it." },
  { id: "Demo", tint: "#a1a1aa", line: "No setup. Always labelled simulated." },
];

function Modes() {
  const [m, setM] = useState(0);
  const mode = MODES[m]!;
  return (
    <section className="modes">
      <h2 className="rv">Your images. Your call.</h2>
      <div className="seg rv" data-glass="clear" role="radiogroup" aria-label="AI mode" style={{ "--i": m, "--tint": mode.tint } as React.CSSProperties}>
        <span className="seg__thumb" aria-hidden />
        {MODES.map((x, i) => (
          <button key={x.id} role="radio" aria-checked={i === m} onClick={() => setM(i)}>
            {x.id}
          </button>
        ))}
      </div>
      <p className="modes__line" key={mode.id} aria-live="polite">
        {mode.line}
      </p>
    </section>
  );
}
