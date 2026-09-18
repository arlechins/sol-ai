import {
  BenchmarkPanel,
  DiscoveryPanel,
  IntegratePanel,
  Panel,
  ProgramPanel,
  ScoreLab,
  TimelinePanel,
} from "../../shared/panels";
import { Container, Eyebrow, Reveal, StatusPill } from "../../shared/primitives";
import { useDemoController } from "../../shared/useDemoController";
import { explorer } from "../../content";

export default function MinimalDemo() {
  const controller = useDemoController();

  return (
    <Container className="pt-14 pb-24 md:pt-20">
      <Reveal>
        <Eyebrow>Live demo · read-only · no wallet required</Eyebrow>
        <h1 className="mt-5 max-w-3xl font-display text-4xl leading-[1.05] tracking-[-0.03em] text-ink sm:text-5xl">
          Read the program, not our marketing.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted">
          Every panel below reads the deployed devnet program through{" "}
          <code className="font-mono text-[13px] text-ink">@taopp/solana</code>. Nothing
          is mocked and no wallet is connected — writes stay in your own terminal.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <div className="mt-7 flex flex-wrap items-center gap-2">
          <StatusPill tone="success">
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-success-ink align-middle" />
            devnet
          </StatusPill>
          <StatusPill tone="info">read-only</StatusPill>
          <a
            href={explorer.program}
            target="_blank"
            rel="noreferrer noopener"
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted underline decoration-dotted underline-offset-4 hover:text-ink"
          >
            view program ↗
          </a>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
            rpc {controller.rpcUrl.replace("https://", "")}
          </span>
        </div>
      </Reveal>

      <div className="mt-10 grid gap-x-12 lg:grid-cols-2">
        <Panel
          index="01"
          title="Program status"
          description="Config PDA, bonds, counters, and the reproducible-build fingerprint — read live from devnet."
        >
          <ProgramPanel controller={controller} />
        </Panel>

        <Panel
          index="02"
          title="Trust loop"
          description="The exact devnet transactions behind the score: attest, challenge, resolve."
        >
          <TimelinePanel />
        </Panel>
      </div>

      <Panel
        index="03"
        title="Score lab"
        description="Paste any agent address. The score is computed locally from chain state with the same decay arithmetic as the on-chain instruction."
      >
        <ScoreLab controller={controller} />
      </Panel>

      <Panel
        index="04"
        title="Capability discovery"
        description="Certified capabilities ranked by creator score. Requires a graph-free account scan, which the public devnet RPC may throttle."
      >
        <DiscoveryPanel controller={controller} />
      </Panel>

      <Panel
        index="05"
        title="Benchmark explorer"
        description="Six mechanisms against sybil farming, slow-burn harvest, and collusive rings — including the columns where TAOP loses."
      >
        <BenchmarkPanel />
      </Panel>

      <Panel
        index="06"
        title="Integrate"
        description="Drop the SDK or MCP server into your agent runtime."
      >
        <IntegratePanel />
      </Panel>
    </Container>
  );
}
