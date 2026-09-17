# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-09-17

Initial Solana rebuild of the TAOP agent credit bureau.

### Added — program (`taop_reputation`)

- `initialize_config`, `update_config`, `set_certifier` with a configurable
  challenge bond and inactivity decay period.
- `register_agent`, `attest_completion`, `challenge_completion` (native SOL
  bond into a system-owned vault PDA), `resolve_challenge` (admin/certifier),
  `get_score` (return-data view with decay).
- Bonded capability registry: `register_capability`, `certify_capability`,
  `slash_capability`, `withdraw_capability_bond`, plus a per-type capability
  index for discovery.
- 59 Rust tests across config, reputation, capability, invariant, and security
  suites (LiteSVM, in-process).

### Added — packages

- `@taopp/solana`: `attest()`, `challenge()`, `getScore()` (local + on-chain
  verified), `discover()`, the full admin/capability surface, PDA derivation,
  and a decay function shared with the on-chain implementation.
- `@taopp/mcp-server` 0.2: dual-chain adapters so the same tools
  (`get_agent_score`, `discover_capabilities`, `attest_completion`,
  `challenge_completion`, ...) work against Solana and the previous Base
  deployment.
- `examples/solana-agent`: a runnable two-agent loop in SDK and MCP modes.

### Added — evaluation

- Gaming-resistance benchmark with five mechanisms and three attack classes
  (Sybil farming, slow-burn harvest, collusive rings), deterministic and
  reproducible in one command.
- CC BY 4.0 dataset of 34 documented adversarial agent-reputation patterns.
- Published baseline results, sensitivity tables, and methodology, including
  where this implementation scores poorly.

### Security

- Challenge and capability bonds are held in system-owned vault PDAs and moved
  only via `system_program::transfer` / `invoke_signed`.
- `resolve_challenge` sweeps the entire vault balance, so unsolicited donations
  cannot strand lamports or block challenges (new accounts must be rent-exempt
  on Solana, which bounds the smallest possible donation).
- Attack-oriented test suite covering donation handling, substituted accounts,
  unauthorized privileged operations, and re-initialization attempts.

### Deployed

- Devnet: program `8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE`, config PDA
  `B1JgvqXoGor9oGaoGUGa4cYhHn4xNLdYXVEBaCxcydVu`. The SDK example loop
  (attest → challenge → resolve, score 1 → 0) was executed against devnet and
  the capability bond was reclaimed; deployment cost 1.911 SOL of which 1.891
  SOL is recoverable rent.
