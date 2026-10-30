import { CATEGORIES, type CategoryId, type ClassificationResult } from "@sorte/core";
import { CategoryGlyph, StatusPill, categoryColor } from "@sorte/ui";
import { useEffect, useRef, type ReactNode } from "react";

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="card" data-glass="frost">
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
