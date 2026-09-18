import { Link } from "react-router-dom";
import {
  BUILD_HASH,
  CONFIG_PDA,
  explorer,
  heroFacts,
  noTokenNote,
  PROGRAM_ID,
  sections,
  testSuite,
  testTotal,
  trustContract,
  verifiedLoop,
} from "../../content";
import { taop } from "../../lib/benchmark";
import {
  ActionLink,
  AddressChip,
  Container,
  DataRow,
  Eyebrow,
  Reveal,
  Section,
  Stat,
  StatusPill,
  TxLink,
} from "../../shared/primitives";
import { BenchmarkSummary, IntegratePanel } from "../../shared/panels";
import { useVariantPath } from "../../variant-context";

export default function MinimalLanding() {
  const withVariant = useVariantPath();

  return (
    <>
      <Container className="pt-16 pb-20 md:pt-24 md:pb-28">
        <Reveal>
          <Eyebrow>
            <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" />
            verifiable reputation for agents · solana devnet
          </Eyebrow>
        </Reveal>
        <Reveal delay={60}>
          <h1 className="mt-7 max-w-4xl font-display text-[2.6rem] leading-[1.02] tracking-[-0.035em] text-ink sm:text-6xl md:text-7xl">
            Trust between agents, settled on chain.
          </h1>
        </Reveal>
        <Reveal delay={120}>
          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted">
            TAOP turns completion claims into bonded, challengeable events. Reputation
            decays when an agent goes quiet, and the mechanism that keeps it honest —
            including where it loses — is public.
          </p>
        </Reveal>
        <Reveal delay={180}>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <ActionLink to="/demo">Run the live demo</ActionLink>
            <ActionLink to="/#proof" kind="ghost">
              Read the evidence
            </ActionLink>
            <a
              href={explorer.program}
              target="_blank"
              rel="noreferrer noopener"
              className="px-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted transition-colors hover:text-ink"
            >
              Program on explorer ↗
            </a>
          </div>
        </Reveal>

        <Reveal delay={240}>
          <dl className="mt-16 grid grid-cols-2 border-t border-hairline md:grid-cols-4">
            {heroFacts.map((fact, index) => (
              <div
                key={fact.label}
                className={`flex flex-col gap-2 border-b border-hairline py-5 md:border-b-0 ${
                  index > 0 ? "md:border-l md:border-hairline md:pl-6" : "md:pr-6"
                }`}
              >
                <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
                  {fact.label}
                </dt>
                <dd className="tabular font-mono text-[13px] text-ink">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </Container>

      <Section
        id="story"
        index="01"
        eyebrow="The gap"
        title={sections.gap.title}
        lede={sections.gap.lede}
      >
        <div className="grid gap-px overflow-hidden rounded-card border border-hairline bg-hairline md:grid-cols-3">
          {sections.gap.points.map((point, index) => (
            <Reveal key={point.title} delay={index * 80} className="bg-surface">
              <div className="flex h-full flex-col gap-3 p-6">
                <span className="font-mono text-[11px] tracking-[0.18em] text-accent-ink">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="font-display text-xl tracking-[-0.01em] text-ink">
                  {point.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted">{point.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section
        id="mechanism"
        index="02"
        eyebrow="The mechanism"
        title={sections.fix.title}
        lede={sections.fix.lede}
      >
        <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <ol className="flex flex-col">
            {verifiedLoop.map((step, index) => (
              <Reveal
                key={step.step}
                as="li"
                delay={index * 70}
                className="grid grid-cols-[48px_1fr] gap-4 border-t border-hairline py-6 first:border-t-0"
              >
                <span className="font-mono text-[11px] tracking-[0.18em] text-accent-ink">
                  {step.step}
                </span>
                <div>
                  <h3 className="font-display text-xl tracking-[-0.01em] text-ink">
                    {step.name}
                  </h3>
                  <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                    {step.title}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{step.body}</p>
                  <div className="mt-3">
                    <TxLink signature={step.tx} />
                  </div>
                </div>
              </Reveal>
            ))}
          </ol>

          <Reveal delay={120}>
            <div className="flex flex-col gap-px overflow-hidden rounded-card border border-hairline bg-hairline">
              {trustContract.map((point) => (
                <div key={point.title} className="bg-surface p-5">
                  <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink">
                    {point.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{point.body}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </Section>

      <Section
        id="proof"
        index="03"
        eyebrow="Evidence"
        title="Everything here is checkable from a clean checkout."
        lede="No dashboard numbers to take on faith: the program is deployed on devnet, the build is reproducible, and the benchmark publishes its own failures."
      >
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
            <Stat value={testTotal} label="tests passing" hint="program + packages" />
            <Stat value={34} label="attack patterns" hint="CC-BY dataset" />
            <Stat value="1" label="anchor program" hint="no token" />
            {testSuite.map((suite) => (
              <Stat key={suite.label} value={suite.count} label={suite.label} hint={suite.detail} />
            ))}
          </div>

          <div className="flex flex-col gap-5">
            <div className="rounded-card border border-hairline bg-surface p-5">
              <Eyebrow>Program</Eyebrow>
              <div className="mt-4 flex flex-col gap-3">
                <AddressChip address={PROGRAM_ID} href={explorer.program} label="program" />
                {CONFIG_PDA ? (
                  <AddressChip address={CONFIG_PDA} href={explorer.config} label="config" />
                ) : null}
              </div>
              <dl className="mt-5 flex flex-col">
                <DataRow k="Cluster" v="devnet" />
                <DataRow k="Score formula" v="max(0, c − d) >> halvings" />
                <DataRow k="Composite" v={`${taop.scores.composite.toFixed(1)} / 100`} />
              </dl>
            </div>
            <div className="rounded-card border border-hairline bg-surface p-5">
              <div className="flex items-center justify-between gap-3">
                <Eyebrow>Reproducible build</Eyebrow>
                <StatusPill tone="success">hash match</StatusPill>
              </div>
              <code className="mt-3 block break-all font-mono text-[11px] leading-relaxed text-muted">
                {BUILD_HASH}
              </code>
            </div>
          </div>
        </div>
      </Section>

      <Section
        id="benchmark"
        index="04"
        eyebrow="Benchmark"
        title={sections.benchmarkCopy.title}
        lede={sections.benchmarkCopy.lede}
      >
        <BenchmarkSummary />
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <ActionLink to="/demo" kind="ghost">
            Open the benchmark explorer
          </ActionLink>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
            seed 42 · published
          </span>
        </div>
      </Section>

      <Section
        id="integrate"
        index="05"
        eyebrow="Integrate"
        title={sections.integrate.title}
        lede={sections.integrate.lede}
      >
        <IntegratePanel />
      </Section>

      <section className="border-t border-hairline bg-surface-2">
        <Container className="flex flex-col items-start justify-between gap-6 py-16 md:flex-row md:items-center">
          <div>
            <h2 className="font-display text-2xl tracking-[-0.02em] text-ink md:text-3xl">
              Read the program before you trust the score.
            </h2>
            <p className="mt-2 text-sm text-muted">{noTokenNote}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ActionLink to="/demo">Open the demo</ActionLink>
            <Link
              to={withVariant("/#proof")}
              className="inline-flex items-center rounded-btn border border-hairline-2 px-4 py-2.5 font-mono text-[12px] uppercase tracking-[0.14em] text-ink transition-colors hover:border-ink"
            >
              Verification steps
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}
