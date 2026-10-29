import type { ButtonHTMLAttributes, ReactNode } from "react";

type Tone = "neutral" | "sage" | "amber" | "lavender" | "danger";

export function Button({
  variant = "secondary",
  size,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "lg" }) {
  const cls = ["s-btn", variant !== "secondary" && `s-btn--${variant}`, size && `s-btn--${size}`, className].filter(Boolean).join(" ");
  return <button type="button" className={cls} {...props} />;
}

export function StatusPill({ tone = "neutral", pulse = false, children, title }: { tone?: Tone; pulse?: boolean; children: ReactNode; title?: string }) {
  return (
    <span className="s-pill" data-tone={tone} data-pulse={pulse} title={title}>
      <span className="s-pill__dot" aria-hidden />
      {children}
    </span>
  );
}

export function Orbit({ color, label }: { color?: string; label?: string }) {
  return <span className="s-orbit" role={label ? "status" : undefined} aria-label={label} style={color ? ({ "--orbit-color": color } as React.CSSProperties) : undefined} />;
}

export function Wordmark({ size = 18 }: { size?: number }) {
  return (
    <span style={{ fontWeight: 600, letterSpacing: "0.22em", fontSize: size, display: "inline-flex", alignItems: "center", gap: size * 0.5 }}>
      <Insignia size={size * 1.1} />
      SORTÉ
    </span>
  );
}

/** Original insignia: five arcs converging on a point — five streams, one decision. */
export function Insignia({ size = 20, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10.5" stroke={color} strokeOpacity="0.35" />
      {[0, 72, 144, 216, 288].map((a) => (
        <path key={a} d="M12 12 L12 3.2" stroke={color} strokeWidth="1.4" strokeLinecap="round" transform={`rotate(${a} 12 12)`} />
      ))}
      <circle cx="12" cy="12" r="2.2" fill={color} />
    </svg>
  );
}

/** Original geometric glyphs per stream (no clip-art recycling icons). */
export function CategoryGlyph({ id, size = 28, color = "currentColor" }: { id: string; size?: number; color?: string }) {
  const common = { stroke: color, strokeWidth: 1.3, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      {id === "paper" && (
        <g {...common}>
          <rect x="7" y="9" width="18" height="16" rx="1.5" />
          <path d="M10 6.5h12M12 4h8" opacity="0.6" />
          <path d="M11 15h10M11 19h7" opacity="0.6" />
        </g>
      )}
      {id === "plastic-metal" && (
        <g {...common}>
          <ellipse cx="16" cy="8" rx="7" ry="2.5" />
          <path d="M9 8v15c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V8" />
          <path d="M9 13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" opacity="0.5" />
        </g>
      )}
      {id === "glass" && (
        <g {...common}>
          <path d="M13 4h6M13.5 4v5c-3 1.5-4.5 3.8-4.5 7v9c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2v-9c0-3.2-1.5-5.5-4.5-7V4" />
          <path d="M12 18h8" opacity="0.5" />
        </g>
      )}
      {id === "organic" && (
        <g {...common}>
          <path d="M8 24C8 13 15 7 25 7c0 10-6 17-17 17Z" />
          <path d="M8 24 19 13" opacity="0.6" />
        </g>
      )}
      {id === "residual" && (
        <g {...common}>
          <circle cx="16" cy="16" r="10" />
          <path d="M10 22 22 10M8.5 17.5l9-9M14.5 23.5l9-9" opacity="0.5" />
        </g>
      )}
    </svg>
  );
}

export function categoryColor(id: string): string {
  const map: Record<string, string> = {
    paper: "var(--cat-paper)",
    "plastic-metal": "var(--cat-plastic)",
    glass: "var(--cat-glass)",
    organic: "var(--cat-organic)",
    residual: "var(--cat-residual)",
  };
  return map[id] ?? "var(--ivory-3)";
}
