# Mainnet go-live checklist

Gate list for deploying `taop_reputation` to Solana mainnet. Work top to bottom;
each item is verifiable and should be recorded with a link, hash, or signature.

## 0. Go / no-go gates

- [ ] `./scripts/check.sh` passes on `main` (83 Rust, 19 SDK, 3 MCP, 10 benchmark tests)
- [ ] CI, CodeQL, and Scorecard are green on the release commit
- [ ] `./scripts/verify-build.sh devnet` passes (reproducible build == deployed devnet program)
- [ ] Independent review of bond custody paths (`resolve_challenge` sweep, capability slashing, vault rent rules) completed and findings addressed
- [ ] Pause drill performed on devnet: pause blocks writes, resolution still works, resume confirmed
- [ ] Admin transfer to the Squads multisig rehearsed on devnet (propose → accept → verify)
- [ ] Upgrade-authority transfer to Squads rehearsed on devnet
- [ ] `docs/runbook.md` reviewed by the operator on call
- [ ] Certifier key policy agreed (hot key, rotation procedure, response SLA)
- [ ] Treasury key policy agreed (cold storage, rent top-up procedure)

## 1. Funding

Compute the exact rent on the day (mainnet rent is decreasing under SIMD-0437):

```bash
ls -l target/verifiable/taop_reputation.so
solana rent "$(wc -c < target/verifiable/taop_reputation.so | tr -d ' ')" --url https://api.mainnet-beta.solana.com
```

Reference numbers at 6,333 lamports/byte (September 2026, ~428 KB binary):

| Item | Approximate SOL | Notes |
|---|---:|---|
| Programdata rent (locked) | ~2.7 | Recoverable only by closing the program |
| Program account rent | ~0.001 | Fixed |
| Temporary deploy buffer | ~2.7 peak | Refunded automatically after deploy |
| Config account rent | ~0.001 | `initialize_config` |
| Treasury funding | ~0.0009 | Rent-exempt minimum, sent at `initialize_config` |
| Transaction/priority fees | ~0.05 | Deploy is the bulk; use `--with-compute-unit-price` if congested |
| **Fund the deployer with** | **~6 SOL** | Peak buffer + final locked rent + fees |

## 2. Build the canonical artifact

- [ ] Fresh clone at the release tag on a clean machine
- [ ] `./scripts/verify-build.sh devnet` rebuilds and verifies
- [ ] Archive `target/verifiable/taop_reputation.so` and its `solana-verify`
      executable hash in the release notes

## 3. Deploy

```bash
anchor build --verifiable                       # canonical artifact
anchor deploy --provider.cluster mainnet-beta   # or: solana program deploy ... --program-id keys/...
```

- [ ] Program ID is `8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE`
- [ ] `solana program show <PROGRAM_ID> --url https://api.mainnet-beta.solana.com`
      shows the expected upgrade authority and data length
- [ ] `solana-verify get-program-hash -u https://api.mainnet-beta.solana.com <PROGRAM_ID>`
      equals the rebuild hash
- [ ] Publish the deployment signature and hash in the release notes and
      `docs/grant-verification.md`

## 4. Initialize configuration

- [ ] Treasury key is a cold account you control (not the deployer)
- [ ] Certifier key decided
- [ ] Challenge bond sized to the work items being gated (start at 0.005 SOL
      or higher; see `docs/methodology.md` on bond coverage)
- [ ] Decay period chosen (30 days is the shipped default; maximum 366)

```bash
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com pnpm deploy:init -- --cluster mainnet-beta
```

- [ ] `deployments.solana.json` written and archived (it is gitignored)
- [ ] `client.getConfig()` returns the expected admin, certifier, treasury, bond,
      and decay values
- [ ] On-chain IDL published (optional but recommended for explorers):
      `anchor idl init --provider.cluster mainnet-beta`

## 5. Lock down authority

- [ ] `transfer_admin(squadsVault)` then `accept_admin()` through Squads
- [ ] `solana program set-upgrade-authority <PROGRAM_ID> --new-upgrade-authority <SQUADS_VAULT>`
- [ ] Verify: `client.getConfig().admin == squadsVault` and
      `solana program show` reports the Squads vault as authority
- [ ] Old deployer/admin keys are archived offline, not deleted, in case of an
      audit trail requirement

## 6. Observability

- [ ] Healthcheck workflow enabled (`.github/workflows/healthcheck.yml`)
- [ ] `SOLANA_RPC_URL` for the healthcheck points at a private RPC if possible
- [ ] Explorer links added to the README table
- [ ] `deployments.solana.json` mirrored into the release notes

## 7. Post-launch verification

- [ ] First external attestation observed and indexed
- [ ] First challenge and resolution executed by the certifier
- [ ] Score read by a third-party SDK/MCP client
- [ ] `./scripts/verify-build.sh mainnet-beta` passes on the release commit

## 8. Rollback

Program upgrades are in-place and reversible:

1. Rebuild the previous release tag verifiably.
2. Deploy it (fees only) and re-verify the hash.
3. Config and account state are preserved across upgrades; if a release changed
   account layouts (none to date), migration instructions would ship with it.

If the upgrade authority has already moved to Squads, the rollback executes as a
Squads proposal with the same steps.
