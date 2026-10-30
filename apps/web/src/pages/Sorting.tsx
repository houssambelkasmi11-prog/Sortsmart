import { CATEGORIES, DEFAULT_RULES, resolveCategory, type CategoryId, type RulesProfile } from "@sorte/core";
import { CategoryGlyph, categoryColor } from "@sorte/ui";
import { useMemo, useState } from "react";
import { PageHeader } from "../App";

export function Sorting() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="The five categories"
        title={
          <>
            A default schema,
            <br />
            <em>not a universal law.</em>
          </>
        }
        
      />

      <div className="cat-list">
        {CATEGORIES.map((c) => (
          <article key={c.id} id={c.id} className="cat" style={{ "--c": categoryColor(c.id) } as React.CSSProperties}>
            <div className="cat__id">
              <span className="cat__index">0{c.index}</span>
              <CategoryGlyph id={c.id} size={44} color={categoryColor(c.id)} />
            </div>
            <div className="cat__main">
              <h2 className="s-display">{c.label}</h2>
              <p className="cat__desc">{c.description}</p>
            </div>
            <ul className="cat__chips">
              {c.examples.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <section className="section section--tight" aria-labelledby="uncertain-title">
        <div className="section__head">
          <p className="s-eyebrow">When SORTÉ isn't sure</p>
          <h2 id="uncertain-title" className="s-display section__title">Review beats a wrong bin.</h2>
        </div>
        <div className="review-grid">
          <ReviewCase title="Low confidence" body="Held for you to confirm." conf={0.52} />
          <ReviewCase title="Hazardous or electronic" body="Never routed. Dedicated collection." conf={null} />
          <ReviewCase title="Outside every stream" body="Review, or residual — your rule." conf={null} />
        </div>
      </section>

      <RulesPlayground />
    </div>
  );
}

function ReviewCase({ title, body, conf }: { title: string; body: string; conf: number | null }) {
  return (
    <div className="review-case">
      <h3>{title}</h3>
      <p>{body}</p>
      {conf !== null && (
        <div className="conf" aria-label={`Illustration: ${Math.round(conf * 100)}% reported confidence against a 75% threshold`}>
          <div className="conf__track">
            <div className="conf__fill" style={{ width: `${conf * 100}%` }} />
            <div className="conf__threshold" style={{ left: "75%" }} />
          </div>
          <span className="s-mono muted">{Math.round(conf * 100)}% · illustration</span>
        </div>
      )}
    </div>
  );
}

/** Uses the real rules resolver from @sorte/core — the same code the desktop app runs. */
function RulesPlayground() {
  const [rules, setRules] = useState<RulesProfile>(DEFAULT_RULES);
  const toggle = (id: CategoryId) => setRules((r) => ({ ...r, enabled: { ...r.enabled, [id]: !r.enabled[id] } }));
  const setRedirect = (id: CategoryId, v: string) =>
    setRules((r) => ({ ...r, redirects: { ...r.redirects, [id]: v as CategoryId | "review" } }));
  const outcomes = useMemo(() => CATEGORIES.map((c) => ({ c, res: resolveCategory(c.id, rules) })), [rules]);

  return (
    <section className="section section--tight" aria-labelledby="rules-title">
      <div className="section__head">
        <p className="s-eyebrow">Local rules</p>
        <h2 id="rules-title" className="s-display section__title">Match your municipality.</h2>
      </div>
      <div className="rules s-panel">
        <div className="rules__row rules__row--head">
          <span>Stream</span>
          <span>Collected here</span>
          <span>If not collected</span>
          <span>Outcome</span>
        </div>
        {outcomes.map(({ c, res }) => (
          <div className="rules__row" key={c.id}>
            <span className="rules__name">
              <i style={{ background: categoryColor(c.id) }} />
              {c.label}
            </span>
            <span>
              <input type="checkbox" className="s-switch" checked={rules.enabled[c.id] !== false} onChange={() => toggle(c.id)} aria-label={`${c.label} collected`} />
            </span>
            <span>
              <select
                className="s-select"
                disabled={rules.enabled[c.id] !== false}
                value={rules.redirects[c.id] ?? "review"}
                onChange={(e) => setRedirect(c.id, e.target.value)}
                aria-label={`Redirect for ${c.label}`}
              >
                <option value="review">Manual review</option>
                {CATEGORIES.filter((o) => o.id !== c.id).map((o) => (
                  <option key={o.id} value={o.id}>
                    → {o.label}
                  </option>
                ))}
              </select>
            </span>
            <span className={res.kind === "assign" ? "" : "amber"}>
              {res.kind === "assign" ? CATEGORIES.find((x) => x.id === res.category)!.label : "Needs review"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
