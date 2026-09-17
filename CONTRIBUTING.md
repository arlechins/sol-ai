# Contributing

Thanks for helping improve agent reputation infrastructure.

## Layout

| Path | What it is |
|---|---|
| `programs/taop_reputation` | Anchor program (Rust) + LiteSVM integration tests |
| `packages/solana` | `@taopp/solana` TypeScript SDK |
| `packages/mcp-server` | `@taopp/mcp-server` MCP tools (Solana + Base adapters) |
| `examples/solana-agent` | Runnable two-agent trust loop |
| `benchmark` | Gaming-resistance harness + adversarial dataset |
| `docs` | Architecture, account layout, tutorial, methodology |

## Development setup

Prerequisites: Rust stable, Solana CLI 4.2.x, Anchor CLI 1.1.2, Node 20+,
pnpm 9. See `docs/tutorial.md` for exact install commands.

```bash
anchor build && ./scripts/sync-idl.sh   # required before any Rust/SDK tests
pnpm install
```

## Before you open a pull request

Run the full pre-flight:

```bash
./scripts/check.sh
```

It runs formatting, clippy, program build, IDL-sync verification, the Rust
suite, package typechecks/builds/tests, and a benchmark smoke run. CI runs the
same checks plus a local-validator end-to-end job.

Individual suites:

```bash
cargo test --workspace                              # program (59 tests)
./scripts/localnet.sh                               # validator + deploy
pnpm --filter @taopp/solana test                    # SDK (12 tests)
pnpm --filter @taopp/mcp-server test                # MCP (3 tests)
pnpm --filter @taopp/benchmark test                 # benchmark (9 tests)
```

## Rules of the road

- **A program change requires a test.** Bond accounting, authority checks, and
  vault invariants must stay covered; `tests/security.rs` is the place for
  attack-oriented cases.
- **Re-run `./scripts/sync-idl.sh` after any program change** and commit the
  updated IDL in `programs/taop_reputation/idls/` and
  `packages/solana/src/idl/`. CI fails if they drift.
- **Never commit keys or `.env`.** The repository gitignores keypair JSON and
  env files.
- **Docs use the same commands the scripts expose**, not invented ones.
- **Keep the benchmark honest.** If a mechanism scores worse than before, update
  `docs/methodology.md` with the reason rather than tuning the rubric silently.
- **Dataset entries need sources.** Add patterns to
  `benchmark/dataset/patterns.json` with a conservative `confidence` label.

## Commit style

Short imperative subjects (`program: sweep vault donations on resolve`). Keep
program, SDK, and docs changes in separate commits when practical.

## License

Code is MIT. Dataset contributions are licensed CC BY 4.0. By contributing you
agree to license your work under these terms.
