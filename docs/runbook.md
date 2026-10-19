# Operator runbook

Procedures for running a TAOP deployment. Written for the devnet pilot and the
planned mainnet deployment; every command assumes the repository root and the
standard toolchain from `docs/tutorial.md`.

## 1. Key inventory

| Key | Power | Where it should live |
|---|---|---|
| Program upgrade authority | Replace program code (total control) | Multisig (Squads) for mainnet; hardware wallet minimum |
| `Config.admin` | `update_config`, `set_certifier`, `transfer_admin`, `resolve_challenge` | Multisig; moved via two-step `transfer_admin`/`accept_admin` |
| `Config.certifier` | `resolve_challenge`, `certify_capability`, `slash_capability` | Operator hot key with limited funds; rotatable by admin |
| `Treasury` key | Spend forfeited/slashed lamports | Cold key; no program instruction moves funds out |
| Deployer wallet | Pays deploy/upgrade fees; initial admin until rotated | Hardware wallet; not the same as the certifier |
| Program-ID keypair (`keys/taop_reputation-keypair.json`) | None (derive the address only) | In the repository, intentionally |

Never reuse the certifier or admin key as a hot wallet, and never store any of
these in CI secrets.

## 2. Routine operations

### Rotate the certifier

```bash
# From the admin key
pnpm exec tsx scripts/rotate-certifier.ts <NEW_CERTIFIER_PUBKEY>   # or via SDK:
# client.setCertifier(new PublicKey("<NEW_CERTIFIER_PUBKEY>"))
```

Verify with `client.getConfig().certifier` and by resolving a test challenge on
devnet.

### Pause and resume

```bash
# client.updateConfig({ paused: true })
```

Pause blocks `attest_completion`, `challenge_completion`, and
`register_capability`. Resolution, certification, slashing, withdrawal, admin
transfer, and score reads keep working — so a pause never traps funds.

### Cancel a stalled challenge (challenger side)

A challenge the authorities have not resolved for 90 days can be cancelled by
the original challenger:

```bash
# client.cancelChallenge(completion)
# client.challengeTimedOut(completion) // true after 90 days
```

### Treasury upkeep

The treasury is funded with the rent-exempt minimum at `initialize_config`.
Forfeitures and slashes credit it; nothing in the program debits it. Withdrawals
are ordinary System transfers signed by the treasury key:

```bash
solana transfer <DESTINATION> <AMOUNT> --from <TREASURY_KEYPAIR> \
  --url https://api.mainnet-beta.solana.com
```

If the treasury is ever drained externally, top it up to at least the
rent-exempt minimum so small payouts can be credited.

### Upgrade the program

```bash
# 1. Build reproducibly and verify the new binary
./scripts/verify-build.sh devnet          # or mainnet-beta after deployment

# 2. Deploy (fees only; the loader keeps the account at its maximum size)
anchor deploy --provider.cluster mainnet-beta

# 3. Confirm the deployed hash matches the rebuild
solana-verify get-program-hash -u https://api.mainnet-beta.solana.com <PROGRAM_ID>

# 4. Record the signature and hashes in CHANGELOG.md / grant-verification.md
```

The temporary buffer rent is refunded automatically. The programdata account
never shrinks, so upgrading past a larger build permanently raises rent (still
recoverable by closing the program).

### Rotate `Config.admin` to a multisig (Squads)

1. Create the Squads multisig and note its **vault PDA**.
2. From the current admin: `client.transferAdmin(squadsVault)`. The admin role
   does **not** change yet; a `PendingAdmin` account records the proposal.
3. Through Squads, execute `accept_admin()` with the vault as signer. The
   vault becomes `Config.admin` and the pending account rent is refunded to it.
4. Verify: `client.getConfig().admin == squadsVault`.

Transfer the program **upgrade authority** the same way:

```bash
solana program set-upgrade-authority <PROGRAM_ID> \
  --new-upgrade-authority <SQUADS_VAULT> \
  --keypair <CURRENT_AUTHORITY>
```

From then on all upgrades go through Squads.

## 3. Incident response

1. **Pause** the protocol (`updateConfig({ paused: true })`) if a fraud or
   exploit is in progress — it stops new attestations, challenges, and
   registrations without freezing funds.
2. **Write down the timeline** (UTC) and the affected accounts / transactions.
3. **Assess authority compromise:**
   - Certifier compromised: admin calls `set_certifier(newKey)` immediately.
   - Admin compromised: the attacker can resolve dishonestly and rotate the
     certifier, but cannot move bonds to themselves (bonds only go to the
     challenger, the treasury, or capability creators). Escalate to the upgrade
     authority (Squads): pause is already done; a code upgrade can add recovery
     paths if needed.
   - Upgrade authority compromised: the attacker can replace the program.
     This is the worst case; recovery requires social/community coordination.
     This is why the authority belongs in a multisig before mainnet.
4. **Do not** move the treasury unless you control its key; the program never
   pays to an attacker-chosen destination.
5. Publish a post-mortem in the repository and reference it in `CHANGELOG.md`.

## 4. Monitoring

- `.github/workflows/healthcheck.yml` runs `scripts/healthcheck.ts` every six
  hours and fails (notifying the repository owner) if the RPC, program account,
  or config is unreachable, if the on-chain executable hash no longer matches
  the pinned reproducible build, or if live config drifts from
  `apps/web/src/data/deployment.json`.
- `./scripts/verify-build.sh <cluster>` proves the deployed binary matches the
  repository; the weekly **Verifiable build** workflow runs the same check.
- `scripts/devnet-e2e.mjs` runs the full two-agent trust loop against a funded
  cluster (config bootstrap, bond reclaim, balance sweep); CI gates every push
  on the local-validator version of it.
- Explorer: `https://explorer.solana.com/address/<PROGRAM_ID>?cluster=<cluster>`.

## 5. Escalation and contacts

Security reports go through GitHub Security Advisories (see `SECURITY.md`).
There is no paid bug bounty at this stage.
