import { CATEGORIES, type CategoryId } from "@sorte/core";
import { CategoryGlyph, categoryColor } from "@sorte/ui";

/**
 * The five streams as physical chutes. Fill = level (0–1). The active chute
 * glows and receives a falling token; in review mode chutes become buttons.
 */
export function Chutes({
  levels,
  active,
  dropKey,
  pickable,
  onPick,
  values,
  size = "lg",
}: {
  levels?: Partial<Record<CategoryId, number>>;
  active?: CategoryId | null;
  dropKey?: string | number;
  pickable?: boolean;
  onPick?(id: CategoryId): void;
  values?: Partial<Record<CategoryId, string | number>>;
  size?: "lg" | "sm";
}) {
  return (
    <div className="chutes" data-size={size} data-pickable={pickable} data-has-active={!!active}>
      {CATEGORIES.map((c) => {
        const isActive = active === c.id;
        const level = levels?.[c.id] ?? (isActive ? 0.62 : 0);
        const Tag = pickable ? "button" : "div";
        return (
          <Tag
            key={c.id}
            className="chute"
            data-active={isActive}
            style={{ "--c": categoryColor(c.id) } as React.CSSProperties}
            onClick={pickable ? () => onPick?.(c.id) : undefined}
            aria-label={pickable ? `Put in ${c.label}` : `${c.label}${values?.[c.id] !== undefined ? `: ${values[c.id]}` : ""}`}
            aria-pressed={pickable ? isActive : undefined}
            title={c.label}
          >
            <span className="chute__mouth" />
            <span className="chute__fill" style={{ height: `${Math.max(0, Math.min(1, level)) * 100}%` }} />
            {isActive && dropKey !== undefined && <span key={dropKey} className="chute__token" />}
            {values?.[c.id] !== undefined && <span className="chute__value">{values[c.id]}</span>}
            <span className="chute__glyph">
              <CategoryGlyph id={c.id} size={size === "lg" ? 26 : 20} color={isActive || !active ? categoryColor(c.id) : "var(--ivory-3)"} />
            </span>
            <span className="chute__label">{c.short}</span>
          </Tag>
        );
      })}
    </div>
  );
}
