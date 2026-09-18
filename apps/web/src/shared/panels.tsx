import { useState, type ReactNode } from "react";
import {
  BUILD_HASH,
  benchmarkArtifacts,
  CONFIG_PDA,
  DEPLOYED_AT,
  explorer,
  REPO,
  sections,
  verifiedLoop,
} from "../content";
import {
  best,
  benchmarkMeta,
  benchmarkParams,
  classOrder,
  isDetected,
  ranked,
  rows as mechanismRows,
  taop,
} from "../lib/benchmark";
import {
  durationFromSeconds,
  formatNumber,
  formatPercent,
  formatSol,
  relativeTime,
  shortKey,
} from "../lib/format";
import type { DemoController } from "./useDemoController";
import {
  AddressChip,
  CodeBlock,
  CopyButton,
  DataRow,
  DecaySparkline,
  EmptyNote,
  ErrorNote,
  Eyebrow,
  ScoreMeter,
  Skeleton,
  StatusPill,
  Stat,
  TxLink,
} from "./primitives";

/* ------------------------------------------------------------ program */

export function ProgramPanel({ controller }: { controller: DemoController }) {
  const { config } = controller;
  const data = config.data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {data ? (
          data.paused ? (
            <StatusPill tone="warn">paused</StatusPill>
          ) : (
            <StatusPill tone="success">live on devnet</StatusPill>
          )
        ) : (
          <StatusPill>reading devnet…</StatusPill>
        )}
        <StatusPill tone="info">reproducible build</StatusPill>
      </div>

      {config.status === "loading" && !data ? <Skeleton lines={5} /> : null}

      {config.error && !data ? (
        <ErrorNote onRetry={config.refresh}>
          Could not read the config account: {config.error}
        </ErrorNote>
      ) : null}

      {data ? (
        <>
          <dl className="flex flex-col">
            <DataRow k="Program" v={<AddressChip address={data.programId} href={explorer.program} />} />
            <DataRow
              k="Config PDA"
              v={
                CONFIG_PDA ? (
                  <AddressChip address={CONFIG_PDA} href={explorer.config} />
                ) : (
                  "—"
                )
              }
            />
            <DataRow k="Challenge bond" v={formatSol(data.challengeBondLamports)} />
            <DataRow k="Decay period" v={durationFromSeconds(data.decayPeriodSecs)} />
            <DataRow k="Completions" v={formatNumber(data.nextCompletionId)} />
            <DataRow k="Capabilities" v={formatNumber(data.nextCapabilityId)} />
            <DataRow k="Certifier" v={<AddressChip address={data.certifier} />} />
            <DataRow k="Treasury" v={<AddressChip address={data.treasury} />} />
            <DataRow k="RPC" v={shortKey(data.rpcUrl.replace("https://", ""), 18, 8)} />
            <DataRow k="Deployed" v={DEPLOYED_AT ? relativeTime(Date.parse(DEPLOYED_AT) / 1000) : "—"} />
          </dl>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={config.refresh}
              className="rounded-btn border border-hairline-2 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted transition-colors hover:border-ink hover:text-ink"
            >
              Refresh
            </button>
            {config.stale ? (
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-warn">
                showing cached values
              </span>
            ) : null}
          </div>
        </>
      ) : null}

      <div className="rounded-card border border-hairline bg-surface-2 p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          Build fingerprint
        </p>
        <div className="mt-2 flex items-center gap-3">
          <code className="truncate font-mono text-[11px] text-ink">{BUILD_HASH}</code>
          <CopyButton value={BUILD_HASH} label="Hash" />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          The artifact hash is identical in the Docker rebuild and on chain.{" "}
          <a
            href={`${REPO}/blob/main/docs/grant-verification.md`}
            target="_blank"
            rel="noreferrer noopener"
            className="text-accent-ink hover:underline"
          >
            Verification steps ↗
          </a>
        </p>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- score */

export function ScoreLab({ controller }: { controller: DemoController }) {
  const { score, config } = controller;
  const periodSecs = config.data?.decayPeriodSecs ?? 2_592_000;

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          score.lookup();
        }}
        className="flex flex-col gap-3 sm:flex-row"
      >
        <label className="flex-1">
          <span className="sr-only">Agent address</span>
          <input
            value={score.address}
            onChange={(event) => score.setAddress(event.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder="agent wallet address"
            className="w-full rounded-btn border border-hairline bg-surface px-3.5 py-3 font-mono text-[12px] text-ink outline-none transition-colors placeholder:text-faint focus:border-ink"
          />
        </label>
        <button
          type="submit"
          className="rounded-btn bg-ink px-5 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-canvas transition-colors hover:bg-accent hover:text-on-accent"
        >
          {score.status === "loading" ? "Reading…" : "Read score"}
        </button>
      </form>

      {score.status === "loading" && !score.data ? <Skeleton lines={4} /> : null}

      {score.error && !score.data ? (
        <ErrorNote onRetry={score.refresh}>{score.error}</ErrorNote>
      ) : null}

      {score.data ? (
        <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
          <div className="flex min-w-[220px] flex-col gap-5">
            <ScoreMeter
              score={score.data.score}
              max={Math.max(score.data.completions, 1)}
              label={
                score.data.decayed ? `decayed · ${score.math?.halvings ?? 0} halvings` : "score"
              }
            />
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={score.data.decayed ? "warn" : "success"}>
                {score.data.decayed ? "decaying" : "current"}
              </StatusPill>
              <AddressChip address={score.data.address} href={explorer.address(score.data.address)} />
            </div>
          </div>

          <dl className="flex flex-col">
            <DataRow k="Completions" v={formatNumber(score.data.completions)} />
            <DataRow k="Upheld disputes" v={formatNumber(score.data.disputes)} />
            <DataRow k="Net before decay" v={formatNumber(score.math?.net ?? 0)} />
            <DataRow k="Last activity" v={relativeTime(score.data.lastActivity)} />
            <DataRow k="Elapsed" v={durationFromSeconds(score.math?.elapsedSecs ?? 0)} />
            <DataRow
              k="Next halving in"
              v={durationFromSeconds(score.math?.nextHalvingInSecs ?? periodSecs)}
            />
            <DataRow k="Formula" v="max(0, completions − disputes) >> halvings" />
          </dl>

          <div className="lg:col-span-2">
            <div className="flex items-center justify-between gap-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                projected decay · next 3 periods
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
                period {durationFromSeconds(periodSecs)}
              </p>
            </div>
            <DecaySparkline
              base={score.math?.net ?? 0}
              lastActivity={score.data.lastActivity}
              decayPeriodSecs={periodSecs}
              now={controller.now}
              className="mt-3 h-14 w-full"
            />
          </div>
        </div>
      ) : null}

      {score.stale ? (
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-warn">
          showing cached score · {score.error}
        </p>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------- discovery */

export function DiscoveryPanel({ controller }: { controller: DemoController }) {
  const { discovery } = controller;
  const items = discovery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          discovery.search();
        }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <label className="flex-1">
          <span className="sr-only">Capability type</span>
          <input
            value={discovery.type}
            onChange={(event) => discovery.setType(event.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder="capability type, e.g. LoRA"
            className="w-full rounded-btn border border-hairline bg-surface px-3.5 py-3 font-mono text-[12px] text-ink outline-none transition-colors placeholder:text-faint focus:border-ink"
          />
        </label>
        <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          <input
            type="checkbox"
            checked={discovery.includeUncertified}
            onChange={(event) => discovery.setIncludeUncertified(event.target.checked)}
            className="h-4 w-4 accent-current"
          />
          include uncertified
        </label>
        <button
          type="submit"
          className="rounded-btn bg-ink px-5 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-canvas transition-colors hover:bg-accent hover:text-on-accent"
        >
          {discovery.status === "loading" ? "Scanning…" : "Discover"}
        </button>
      </form>

      {discovery.status === "loading" && !discovery.data ? <Skeleton lines={4} /> : null}

      {discovery.error && !discovery.data ? (
        <ErrorNote onRetry={discovery.refresh}>
          {discovery.error}. The public devnet RPC rate-limits account scans; try again
          or point the demo at your own RPC with{" "}
          <code className="font-mono text-[11px]">VITE_SOLANA_RPC_URL</code>.
        </ErrorNote>
      ) : null}

      {discovery.data && items.length === 0 ? (
        <EmptyNote>
          Nothing certified for <strong className="font-mono">{discovery.type}</strong> yet.
          Register a capability with{" "}
          <code className="font-mono text-[12px]">client.registerCapability()</code> and the
          certifier can make it discoverable.
        </EmptyNote>
      ) : null}

      {items.length > 0 ? (
        <>
          <div className="hidden md:block">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">
                Discovered capabilities ranked by creator score
              </caption>
              <thead>
                <tr className="border-b border-hairline-2">
                  {["Agent", "Capability", "Bond", "Certified", "Score"].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.capability} className="border-b border-hairline">
                    <td className="py-3 pr-4">
                      <a
                        href={explorer.address(item.agent)}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="font-mono text-[12px] text-ink hover:text-accent-ink"
                      >
                        {shortKey(item.agent, 5, 5)}
                      </a>
                    </td>
                    <td className="py-3 pr-4 font-mono text-[12px] text-muted">
                      {shortKey(item.capability, 5, 5)}
                    </td>
                    <td className="py-3 pr-4 font-mono text-[12px] text-ink">
                      {formatSol(item.bondLamports)}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusPill tone={item.certified ? "success" : "neutral"}>
                        {item.certified ? "certified" : "uncertified"}
                      </StatusPill>
                    </td>
                    <td className="tabular py-3 font-mono text-[13px] text-ink">
                      {item.score}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 md:hidden">
            {items.map((item) => (
              <div
                key={item.capability}
                className="rounded-card border border-hairline bg-surface p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[12px] text-ink">
                    {shortKey(item.agent, 5, 5)}
                  </span>
                  <StatusPill tone={item.certified ? "success" : "neutral"}>
                    {item.certified ? "certified" : "uncertified"}
                  </StatusPill>
                </div>
                <div className="mt-3 flex items-center justify-between font-mono text-[11px] text-muted">
                  <span>bond {formatSol(item.bondLamports)}</span>
                  <span className="tabular text-ink">score {item.score}</span>
                </div>
              </div>
            ))}
          </div>

          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
            {items.length} result{items.length === 1 ? "" : "s"} · ranked by creator score
          </p>
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ timeline */

export function TimelinePanel() {
  return (
    <ol className="flex flex-col">
      {verifiedLoop.map((step, index) => (
        <li key={step.step} className="grid gap-4 border-b border-hairline py-6 md:grid-cols-[64px_1fr_auto]">
          <span className="font-mono text-[11px] tracking-[0.18em] text-accent-ink">
            {step.step}
          </span>
          <div>
            <h3 className="font-display text-xl tracking-[-0.01em] text-ink">{step.name}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">{step.title}</p>
            {index === verifiedLoop.length - 1 ? (
              <p className="mt-2 text-xs leading-relaxed text-faint">
                The full loop below ran on devnet with real bonds.
              </p>
            ) : null}
          </div>
          <div className="md:text-right">
            <TxLink signature={step.tx} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ----------------------------------------------------------- benchmark */

export function BenchmarkSummary() {
  return (
    <div className="grid gap-5 sm:grid-cols-3">
      <Stat value={`${taop.scores.composite.toFixed(1)}`} label="TAOP composite / 100" hint="seed 42 baseline" />
      <Stat value={`${taop.scores.collusiveRing.toFixed(1)}`} label="Collusion resistance" hint="ring manufactures nothing" />
      <Stat value={`${taop.scores.sybilFarming.toFixed(1)}`} label="Sybil resistance" hint="self-attestation is cheap" />
      <div className="sm:col-span-3">
        <div className="rounded-card border border-hairline bg-surface p-5">
          <Eyebrow>Where this loses</Eyebrow>
          <ul className="mt-3 flex flex-col gap-2">
            {taop.weakSpots.map((spot) => (
              <li key={spot} className="flex gap-3 text-sm leading-relaxed text-muted">
                <span aria-hidden="true" className="text-accent-ink">
                  ×
                </span>
                {spot}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function BenchmarkPanel() {
  const hasDetectors = mechanismRows.some(isDetected);

  return (
    <div className="flex flex-col gap-10">
      <p className="max-w-3xl text-sm leading-relaxed text-muted">
        {sections.benchmarkCopy.rubric}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <caption className="sr-only">
            Composite resistance scores by mechanism and attack class
          </caption>
          <thead>
            <tr className="border-b border-hairline-2">
              <th scope="col" className="py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                Mechanism
              </th>
              {classOrder.map((item) => (
                <th
                  key={item.key}
                  scope="col"
                  className="py-2.5 text-right font-mono text-[10px] uppercase tracking-[0.16em] text-muted"
                >
                  {item.short}
                </th>
              ))}
              <th scope="col" className="py-2.5 text-right font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                Composite
              </th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((row) => (
              <tr
                key={row.id}
                className={`border-b border-hairline ${row.isTaop ? "bg-surface-2" : ""}`}
              >
                <th scope="row" className="py-3.5 pr-4 text-left">
                  <span className="flex items-center gap-2 font-display text-base text-ink">
                    {row.label}
                    {row.isTaop ? <StatusPill tone="info">this program</StatusPill> : null}
                  </span>
                  <span className="mt-1 block max-w-md text-xs leading-relaxed text-faint">
                    {row.blurb}
                  </span>
                </th>
                {classOrder.map((item) => (
                  <td key={item.key} className="tabular py-3.5 text-right font-mono text-[13px] text-ink">
                    {row.scores[item.key].toFixed(1)}
                  </td>
                ))}
                <td className="py-3.5 text-right">
                  <span className="tabular font-mono text-[15px] text-ink">
                    {row.scores.composite.toFixed(1)}
                  </span>
                  <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-pill bg-surface-2">
                    <span
                      className={`block h-full ${row.isTaop ? "bg-accent" : "bg-hairline-2"}`}
                      style={{ width: `${row.scores.composite}%` }}
                    />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-card border border-hairline bg-surface p-5">
          <Eyebrow>Class detail</Eyebrow>
          <dl className="mt-3 flex flex-col">
            <DataRow k="Slow-burn reachable" v={taop.slowBurn.metrics.reachable ? "yes" : "no"} />
            <DataRow
              k="Days to threshold"
              v={formatNumber(taop.slowBurn.metrics.daysToThreshold ?? 0)}
            />
            <DataRow
              k="Bond coverage of harvest"
              v={formatPercent(taop.slowBurn.metrics.slashCoverage)}
            />
            <DataRow
              k="Net attacker profit"
              v={formatSol(taop.slowBurn.metrics.netAttackerProfitLamports)}
            />
            <DataRow
              k="Cost per sybil point"
              v={formatSol(taop.sybil.metrics.costPerPointLamports, 6)}
            />
            <DataRow
              k="Honest cost per point"
              v={formatSol(taop.sybil.metrics.honestCostPerPointLamports, 6)}
            />
            <DataRow
              k="Ring score per member"
              v={formatNumber(taop.collusion.metrics.ringScorePerAgent)}
            />
            <DataRow
              k="Detector ensemble"
              v={isDetected(taop) ? "present" : "none (no rating graph)"}
            />
          </dl>
        </div>

        <div className="flex flex-col gap-6">
          <div className="rounded-card border border-hairline bg-surface p-5">
            <Eyebrow>Dataset</Eyebrow>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <Stat value={benchmarkArtifacts.dataset.patterns} label="patterns" />
              <Stat
                value={Object.keys(benchmarkArtifacts.dataset.attackClasses).length}
                label="attack classes"
              />
              <Stat value={benchmarkArtifacts.dataset.version} label="dataset version" />
              <Stat value="CC-BY-4.0" label="license" />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              {benchmarkArtifacts.dataset.name}.{" "}
              <a
                href={benchmarkArtifacts.datasetUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-accent-ink hover:underline"
              >
                Browse the dataset ↗
              </a>
            </p>
          </div>

          <div className="rounded-card border border-hairline bg-surface p-5">
            <Eyebrow>Baseline</Eyebrow>
            <dl className="mt-3 flex flex-col">
              <DataRow k="Seed" v={String(benchmarkMeta.seed)} />
              <DataRow k="Generated" v={relativeTime(Date.parse(benchmarkMeta.generatedAt) / 1000)} />
              <DataRow k="Challenge bond" v={formatSol(benchmarkParams.bondLamports, 6)} />
              <DataRow
                k="Decay period"
                v={durationFromSeconds(benchmarkParams.decayPeriodSecs)}
              />
              <DataRow k="Best composite" v={`${best.label} · ${best.scores.composite.toFixed(1)}`} />
            </dl>
            <a
              href={benchmarkArtifacts.results}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-4 inline-flex font-mono text-[11px] uppercase tracking-[0.16em] text-accent-ink hover:underline"
            >
              Full report ↗
            </a>
          </div>
        </div>
      </div>

      {hasDetectors ? (
        <div className="rounded-card border border-hairline bg-surface p-5">
          <Eyebrow>Detector ensemble (graph-recording mechanisms only)</Eyebrow>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <thead>
                <tr className="border-b border-hairline-2">
                  {["Detector", "Flagged", "Precision", "Recall", "F1"].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="py-2.5 pr-4 font-mono text-[10px] uppercase tracking-[0.16em] text-muted"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mechanismRows
                  .find((row) => isDetected(row))!
                  .collusion.metrics.detectors.map((detector) => (
                    <tr key={detector.name} className="border-b border-hairline">
                      <th scope="row" className="py-3 pr-4 text-left font-mono text-[12px] text-ink">
                        {detector.name}
                      </th>
                      <td className="tabular py-3 pr-4 font-mono text-[12px] text-muted">
                        {detector.flagged}
                      </td>
                      <td className="tabular py-3 pr-4 font-mono text-[12px] text-ink">
                        {detector.precision.toFixed(2)}
                      </td>
                      <td className="tabular py-3 pr-4 font-mono text-[12px] text-ink">
                        {detector.recall.toFixed(2)}
                      </td>
                      <td className="tabular py-3 font-mono text-[12px] text-ink">
                        {detector.f1.toFixed(2)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted">
            TAOP records no rating graph, so the ring has nothing to inflate — immunity by
            omission, not detection. That trade is deliberate and published.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ integrate */

export function IntegratePanel() {
  const [active, setActive] = useState(sections.integrate.snippets[0].id);
  const snippet =
    sections.integrate.snippets.find((item) => item.id === active) ??
    sections.integrate.snippets[0];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Integration examples">
        {sections.integrate.snippets.map((item) => (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={item.id === active}
            onClick={() => setActive(item.id)}
            className={`rounded-pill border px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors ${
              item.id === active
                ? "border-ink bg-ink text-canvas"
                : "border-hairline text-muted hover:border-ink hover:text-ink"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <CodeBlock code={snippet.code} label={snippet.label} />
    </div>
  );
}

/* --------------------------------------------------------------- misc */

export function Panel({
  id,
  index,
  title,
  description,
  children,
  aside,
}: {
  id?: string;
  index?: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-hairline py-12 md:py-16">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">
            {index ? <span className="text-accent-ink">{index} / </span> : null}
            {title}
          </h2>
          {description ? (
            <p className="mt-3 text-sm leading-relaxed text-muted">{description}</p>
          ) : null}
        </div>
        {aside}
      </div>
      <div className="mt-8">{children}</div>
    </section>
  );
}
