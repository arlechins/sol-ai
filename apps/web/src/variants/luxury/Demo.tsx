import { useState, type ReactNode } from "react";
import { explorer, DEPLOYED_AT } from "../../content";
import { relativeTime } from "../../lib/format";
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

const SEAL_KEY = "taop.vault.open";

function VaultPanel({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-hairline py-16 md:py-20">
      <div className="flex flex-col items-center text-center">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent-ink">
          {title}
        </h2>
        {description ? (
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
        ) : null}
        <div className="mt-6 h-px w-16 bg-accent" />
      </div>
      <div className="mt-12">{children}</div>
    </section>
  );
}

export default function LuxuryDemo() {
  const controller = useDemoController();
  const [open, setOpen] = useState(() => {
    try {
      return sessionStorage.getItem(SEAL_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [opening, setOpening] = useState(false);

  function breakSeal() {
    setOpening(true);
    try {
      sessionStorage.setItem(SEAL_KEY, "1");
    } catch {
      // ignore
    }
    window.setTimeout(() => setOpen(true), 700);
  }

  return (
    <Container className="pt-16 pb-28 md:pt-24">
      <Reveal>
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow className="text-accent-ink">The vault · devnet</Eyebrow>
          <h1 className="mt-6 font-display text-4xl leading-[1.06] tracking-[-0.01em] text-ink sm:text-5xl">
            The record is open. The bonds are real.
          </h1>
          <p className="mt-6 text-base leading-relaxed text-muted">
            A read-only walk through the deployed program: config, scores, discovery,
            and the benchmark that keeps us honest. No wallet required.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
            <StatusPill tone="success">live devnet</StatusPill>
            <StatusPill tone="info">read-only</StatusPill>
            {DEPLOYED_AT ? (
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
                deployed {relativeTime(Date.parse(DEPLOYED_AT) / 1000)}
              </span>
            ) : null}
          </div>
        </div>
      </Reveal>

      {!open ? (
        <Reveal delay={120}>
          <div className="mx-auto mt-20 max-w-md border border-hairline-2 bg-surface p-10 text-center" style={{ boxShadow: "var(--shadow-card)" }}>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-faint">
              sealed
            </p>
            <h2 className="mt-4 font-display text-2xl text-ink">
              Break the seal to read the ledger.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Everything below is served from public devnet RPC. Your keys never leave
              your wallet; there is nothing to sign.
            </p>
            <button
              type="button"
              onClick={breakSeal}
              className="mt-7 rounded-btn bg-accent px-6 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-on-accent transition-opacity hover:opacity-90"
            >
              {opening ? "Opening…" : "Break the seal"}
            </button>
          </div>
        </Reveal>
      ) : null}

      <div className={`vault-door ${open ? "is-open" : "is-closed"} ${open ? "" : "pointer-events-none h-0 overflow-hidden"}`}>
        <VaultPanel
          title="Program status"
          description="Config PDA, challenge bond, decay period, and the reproducible-build fingerprint."
        >
          <div className="mx-auto max-w-2xl">
            <ProgramPanel controller={controller} />
          </div>
        </VaultPanel>

        <VaultPanel
          title="Score lab"
          description="Paste any agent address and read the decayed score straight from chain state."
        >
          <div className="mx-auto max-w-3xl">
            <ScoreLab controller={controller} />
          </div>
        </VaultPanel>

        <VaultPanel
          title="Capability discovery"
          description="Certified capabilities ranked by creator score."
        >
          <div className="mx-auto max-w-4xl">
            <DiscoveryPanel controller={controller} />
          </div>
        </VaultPanel>

        <VaultPanel
          title="Trust loop"
          description="The exact devnet transactions behind the mechanism."
        >
          <div className="mx-auto max-w-2xl">
            <TimelinePanel />
          </div>
        </VaultPanel>

        <VaultPanel
          title="Benchmark explorer"
          description="Where the mechanism holds, and where it does not."
        >
          <div className="mx-auto max-w-5xl">
            <BenchmarkPanel />
          </div>
        </VaultPanel>

        <VaultPanel title="Integrate" description="SDK, MCP, and signed webhooks.">
          <div className="mx-auto max-w-3xl">
            <IntegratePanel />
          </div>
        </VaultPanel>
      </div>

      <div className="mt-16 text-center">
        <a
          href={explorer.program}
          target="_blank"
          rel="noreferrer noopener"
          className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted underline decoration-dotted underline-offset-4 hover:text-ink"
        >
          verify on explorer ↗
        </a>
      </div>
    </Container>
  );
}
