import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { explorer, noTokenNote, PROGRAM_ID, REPO } from "../content";
import { useVariant, useVariantPath } from "../variant-context";
import { DEFAULT_VARIANT, SHOW_SWITCHER, VARIANTS, VARIANTS_META, type VariantId } from "../variants";
import { AddressChip, Container } from "./primitives";

const LANDING_LINKS = [
  { label: "Story", hash: "#story" },
  { label: "Mechanism", hash: "#mechanism" },
  { label: "Proof", hash: "#proof" },
  { label: "Benchmark", hash: "#benchmark" },
  { label: "Integrate", hash: "#integrate" },
];

export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-6 w-6 ${className}`}
      role="img"
      aria-label="TAOP"
    >
      {[3, 12, 21].map((cy) =>
        [3, 12, 21].map((cx) => (
          <circle
            key={`${cx}-${cy}`}
            cx={cx}
            cy={cy}
            r={cx === 12 && cy === 12 ? 2.6 : 1.5}
            className={cx === 12 && cy === 12 ? "fill-accent" : "fill-current"}
          />
        )),
      )}
    </svg>
  );
}

/** Scrolls to the hash target after SPA navigation. */
export function HashScroll() {
  const { hash, pathname } = useLocation();

  useEffect(() => {
    if (!hash) return;
    const element = document.querySelector(hash);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [hash, pathname]);

  return null;
}

export function Nav() {
  const withVariant = useVariantPath();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.hash]);

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-canvas/85 backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-6">
        <Link
          to={withVariant("/")}
          className="flex items-center gap-3"
          aria-label="TAOP home"
        >
          <Logo className="text-ink" />
          <span className="font-mono text-[13px] uppercase tracking-[0.22em] text-ink">
            taop
          </span>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-faint sm:inline">
            solana · devnet
          </span>
        </Link>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary">
          {LANDING_LINKS.map((item) => (
            <Link
              key={item.hash}
              to={withVariant(`/${item.hash}`)}
              className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted transition-colors hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
          <a
            href={REPO}
            target="_blank"
            rel="noreferrer noopener"
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted transition-colors hover:text-ink"
          >
            GitHub ↗
          </a>
          <Link
            to={withVariant("/demo")}
            className="rounded-btn bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-canvas transition-colors hover:bg-accent hover:text-on-accent"
          >
            Run the demo
          </Link>
        </nav>

        <button
          type="button"
          className="rounded-btn border border-hairline-2 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ink lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Close" : "Menu"}
        </button>
      </Container>

      {open ? (
        <div id="mobile-nav" className="border-t border-hairline bg-canvas lg:hidden">
          <Container className="flex flex-col gap-1 py-4">
            {LANDING_LINKS.map((item) => (
              <Link
                key={item.hash}
                to={withVariant(`/${item.hash}`)}
                className="py-2.5 font-mono text-[12px] uppercase tracking-[0.16em] text-muted"
              >
                {item.label}
              </Link>
            ))}
            <a
              href={REPO}
              target="_blank"
              rel="noreferrer noopener"
              className="py-2.5 font-mono text-[12px] uppercase tracking-[0.16em] text-muted"
            >
              GitHub ↗
            </a>
            <Link
              to={withVariant("/demo")}
              className="mt-3 rounded-btn bg-ink px-4 py-3 text-center font-mono text-[12px] uppercase tracking-[0.16em] text-canvas"
            >
              Run the demo
            </Link>
          </Container>
        </div>
      ) : null}
    </header>
  );
}

const FOOTER_COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Documentation",
    links: [
      { label: "Architecture", href: `${REPO}/blob/main/docs/architecture.md` },
      { label: "Account layout", href: `${REPO}/blob/main/docs/account-layout.md` },
      { label: "Tutorial", href: `${REPO}/blob/main/docs/tutorial.md` },
      { label: "Threat model", href: `${REPO}/blob/main/docs/threat-model.md` },
    ],
  },
  {
    title: "Evidence",
    links: [
      { label: "Benchmark report", href: `${REPO}/blob/main/benchmark/results/REPORT.md` },
      { label: "Pattern dataset (CC-BY)", href: `${REPO}/tree/main/benchmark/dataset` },
      { label: "Security review", href: `${REPO}/blob/main/docs/security-review.md` },
      { label: "Grant verification", href: `${REPO}/blob/main/docs/grant-verification.md` },
    ],
  },
  {
    title: "Code",
    links: [
      { label: "GitHub", href: REPO },
      { label: "@taopp/solana", href: `${REPO}/tree/main/packages/solana` },
      { label: "@taopp/mcp-server", href: `${REPO}/tree/main/packages/mcp-server` },
      { label: "@taopp/webhooks", href: `${REPO}/tree/main/packages/webhooks` },
    ],
  },
];

export function Footer() {
  const withVariant = useVariantPath();
  return (
    <footer className="border-t border-hairline bg-canvas-2">
      <Container className="py-16">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <div className="flex items-center gap-3">
              <Logo className="text-ink" />
              <span className="font-mono text-[13px] uppercase tracking-[0.22em] text-ink">
                taop
              </span>
            </div>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted">
              {noTokenNote} Built in the open: the program, the SDK, and the
              benchmark that tries to break them.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <AddressChip address={PROGRAM_ID} href={explorer.program} label="program" />
              <Link
                to={withVariant("/demo")}
                className="inline-flex items-center rounded-pill border border-hairline bg-surface px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-muted transition-colors hover:border-ink hover:text-ink"
              >
                Open demo
              </Link>
            </div>
          </div>

          {FOOTER_COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
                {column.title}
              </h2>
              <ul className="mt-5 flex flex-col gap-3">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-sm text-muted transition-colors hover:text-ink"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-hairline pt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-faint sm:flex-row sm:items-center sm:justify-between">
          <span>MIT license · no token · devnet deployment</span>
          <span>{new Date().getFullYear()} taop contributors</span>
        </div>
      </Container>
    </footer>
  );
}

export function VariantSwitcher() {
  const { variant, setVariant } = useVariant();
  const navigate = useNavigate();
  const location = useLocation();

  if (!SHOW_SWITCHER) return null;

  function switchTo(next: VariantId) {
    setVariant(next);
    const isDemo = location.pathname.endsWith("/demo");
    const target =
      next === DEFAULT_VARIANT
        ? isDemo
          ? "/demo"
          : "/"
        : `/v/${next}${isDemo ? "/demo" : ""}`;
    navigate(target);
  }

  return (
    <div className="fixed right-4 bottom-4 z-50 hidden md:block">
      <div className="flex items-center gap-1 rounded-pill border border-hairline bg-surface p-1 shadow-pop">
        <span className="px-2 font-mono text-[9px] uppercase tracking-[0.18em] text-faint">
          style
        </span>
        {VARIANTS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => switchTo(id)}
            title={VARIANTS_META[id].thesis}
            className={`rounded-pill px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors ${
              variant === id
                ? "bg-ink text-canvas"
                : "text-muted hover:text-ink"
            }`}
          >
            {VARIANTS_META[id].label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-canvas text-ink">{children}</div>;
}
