import { Link } from "react-router-dom";
import { PageHeader } from "../App";

const PIPELINE: { name: string; body: string; layer: "input" | "ai" | "policy" | "device" }[] = [
  { name: "Input", body: "Resized on device.", layer: "input" },
  { name: "Image analysis", body: "One request. Only when you ask.", layer: "ai" },
  { name: "Material classification", body: "A strict, validated schema.", layer: "ai" },
  { name: "Confidence check", body: "Unsure means review.", layer: "policy" },
  { name: "Sorting decision", body: "Your local rules.", layer: "policy" },
  { name: "Device command", body: "Only after every check.", layer: "device" },
  { name: "Verification", body: "Acknowledged ≠ sorted.", layer: "device" },
];

const LADDER = [
  ["Classified", ""],
  ["Accepted", ""],
  ["Acknowledged", ""],
  ["Verified", ""],
];

export function Technology() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="Technology"
        title={
          <>
            Inference is a claim.
            <br />
            <em>Sorting is a fact.</em>
          </>
        }
        
      />

      <ol className="pipeline" aria-label="Classification pipeline">
        {PIPELINE.map((s, i) => (
          <li key={s.name} className="pipeline__step" data-layer={s.layer}>
            <span className="pipeline__n">{String(i + 1).padStart(2, "0")}</span>
            <div>
              <h2>{s.name}</h2>
              <p>{s.body}</p>
            </div>
            <span className="pipeline__layer">{s.layer === "ai" ? "AI inference" : s.layer === "device" ? "Physical execution" : s.layer === "policy" ? "Policy" : "Input"}</span>
          </li>
        ))}
      </ol>

      <section className="section section--tight" aria-labelledby="ladder-title">
        <div className="section__head">
          <p className="s-eyebrow">Four distinct states</p>
          <h2 id="ladder-title" className="s-display section__title">Never one green tick for everything.</h2>
        </div>
        <ol className="ladder">
          {LADDER.map(([t, b]) => (
            <li key={t}>
              <h3>{t}</h3>
              {b && <p>{b}</p>}
            </li>
          ))}
        </ol>
      </section>


      <p className="page__foot">
        <Link to="/docs#device-integration" className="s-btn">
          Device integration guide
        </Link>
      </p>
    </div>
  );
}
