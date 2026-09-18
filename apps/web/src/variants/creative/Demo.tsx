import { useState, type ReactNode } from "react";
import {
  BenchmarkPanel,
  DiscoveryPanel,
  IntegratePanel,
  ProgramPanel,
  ScoreLab,
  TimelinePanel,
} from "../../shared/panels";
import { Container, Eyebrow, Reveal, StatusPill } from "../../shared/primitives";
import { useDemoController } from "../../shared/useDemoController";
import { explorer } from "../../content";

type TabId = "status" | "score" | "discover" | "loop" | "benchmark" | "integrate";

const TABS: { id: TabId; label: string; blurb: string }[] = [
  { id: "status", label: "Status", blurb: "Live config, bonds, and build fingerprint from devnet." },
  { id: "score", label: "Score lab", blurb: "Decayed scores computed from chain state." },
  { id: "discover", label: "Discover", blurb: "Certified capabilities ranked by creator score." },
  { id: "loop", label: "Trust loop", blurb: "The devnet transactions behind the mechanism." },
  { id: "benchmark", label: "Benchmark", blurb: "Six mechanisms, three attack classes." },
  { id: "integrate", label: "Integrate", blurb: "SDK, MCP, and webhooks." },
];

export default function CreativeDemo() {
  const controller = useDemoController();
  const [tab, setTab] = useState<TabId>("status");
  const active = TABS.find((item) => item.id === tab)!;

  let panel: ReactNode = null;
  if (tab === "status") panel = <ProgramPanel controller={controller} />;
  if (tab === "score") panel = <ScoreLab controller={controller} />;
  if (tab === "discover") panel = <DiscoveryPanel controller={controller} />;
  if (tab === "loop") panel = <TimelinePanel />;
  if (tab === "benchmark") panel = <BenchmarkPanel />;
  if (tab === "integrate") panel = <IntegratePanel />;

  return (
    <>
      <Container className="pt-14 pb-10 md:pt-20">
        <Reveal>
          <Eyebrow>Live demo · read-only · devnet</Eyebrow>
          <h1 className="mt-5 max-w-3xl font-display text-4xl leading-[1.0] tracking-[-0.03em] text-ink sm:text-5xl">
            Poke at the ledger.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted">
            Six views over the deployed program. No wallet, no mocks — the data comes
            from public devnet RPC through the same SDK your agent would use.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <StatusPill tone="success">live devnet</StatusPill>
            <StatusPill tone="info">read-only</StatusPill>
            <a
              href={explorer.program}
              target="_blank"
              rel="noreferrer noopener"
              className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted underline decoration-dotted underline-offset-4 hover:text-ink"
            >
              explorer ↗
            </a>
          </div>
        </Reveal>
      </Container>

      <div className="sticky top-16 z-30 border-y border-hairline bg-canvas/90 backdrop-blur">
        <Container className="flex gap-2 overflow-x-auto py-3">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-pressed={tab === item.id}
              className={`shrink-0 rounded-pill border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors ${
                tab === item.id
                  ? "border-accent bg-accent text-on-accent"
                  : "border-hairline text-muted hover:border-ink hover:text-ink"
              }`}
            >
              {item.label}
            </button>
          ))}
        </Container>
      </div>

      <Container className="py-12 md:py-16">
        <Reveal key={tab}>
          <div className="rounded-card border border-hairline bg-surface p-6 shadow-card md:p-10">
            <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3 border-b border-hairline pb-5">
              <h2 className="font-display text-2xl tracking-[-0.01em] text-ink">
                {active.label}
              </h2>
              <p className="text-sm text-muted">{active.blurb}</p>
            </div>
            {panel}
          </div>
        </Reveal>
      </Container>
    </>
  );
}
