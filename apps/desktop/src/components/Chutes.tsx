import { CATEGORIES, type CategoryId } from "@sorte/core";
import { CategoryGlyph, CountUp, categoryColor } from "@sorte/ui";
import { useEffect, useState } from "react";

/** The five streams as glass tubes. In Live they double as the correction buttons. */
export function Chutes({
  levels,
  active,
  pickable,
  locked,
  onPick,
  values,
  size = "lg",
}: {
  levels?: Partial<Record<CategoryId, number>>;
  active?: CategoryId | null;
  pickable?: boolean;
  locked?: boolean;
  onPick?(id: CategoryId): void;
  values?: Partial<Record<CategoryId, string | number>>;
  size?: "lg" | "dock";
}) {
  // Start empty so levels rise into place after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const f = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(f);
  }, []);

  return (
    <div className="chutes" data-size={size} data-has-active={!!active} data-locked={locked}>
      {CATEGORIES.map((c, i) => {
        const isActive = active === c.id;
        const target = Math.max(0, Math.min(1, levels?.[c.id] ?? 0));
        const level = mounted ? (isActive ? Math.max(target, 0.72) : target) : 0;
        // Stable element type: swapping it would remount and kill the transitions.
        const Tag = onPick ? "button" : "div";
        const value = values?.[c.id];
        return (
          <Tag
            key={c.id}
            className="chute"
            data-glass="clear"
            data-chute={c.id}
            data-active={isActive}
            data-filled={isActive || target > 0}
            data-liquid={categoryColor(c.id)}
            data-level={level}
            style={{ "--c": categoryColor(c.id), "--i": i } as React.CSSProperties}
            onClick={onPick ? () => onPick(c.id) : undefined}
            disabled={onPick ? !pickable : undefined}
            aria-label={onPick ? `Put in ${c.label}` : `${c.label}${value !== undefined ? `: ${value}` : ""}`}
            aria-pressed={onPick ? isActive : undefined}
            title={c.label}
          >
            <span className="chute__clip">
              <span className="chute__fill" style={{ transform: `translateY(${(1 - level) * 100}%)` }}>
                <span className="chute__wave" />
              </span>
            </span>
            {value !== undefined && <span className="chute__value">{typeof value === "number" ? <CountUp value={value} /> : value}</span>}
            <span className="chute__glyph">
              <CategoryGlyph id={c.id} size={size === "lg" ? 26 : 20} color="currentColor" />
            </span>
            <span className="chute__label">{c.short}</span>
          </Tag>
        );
      })}
    </div>
  );
}
