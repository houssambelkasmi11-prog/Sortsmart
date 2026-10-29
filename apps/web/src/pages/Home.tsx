import { CATEGORIES } from "@sorte/core";
import { CategoryGlyph, categoryColor } from "@sorte/ui";
import { Link } from "react-router-dom";
import { Hero } from "../hero/Hero";

const FLOW = ["See", "Classify", "Check", "Decide"];

const MODES = [
  { name: "Local", sub: "On device", tone: "var(--sage)" },
  { name: "Cloud", sub: "Your key", tone: "var(--lavender)" },
  { name: "Hybrid", sub: "Local first", tone: "var(--amber)" },
  { name: "Demo", sub: "Simulated", tone: "var(--ivory-3)" },
];

// Illustrative fill heights for the chute visual.
const FILL = [0.72, 0.55, 0.38, 0.63, 0.24];

export function Home() {
  return (
    <>
      <Hero />

      <section className="v-section" aria-label="Five streams">
        <h2 className="s-display v-title">Five streams.</h2>
        <div className="web-chutes">
          {CATEGORIES.map((c, i) => (
            <Link key={c.id} to={`/sorting#${c.id}`} className="web-chute" style={{ "--c": categoryColor(c.id), "--f": FILL[i] } as React.CSSProperties}>
              <span className="web-chute__mouth" />
              <span className="web-chute__fill" />
              <CategoryGlyph id={c.id} size={30} color={categoryColor(c.id)} />
              <span className="web-chute__label">{c.short}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="v-section" aria-label="How it works">
        <h2 className="s-display v-title">One decision.</h2>
        <ol className="flow">
          {FLOW.map((f, i) => (
            <li key={f} style={{ "--i": i } as React.CSSProperties}>
              <span className="flow__node" />
              <span className="flow__label">{f}</span>
            </li>
          ))}
        </ol>
        <Link to="/technology" className="v-more">
          How it works →
        </Link>
      </section>

      <section className="v-section" aria-label="AI modes">
        <h2 className="s-display v-title">Your images. Your call.</h2>
        <ul className="orbs">
          {MODES.map((m) => (
            <li key={m.name} style={{ "--o": m.tone } as React.CSSProperties}>
              <span className="w-orb">
                <span className="w-orb__ring" />
                <span className="w-orb__core" />
              </span>
              <strong>{m.name}</strong>
              <span>{m.sub}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="final-cta">
        <h2 className="s-display">Sort with intent.</h2>
        <Link to="/download" className="s-btn s-btn--primary s-btn--lg">
          Download
        </Link>
      </section>
    </>
  );
}
