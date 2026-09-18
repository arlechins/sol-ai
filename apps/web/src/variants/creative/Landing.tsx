import {
  BUILD_HASH,
  CONFIG_PDA,
  explorer,
  noTokenNote,
  PROGRAM_ID,
  sections,
  testTotal,
  trustContract,
  verifiedLoop,
} from "../../content";
import { taop } from "../../lib/benchmark";
import { shortKey } from "../../lib/format";
import {
  ActionLink,
  AddressChip,
  Container,
  DataRow,
  Eyebrow,
  Reveal,
  Stat,
  StatusPill,
  TxLink,
} from "../../shared/primitives";
import { BenchmarkSummary, IntegratePanel } from "../../shared/panels";
import { AgentCanvas } from "./AgentCanvas";

const CARD_TILTS = ["-rotate-[1.2deg]", "rotate-[0.6deg]", "-rotate-[0.6deg]"];
const CARD_ACCENTS = ["border-t-accent", "border-t-info", "border-t-success"];

export default function CreativeLanding() {
  return (
    <>
      <Container className="pt-14 pb-16 md:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-pill border border-hairline-2 bg-surface px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                an agent ledger, rebuilt on solana
              </span>
            </Reveal>
            <Reveal delay={70}>
              <h1 className="mt-8 font-display text-[2.9rem] leading-[0.98] tracking-[-0.03em] text-ink sm:text-6xl md:text-7xl">
                Reputation is a{" "}
                <em className="text-accent-ink">living</em> thing.
              </h1>
            </Reveal>
            <Reveal delay={140}>
              <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted">
                Agents attest. Anyone can challenge with a bond. Disputes settle on
                chain, and scores decay when work stops. TAOP keeps the ledger honest —
                and publishes where it fails.
              </p>
            </Reveal>
            <Reveal delay={210}>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <ActionLink to="/demo">Try the live demo</ActionLink>
                <ActionLink to="/#benchmark" kind="ghost">
                  See the weak spots
                </ActionLink>
              </div>
            </Reveal>
          </div>

          <Reveal delay={160}>
            <div className="relative">
              <div className="dot-grid relative h-72 overflow-hidden rounded-card border border-hairline bg-surface-2 md:h-96">
                <AgentCanvas className="absolute inset-0 h-full w-full" />
                <div className="absolute top-5 left-5 rounded-pill border border-hairline bg-surface px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                  0.005 SOL challenge bond
                </div>
                <div className="absolute right-5 bottom-5 rounded-pill border border-hairline bg-surface px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                  30-day decay
                </div>
              </div>
              <div className="absolute -bottom-4 -left-3 -rotate-[2deg] rounded-card border border-hairline bg-surface px-4 py-3 shadow-card">
                <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-faint">
                  benchmark composite
                </p>
                <p className="tabular font-display text-2xl text-ink">
                  {taop.scores.composite.toFixed(1)}
                  <span className="text-sm text-faint"> / 100</span>
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </Container>

      <div className="overflow-hidden border-y border-hairline bg-surface-2 py-4">
        <div className="marquee-track" aria-hidden="true">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0 items-center">
              {verifiedLoop.map((step) => (
                <span
                  key={`${copy}-${step.tx}`}
                  className="mx-6 flex items-center gap-3 font-mono text-[11px] text-muted"
                >
                  <span className="text-accent">●</span>
                  {step.name.toLowerCase()} {shortKey(step.tx, 8, 8)}
                </span>
              ))}
              <span className="mx-6 font-mono text-[11px] text-muted">
                <span className="text-accent">●</span> {testTotal} tests passing
              </span>
              <span className="mx-6 font-mono text-[11px] text-muted">
                <span className="text-accent">●</span> reproducible build
              </span>
              <span className="mx-6 font-mono text-[11px] text-muted">
                <span className="text-accent">●</span> no token
              </span>
            </div>
          ))}
        </div>
      </div>

      <section id="story" className="scroll-mt-24 py-20 md:py-28">
        <Container>
          <Reveal>
            <div className="max-w-3xl">
              <Eyebrow>{sections.gap.eyebrow}</Eyebrow>
              <h2 className="mt-5 font-display text-4xl leading-[1.02] tracking-[-0.02em] text-ink sm:text-5xl">
                {sections.gap.title}
              </h2>
              <p className="mt-6 text-lg leading-relaxed text-muted">{sections.gap.lede}</p>
            </div>
          </Reveal>

          <div className="mt-14 grid gap-7 md:grid-cols-3">
            {sections.gap.points.map((point, index) => (
              <Reveal key={point.title} delay={index * 90}>
                <article
                  className={`h-full rounded-card border border-t-4 border-hairline bg-surface p-6 shadow-card ${CARD_TILTS[index]} ${CARD_ACCENTS[index]}`}
                >
                  <span className="font-display text-4xl text-accent-ink">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-4 font-display text-2xl tracking-[-0.01em] text-ink">
                    {point.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{point.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      <section id="mechanism" className="scroll-mt-24 border-t border-hairline bg-surface-2 py-20 md:py-28">
        <Container>
          <Reveal>
            <div className="max-w-3xl">
              <Eyebrow>{sections.fix.eyebrow}</Eyebrow>
              <h2 className="mt-5 font-display text-4xl leading-[1.02] tracking-[-0.02em] text-ink sm:text-5xl">
                {sections.fix.title}
              </h2>
              <p className="mt-6 text-lg leading-relaxed text-muted">{sections.fix.lede}</p>
            </div>
          </Reveal>

          <ol className="mt-14 grid gap-6 md:grid-cols-3">
            {verifiedLoop.map((step, index) => (
              <Reveal
                key={step.step}
                as="li"
                delay={index * 90}
                className="relative h-full rounded-card border border-hairline bg-surface p-7"
              >
                {index < verifiedLoop.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-1/2 -right-6 hidden font-mono text-xl text-accent md:block"
                  >
                    →
                  </span>
                ) : null}
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-ink">
                  step {step.step}
                </span>
                <h3 className="mt-3 font-display text-2xl tracking-[-0.01em] text-ink">
                  {step.name}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.title}</p>
                <div className="mt-5">
                  <TxLink signature={step.tx} />
                </div>
              </Reveal>
            ))}
          </ol>

          <div className="mt-10 flex flex-wrap gap-3">
            {trustContract.map((item) => (
              <Reveal key={item.title} delay={60}>
                <div className="max-w-sm rounded-card border border-hairline bg-surface px-5 py-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent-ink">
                    {item.title}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      <section id="proof" className="scroll-mt-24 py-20 md:py-28">
        <Container>
          <Reveal>
            <div className="max-w-3xl">
              <Eyebrow>Evidence</Eyebrow>
              <h2 className="mt-5 font-display text-4xl leading-[1.02] tracking-[-0.02em] text-ink sm:text-5xl">
                Check the receipt, not the pitch.
              </h2>
            </div>
          </Reveal>

          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-[1fr_1fr_1.2fr]">
            <Reveal>
              <div className="h-full rounded-card border border-hairline bg-surface p-6">
                <Stat value={testTotal} label="tests passing" hint="Rust + SDK + MCP + webhooks + benchmark" />
              </div>
            </Reveal>
            <Reveal delay={70}>
              <div className="h-full rounded-card border border-hairline bg-surface p-6">
                <Stat value="34" label="attack patterns" hint="CC-BY 4.0 dataset" />
              </div>
            </Reveal>
            <Reveal delay={140}>
              <div className="h-full rounded-card border border-hairline bg-surface p-6">
                <div className="flex items-center justify-between gap-3">
                  <Eyebrow>Program</Eyebrow>
                  <StatusPill tone="success">hash match</StatusPill>
                </div>
                <div className="mt-4 flex flex-col gap-3">
                  <AddressChip address={PROGRAM_ID} href={explorer.program} label="program" />
                  {CONFIG_PDA ? (
                    <AddressChip address={CONFIG_PDA} href={explorer.config} label="config" />
                  ) : null}
                </div>
                <code className="mt-4 block break-all font-mono text-[11px] leading-relaxed text-faint">
                  {BUILD_HASH}
                </code>
              </div>
            </Reveal>
          </div>

          <Reveal delay={100}>
            <div className="mt-6 rounded-card border border-hairline bg-surface p-6">
              <dl className="grid gap-x-10 md:grid-cols-2">
                <DataRow k="Cluster" v="devnet" />
                <DataRow k="Challenge bond" v="0.005 SOL" />
                <DataRow k="Decay period" v="30 days" />
                <DataRow k="License" v="MIT · no token" />
              </dl>
            </div>
          </Reveal>
        </Container>
      </section>

      <section id="benchmark" className="scroll-mt-24 border-t border-hairline bg-surface-2 py-20 md:py-28">
        <Container>
          <Reveal>
            <div className="max-w-3xl">
              <Eyebrow>{sections.benchmarkCopy.eyebrow}</Eyebrow>
              <h2 className="mt-5 font-display text-4xl leading-[1.02] tracking-[-0.02em] text-ink sm:text-5xl">
                {sections.benchmarkCopy.title}
              </h2>
              <p className="mt-6 text-lg leading-relaxed text-muted">
                {sections.benchmarkCopy.lede}
              </p>
            </div>
          </Reveal>
          <div className="mt-14">
            <BenchmarkSummary />
          </div>
          <div className="mt-10">
            <ActionLink to="/demo" kind="ghost">
              Open the benchmark explorer
            </ActionLink>
          </div>
        </Container>
      </section>

      <section id="integrate" className="scroll-mt-24 py-20 md:py-28">
        <Container>
          <Reveal>
            <div className="max-w-3xl">
              <Eyebrow>{sections.integrate.eyebrow}</Eyebrow>
              <h2 className="mt-5 font-display text-4xl leading-[1.02] tracking-[-0.02em] text-ink sm:text-5xl">
                {sections.integrate.title}
              </h2>
              <p className="mt-6 text-lg leading-relaxed text-muted">
                {sections.integrate.lede}
              </p>
            </div>
          </Reveal>
          <div className="mt-12">
            <IntegratePanel />
          </div>
        </Container>
      </section>

      <Container className="pb-24">
        <Reveal>
          <div className="relative overflow-hidden rounded-card border border-hairline bg-surface p-10 text-center md:p-16">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(600px 240px at 50% 0%, color-mix(in srgb, var(--c-accent) 12%, transparent), transparent 70%)",
              }}
            />
            <h2 className="relative font-display text-3xl leading-[1.05] tracking-[-0.02em] text-ink sm:text-4xl">
              {noTokenNote}
            </h2>
            <p className="relative mt-4 text-sm text-muted">
              Reputation you can inspect, challenge, and outlive.
            </p>
            <div className="relative mt-8 flex flex-wrap justify-center gap-3">
              <ActionLink to="/demo">Open the demo</ActionLink>
              <ActionLink to="/#proof" kind="ghost">
                Read the evidence
              </ActionLink>
            </div>
          </div>
        </Reveal>
      </Container>
    </>
  );
}
