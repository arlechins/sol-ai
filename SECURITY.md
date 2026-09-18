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

## Dependency advisories

CI fails on high and critical advisories (`pnpm audit --audit-level high`), and
the repository carries no blanket suppressions. Current state:

- **Resolved 2026-09-18 (high):** `CVE-2026-77465` / `CVE-2026-63376`
  (`toml` < 4.2.0 via `@anchor-lang/core`) — fixed with
  `pnpm.overrides: toml@<4.1.2 -> ^4.3.0`.
- **Resolved 2026-09-18:** `uuid` 8.3.2 (via `jayson`) pinned to `^11.1.1` by
  override; jayson only calls `uuid.v4`, and 11.x still ships a CJS entry
  (verified against the full SDK suite and the local example loop).
- **Resolved 2026-09-18:** `esbuild` 0.27.7 (via `tsup`/`bundle-require`)
  pinned to `^0.28.1`; every package build re-verified.
- **Resolved 2026-09-18:** `vitest` 3.2.7 (`@vitest/mocker` path traversal)
  upgraded to 4.1.11; coverage baselines were re-recorded for v4's stricter
  counting (`coverage-baseline.json` documents the re-baseline).
- **Accepted (moderate):** `stream-json` 1.9.1 via `jayson`, a runtime
  dependency of `@solana/web3.js`. The advisory is a DoS in filter utilities
  used only while parsing JSON-RPC responses from the configured endpoint;
  stream-json 3.x renamed the PascalCase subpaths jayson requires, so an
  override would break the RPC client. Dependabot tracks it; revisit when
  jayson or `@solana/web3.js` moves to 3.x.

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
- **CI supply chain:** workflows are SHA-pinned with `sha_pinning_required`
  enabled and an explicit allowlist of permitted actions; workflow tokens
  default to `contents: read`. `cargo-deny` enforces a license allowlist,
  wildcard bans, and registry-only sources.
- **Fuzzing:** `fuzz/` carries cargo-fuzz targets for the score function, the
  ProgramData parser, and account decoding; the harness compiles on every push
  and the targets run for two minutes each in a weekly workflow.
- **Test-strength probes:** a curated mutation spot-check rebuilds the program
  with seeded faults (decay, pause, bond accounting, unauthorized
  resolve/certify/slash, upgrade-authority gating) and fails if the suite does
  not catch every one; a compute-unit snapshot in `cargo test --workspace`
  fails on instruction-cost regressions.
- **Coverage ratchet:** SDK and web coverage baselines are enforced in CI and
  can only go up (`coverage-baseline.json`).
- **Secret history:** gitleaks (checksum-pinned) scans the full git history on
  every push, with a narrow allowlist for the intentionally committed
  program-ID keypair.
- **Deployment drift:** the scheduled healthcheck recomputes the on-chain
  executable hash with the `solana-verify` algorithm and fails when it no
  longer matches the pinned reproducible build; it can also pin the expected
  upgrade authority (`TAOP_EXPECTED_UPGRADE_AUTHORITY`).
- **Website:** the Cloudflare Pages `_headers` file sets CSP, HSTS, frame
  denial, and a restrictive permissions policy; a test fails the build when
  those headers regress.
- **Webhooks:** deliveries are signed over `<timestamp>.<raw body>` and
  verification fails closed when the timestamp is missing or outside the
  5-minute default tolerance; receivers de-duplicate on `x-taop-delivery`.
- **Release provenance:** `.github/workflows/release.yml` publishes packages via
  npm trusted publishing (OIDC) with provenance attestations.
- **Reproducible builds:** `./scripts/verify-build.sh` rebuilds the program in
  the pinned Anchor Docker image and compares the executable hash with the
  deployed program; a weekly workflow runs the same check in CI. The devnet
  deployment is currently hash-identical to the reproducible build.

## No bug bounty

There is no paid bug bounty at this stage. If the project receives funding for
one, this document will be updated.
