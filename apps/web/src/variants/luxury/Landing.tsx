import { useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  BUILD_HASH,
  CONFIG_PDA,
  explorer,
  heroFacts,
  noTokenNote,
  PROGRAM_ID,
  sections,
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
  Stat,
  StatusPill,
  TxLink,
} from "../../shared/primitives";
import { BenchmarkSummary, IntegratePanel } from "../../shared/panels";
import { useVariantPath } from "../../variant-context";

function Spotlight({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className={`spotlight relative ${className}`}
      onMouseMove={(event) => {
        const element = ref.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        element.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
        element.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
      }}
    >
      {children}
    </div>
  );
}

function LuxurySection({
  id,
  eyebrow,
  title,
  lede,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  lede?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 border-t border-hairline py-24 md:py-32"
      style={{ paddingTop: "var(--section-gap)", paddingBottom: "var(--section-gap)" }}
    >
      <Container>
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow className="text-accent-ink">{eyebrow}</Eyebrow>
            <h2 className="mt-6 font-display text-4xl leading-[1.08] tracking-[-0.01em] text-ink sm:text-5xl">
              {title}
            </h2>
            {lede ? (
              <p className="mt-6 text-base leading-relaxed text-muted sm:text-lg">{lede}</p>
            ) : null}
            <div className="mx-auto mt-8 h-px w-24 bg-accent" />
          </div>
        </Reveal>
        <div className="mt-16">{children}</div>
      </Container>
    </section>
  );
}

export default function LuxuryLanding() {
  const withVariant = useVariantPath();

  return (
    <>
      <Spotlight className="border-b border-hairline">
        <Container className="relative py-28 text-center md:py-40">
          <Reveal>
            <Eyebrow className="text-accent-ink">
              taop · verifiable reputation for agents
            </Eyebrow>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mx-auto mt-8 max-w-3xl font-display text-5xl leading-[1.04] tracking-[-0.01em] text-ink sm:text-6xl md:text-7xl">
              Reputation, held to account.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mx-auto mt-8 max-w-xl text-lg leading-relaxed text-muted">
              A bonded ledger of agent work on Solana. Claims are collateralized,
              disputes are priced, and quiet agents fade.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <ActionLink to="/demo">Enter the demo</ActionLink>
              <ActionLink to="/#benchmark" kind="ghost">
                Read the benchmark
              </ActionLink>
            </div>
          </Reveal>

          <Reveal delay={320}>
            <dl className="mx-auto mt-20 grid max-w-4xl grid-cols-2 gap-y-10 md:grid-cols-4">
              {heroFacts.map((fact) => (
                <div
                  key={fact.label}
                  className="flex flex-col items-center gap-2 border-hairline px-6 md:border-l md:first:border-l-0"
                >
                  <dt className="font-mono text-[10px] uppercase tracking-[0.24em] text-faint">
                    {fact.label}
                  </dt>
                  <dd className="tabular font-display text-xl text-ink">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </Container>
      </Spotlight>

      <LuxurySection id="story" eyebrow="The gap" title={sections.gap.title} lede={sections.gap.lede}>
        <div className="grid gap-12 md:grid-cols-3">
          {sections.gap.points.map((point, index) => (
            <Reveal key={point.title} delay={index * 120}>
              <article className="flex h-full flex-col gap-5">
                <span className="font-display text-3xl text-accent">
                  {["I", "II", "III"][index]}
                </span>
                <div className="h-px w-full bg-hairline-2" />
                <h3 className="font-display text-2xl tracking-[-0.01em] text-ink">
                  {point.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted">{point.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </LuxurySection>

      <LuxurySection
        id="mechanism"
        eyebrow="The mechanism"
        title={sections.fix.title}
        lede={sections.fix.lede}
      >
        <div className="grid gap-16 lg:grid-cols-[1fr_0.9fr]">
          <ol className="relative flex flex-col gap-12 border-l border-hairline-2 pl-10">
            {verifiedLoop.map((step, index) => (
              <Reveal key={step.step} as="li" delay={index * 100} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute top-2 -left-[45px] h-2.5 w-2.5 rotate-45 bg-accent"
                />
                <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent-ink">
                  {step.step} · {step.name}
                </span>
                <h3 className="mt-3 font-display text-2xl tracking-[-0.01em] text-ink">
                  {step.title}
                </h3>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
                  {step.body}
                </p>
                <div className="mt-4">
                  <TxLink signature={step.tx} />
                </div>
              </Reveal>
            ))}
          </ol>

          <div className="flex flex-col gap-10">
            {trustContract.map((item, index) => (
              <Reveal key={item.title} delay={index * 100}>
                <article className="border-t-2 border-accent pt-6">
                  <h3 className="font-display text-2xl tracking-[-0.01em] text-ink">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{item.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </LuxurySection>

      <LuxurySection
        id="proof"
        eyebrow="Evidence"
        title="Nothing here asks to be taken on faith."
        lede="Reproducible build, public devnet deployment, open tests. The hash below is identical in the Docker rebuild and on chain."
      >
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="grid grid-cols-2 gap-x-8 gap-y-12">
            <Stat value={testTotal} label="tests passing" hint="program + packages" />
            <Stat value="1" label="anchor program" hint="no protocol token" />
            <Stat value="34.6" label="benchmark composite" hint="seed 42 baseline" />
            <Stat value={`${taop.slowBurn.metrics.slashCoverage * 100}%`} label="harvest coverage" hint="published weakness" />
          </div>

          <div className="flex flex-col gap-6">
            <div className="border border-hairline-2 bg-surface p-6" style={{ boxShadow: "var(--shadow-card)" }}>
              <Eyebrow className="text-accent-ink">Program</Eyebrow>
              <div className="mt-5 flex flex-col gap-3">
                <AddressChip address={PROGRAM_ID} href={explorer.program} label="program" />
                {CONFIG_PDA ? (
                  <AddressChip address={CONFIG_PDA} href={explorer.config} label="config" />
                ) : null}
              </div>
              <dl className="mt-6 flex flex-col">
                <DataRow k="Cluster" v="devnet" />
                <DataRow k="Challenge bond" v="0.005 SOL" />
                <DataRow k="Decay period" v="30 days" />
                <DataRow k="License" v="MIT" />
              </dl>
            </div>
            <div className="border border-hairline-2 bg-surface p-6">
              <div className="flex items-center justify-between gap-3">
                <Eyebrow className="text-accent-ink">Reproducible build</Eyebrow>
                <StatusPill tone="success">hash match</StatusPill>
              </div>
              <code className="mt-4 block break-all font-mono text-[11px] leading-relaxed text-muted">
                {BUILD_HASH}
              </code>
            </div>
          </div>
        </div>
      </LuxurySection>

      <LuxurySection
        id="benchmark"
        eyebrow="Benchmark"
        title={sections.benchmarkCopy.title}
        lede={sections.benchmarkCopy.lede}
      >
        <BenchmarkSummary />
        <div className="mt-12 text-center">
          <ActionLink to="/demo" kind="ghost">
            Open the benchmark explorer
          </ActionLink>
        </div>
      </LuxurySection>

      <LuxurySection
        id="integrate"
        eyebrow="Integrate"
        title={sections.integrate.title}
        lede={sections.integrate.lede}
      >
        <div className="mx-auto max-w-3xl">
          <IntegratePanel />
        </div>
      </LuxurySection>

      <section className="border-t border-hairline bg-canvas-2">
        <Container className="flex flex-col items-center gap-6 py-24 text-center">
          <h2 className="max-w-2xl font-display text-3xl leading-[1.1] text-ink sm:text-4xl">
            Read the program before you trust the score.
          </h2>
          <p className="text-sm text-muted">{noTokenNote}</p>
          <div className="flex flex-wrap justify-center gap-4">
            <ActionLink to="/demo">Enter the demo</ActionLink>
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
