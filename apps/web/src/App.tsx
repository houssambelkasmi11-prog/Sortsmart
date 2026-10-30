import { Wordmark, motionReduced } from "@sorte/ui";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

const NAV = [
  { to: "/sorting", label: "Sorting" },
  { to: "/technology", label: "Technology" },
  { to: "/docs", label: "Docs" },
  { to: "/settings", label: "App preview" },
];

export function Layout() {
  const { pathname, hash } = useLocation();
  const [open, setOpen] = useState(false);

  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setOpen(false);
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: motionReduced() ? "auto" : "smooth" });
    else window.scrollTo(0, 0);
  }, [pathname, hash]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useScrollReveal(pathname);

  return (
    <>
      <a href="#main" className="skip">
        Skip to content
      </a>
      <header className="nav" data-open={open} data-scrolled={scrolled}>
        <Link to="/" className="nav__brand" aria-label="SORTÉ home">
          <Wordmark size={14} />
        </Link>
        <button className="nav__toggle s-btn s-btn--ghost s-btn--sm" aria-expanded={open} aria-controls="nav-links" onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : "Menu"}
        </button>
        <nav id="nav-links" className="nav__links" aria-label="Primary">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className="nav__link">
              {n.label}
            </NavLink>
          ))}
          <Link to="/download" className="s-btn s-btn--sm nav__cta">
            Download
          </Link>
        </nav>
      </header>
      <main id="main">
        <div className="route" key={pathname}>
          <Outlet />
        </div>
      </main>
      <footer className="footer">
        <div className="footer__inner">
          <Wordmark size={12} />
          <p className="footer__note">
            Categories are a configurable default, not a universal recycling standard. Always follow your local collection rules.
          </p>
          <nav className="footer__links" aria-label="Footer">
            <Link to="/download">Download</Link>
            <Link to="/docs#privacy">Privacy</Link>
            <Link to="/docs#security">Security</Link>
            <Link to="/docs#development">Developers</Link>
          </nav>
        </div>
      </footer>
    </>
  );
}

const REVEAL =
  ".v-title, .web-chutes, .flow, .v-more, .orbs li, .final-cta > *, .page-head > *, .cat, .pipeline__step, .ladder li, .review-case, .dl-card, .notes li, .rules, .preview, .docs__toc, .docs__body section, .section__head, .spec, .page__foot, .footer__inner";

/**
 * Elements fade and rise as they scroll into view, with a small stagger among
 * siblings. Only armed once JS runs, so content is never hidden without it.
 */
function useScrollReveal(pathname: string) {
  useEffect(() => {
    if (motionReduced()) return;
    const items = Array.from(document.querySelectorAll<HTMLElement>(REVEAL)).filter((el) => !el.classList.contains("is-in"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    for (const el of items) {
      const index = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
      el.style.setProperty("--rv", String(Math.min(index, 6)));
      el.classList.add("rv");
      io.observe(el);
    }
    return () => io.disconnect();
  }, [pathname]);
}

export function PageHeader({ eyebrow, title, lede }: { eyebrow: string; title: React.ReactNode; lede?: React.ReactNode }) {
  return (
    <header className="page-head">
      <p className="s-eyebrow">{eyebrow}</p>
      <h1 className="s-display page-head__title">{title}</h1>
      {lede && <p className="page-head__lede">{lede}</p>}
    </header>
  );
}
