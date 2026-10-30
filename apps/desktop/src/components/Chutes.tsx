import { CATEGORIES, type CategoryId } from "@sorte/core";
import { CategoryGlyph, CountUp, categoryColor } from "@sorte/ui";
import { useEffect, useState } from "react";

/**
 * The five streams as physical chutes. Fill = level (0–1). The active chute
 * glows and receives a falling token; in review mode chutes become buttons.
 */
export function Chutes({
  levels,
  active,
  dropKey,
  pickable,
  locked,
  onPick,
  values,
  size = "lg",
}: {
  levels?: Partial<Record<CategoryId, number>>;
  active?: CategoryId | null;
  dropKey?: string | number;
  pickable?: boolean;
  locked?: boolean;
  onPick?(id: CategoryId): void;
  values?: Partial<Record<CategoryId, string | number>>;
  size?: "lg" | "sm";
}) {
  // Start empty so levels rise into place after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const f = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(f);
  }, []);

  return (
    <div className="chutes" data-size={size} data-pickable={pickable} data-has-active={!!active} data-locked={locked}>
      {CATEGORIES.map((c, i) => {
        const isActive = active === c.id;
        const target = levels?.[c.id] ?? (isActive ? 0.62 : 0);
        const level = mounted ? Math.max(0, Math.min(1, target)) : 0;
        const dropping = isActive && dropKey !== undefined;
        // Stable element type: swapping it when a result arrives would remount and kill the transitions.
        const Tag = onPick ? "button" : "div";
        const value = values?.[c.id];
        return (
          <Tag
            key={c.id}
            className="chute"
            data-active={isActive}
            data-dropping={dropping}
            style={{ "--c": categoryColor(c.id), "--i": i } as React.CSSProperties}
            onClick={onPick ? () => onPick(c.id) : undefined}
            disabled={onPick ? !pickable : undefined}
            aria-label={onPick ? `Put in ${c.label}` : `${c.label}${value !== undefined ? `: ${value}` : ""}`}
            aria-pressed={onPick ? isActive : undefined}
            title={c.label}
          >
            <span className="chute__mouth" />
            <span className="chute__fill" style={{ transform: `translateY(${(1 - level) * 100}%)` }}>
              <span className="chute__wave" />
            </span>
            {dropping && (
              <span key={dropKey} className="chute__drop" style={{ bottom: `${target * 100}%` }}>
                <span className="chute__token" />
                <span className="chute__splash" />
              </span>
            )}
            {value !== undefined && <span className="chute__value">{typeof value === "number" ? <CountUp value={value} /> : value}</span>}
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
