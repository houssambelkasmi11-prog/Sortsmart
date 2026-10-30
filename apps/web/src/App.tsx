import { motionReduced } from "@sorte/ui";
import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { GlassField } from "./gl/GlassField";

export function Layout() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: motionReduced() ? "auto" : "smooth" });
    else window.scrollTo(0, 0);
  }, [pathname, hash]);

  return (
    <>
      <GlassField />
      <a href="#main" className="skip">
        Skip to content
      </a>
      <header className="top">
        <Link to="/" className="brand" aria-label="Sorte home">
          <span className="brand__ring" />
          Sorte
        </Link>
        <nav className="nav" data-glass="frost" aria-label="Primary">
          <Link to="/#streams">Streams</Link>
          <Link to="/docs" aria-current={pathname === "/docs" ? "page" : undefined}>
            Docs
          </Link>
          <Link to="/download" className="nav__cta" aria-current={pathname === "/download" ? "page" : undefined}>
            Download
          </Link>
        </nav>
      </header>
      <main id="main">
        <div className="route" key={pathname}>
          <Outlet />
        </div>
      </main>
    </>
  );
}

export function PageHeader({ eyebrow, title, lede }: { eyebrow: string; title: React.ReactNode; lede?: React.ReactNode }) {
  return (
    <header className="page-head">
      <p className="s-eyebrow">{eyebrow}</p>
      <h1 className="page-head__title">{title}</h1>
      {lede && <p className="page-head__lede">{lede}</p>}
    </header>
  );
}
