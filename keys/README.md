# Program ID keypairs

`taop_reputation-keypair.json` is the **program ID keypair**, not the upgrade
authority. It is committed on purpose so that every clone, CI run, and cluster
produces the same program address:

```
8soD4YteLDgkibSNBzmQJTztiNcXPcLoi3Y2FrY15MnE
```

The upgrade authority is a separate key (the deployer wallet / multisig). Anyone
who has this file can only re-derive the address; they cannot upgrade the
program or move funds.

`scripts/sync-keypair.sh` copies this keypair into `target/deploy/` where
`anchor build` and `solana program deploy` expect it. Run it after a fresh
clone before deploying.
