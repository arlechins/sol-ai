import { Route, Routes } from "react-router-dom";
import { Footer, HashScroll, Nav, VariantSwitcher } from "./shared/chrome";
import { ActionLink, Container } from "./shared/primitives";
import LandingRoute from "./routes/Landing";
import DemoRoute from "./routes/Demo";
import { VariantProvider } from "./variant-context";

function NotFound() {
  return (
    <Container className="flex min-h-[60vh] flex-col items-start justify-center py-24">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
        404 · not found
      </p>
      <h1 className="mt-4 font-display text-4xl tracking-[-0.02em] text-ink">
        That record does not exist.
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
        The page you asked for is not part of the ledger. Try the story or the live
        demo.
      </p>
      <div className="mt-7 flex gap-3">
        <ActionLink to="/">Back to the landing page</ActionLink>
        <ActionLink to="/demo" kind="ghost">
          Open the demo
        </ActionLink>
      </div>
    </Container>
  );
}

export default function App() {
  return (
    <VariantProvider>
      <div className="flex min-h-dvh flex-col bg-canvas text-ink">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-btn focus:bg-ink focus:px-4 focus:py-2 focus:font-mono focus:text-xs focus:text-canvas"
        >
          Skip to content
        </a>
        <HashScroll />
        <Nav />
        <main id="main" className="flex-1">
          <Routes>
            <Route path="/" element={<LandingRoute />} />
            <Route path="/demo" element={<DemoRoute />} />
            <Route path="/v/:variant" element={<LandingRoute />} />
            <Route path="/v/:variant/demo" element={<DemoRoute />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        <Footer />
        <VariantSwitcher />
      </div>
    </VariantProvider>
  );
}
