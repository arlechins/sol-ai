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

## No bug bounty

There is no paid bug bounty at this stage. If the project receives funding for
one, this document will be updated.
