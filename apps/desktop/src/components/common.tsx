import { CATEGORIES, type CategoryId, type ClassificationResult } from "@sorte/core";
import { CategoryGlyph, StatusPill, categoryColor } from "@sorte/ui";
import { useEffect, useRef, type ReactNode } from "react";

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <header className="card__head">
        <h2 className="s-eyebrow">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {children && <div className="empty__body">{children}</div>}
    </div>
  );
}

export function categoryLabel(id: CategoryId | null) {
  return id ? CATEGORIES.find((c) => c.id === id)!.label : "Needs review";
}

export function CategoryTag({ id }: { id: CategoryId | null }) {
  if (!id) return <StatusPill tone="amber">Needs review</StatusPill>;
  return (
    <span className="cat-tag" style={{ "--c": categoryColor(id) } as React.CSSProperties}>
      <CategoryGlyph id={id} size={16} color={categoryColor(id)} />
      {categoryLabel(id)}
    </span>
  );
}

export function LocationTag({ r }: { r: Pick<ClassificationResult, "location" | "inference"> }) {
  if (r.inference === "mock") return <StatusPill>Demo · simulated</StatusPill>;
  return r.location === "cloud" ? <StatusPill tone="lavender">Cloud</StatusPill> : <StatusPill tone="sage">Local</StatusPill>;
}

/** Confidence bar with threshold marker. Labelled as model-reported, not calibrated. */
export function Confidence({ value, threshold }: { value: number; threshold: number }) {
  const below = value < threshold;
  return (
    <div className="confidence">
      <div className="confidence__row">
        <span className="s-mono">{Math.round(value * 100)}%</span>
        <span className="s-hint">model-reported · threshold {Math.round(threshold * 100)}%</span>
      </div>
      <div className="confidence__track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label="Model-reported confidence">
        <div className="confidence__fill" data-below={below} style={{ width: `${value * 100}%` }} />
        <div className="confidence__mark" style={{ left: `${threshold * 100}%` }} />
      </div>
    </div>
  );
}

export function Dialog({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="dialog-title">
      <h2 id="dialog-title" className="dialog__title">
        {title}
      </h2>
      {children}
    </dialog>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="s-field">
      <span className="s-label">{label}</span>
      {children}
      {error ? <span className="s-hint field-error">{error}</span> : hint ? <span className="s-hint">{hint}</span> : null}
    </label>
  );
}

export function timeAgo(iso: string) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}
