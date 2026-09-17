# Security policy

## Scope

This repository contains three security-relevant surfaces:

1. **`taop_reputation` Anchor program** (`programs/taop_reputation`) — holds
   native SOL bonds in program-derived vault accounts.
2. **`@taopp/solana` SDK** (`packages/solana`) — signs transactions with caller
   keys.
3. **`@taopp/mcp-server`** (`packages/mcp-server`) — reads keys from the
   environment to sign writes.

## Reporting a vulnerability

Please do **not** open a public issue for security problems. Use GitHub's
private vulnerability reporting:

1. Go to the repository's **Security** tab.
2. Select **Report a vulnerability**.
3. Include: affected component, version or commit, a reproduction (test or
   transaction), impact, and any suggested fix.

You will receive an acknowledgement within 7 days. We aim to provide a
remediation timeline within 14 days of confirmation. Credit is given in the
release notes unless you prefer to remain anonymous.

## Known trust boundaries (not vulnerabilities)

Documented v0.1 design decisions are listed here so reports can focus on real
defects:

- **Centralized resolution.** The `admin` and `certifier` authorities resolve
  challenges and slash capabilities. A malicious authority can resolve
  dishonestly; this is the documented v0.1 trust boundary
  (`docs/architecture.md`).
- **One challenge per completion.** After a challenge is submitted, no further
  challenges can be posted for that completion, even if rejected.
- **Capability index capacity.** The per-type index holds at most 64
  capabilities; further registrations fail with `IndexFull`.
- **Optional pause.** The admin can pause attestations, challenges, and
  capability registrations.
- **Vault donations.** Lamports sent directly to a vault PDA are swept to the
  winning destination on resolution. Donations cannot block challenges because
  Solana requires new accounts to be rent-exempt.

## Out of scope

- Testnet/devnet deployments and test keys.
- Denial of service through network-level flooding (Solana handles this).
- Issues in dependencies that are already tracked upstream.

## Known advisories (accepted)

- **CVE-2026-77465 / CVE-2026-63376 (`toml` < 4.2.0, transitive via
  `@anchor-lang/core` 1.x).** The vulnerable parser is referenced only by
  Anchor's `Workspace` helper, which reads the project's own `Anchor.toml`; no
  code path in this repository or in the published SDK parses untrusted TOML
  with it. No 3.x patch exists; the fix requires an upstream `toml` major bump.
  The root `package.json` suppresses these two advisories for
  `pnpm audit --audit-level high`, and Dependabot alerts remain enabled so the
  upstream fix is surfaced when it lands. Do not use Anchor's `Workspace`
  helper to parse untrusted TOML in the meantime.
- Moderate and low advisories in dev-only tooling (`vitest`, `esbuild`,
  `uuid`, `stream-json`) are tracked through Dependabot and are not shipped to
  consumers of `@taopp/solana`. CI fails on high and critical advisories only.

## Hardening measures

- Third-party GitHub Actions are pinned to full commit SHAs; Dependabot tracks
  updates.
- `main` requires the CI checks `Program (build + Rust tests)` and
  `Packages (SDK, MCP, example, benchmark)`, blocks force pushes and branch
  deletion, and enforces linear history.
- Secret scanning with push protection, Dependabot alerts, automated security
  fixes, and private vulnerability reporting are enabled on the repository.
- The program ships property-based score tests, compute-unit budgets, a
  randomized accounting-invariant test, and a full threat model in
  `docs/threat-model.md`.
- Config initialization is gated on the program's upgrade authority, the decay
  period is capped, and admin handover is two-step (`transfer_admin` /
  `accept_admin`).
- OpenSSF Scorecard and CodeQL run on a schedule and on every push.
- **Reproducible builds:** `./scripts/verify-build.sh` rebuilds the program in
  the pinned Anchor Docker image and compares the executable hash with the
  deployed program; a weekly workflow runs the same check in CI. The devnet
  deployment is currently hash-identical to the reproducible build.

## No bug bounty

There is no paid bug bounty at this stage. If the project receives funding for
one, this document will be updated.
