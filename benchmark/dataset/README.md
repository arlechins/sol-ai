# Adversarial agent-reputation pattern dataset

**License:** CC BY 4.0 (full text in [`LICENSE-CC-BY-4.0`](LICENSE-CC-BY-4.0)) · **Version:** 0.1.0 · **File:** `patterns.json` · **Schema:** `schema.json`

A curated, citable catalogue of adversarial patterns against agent-reputation and
adjacent trust systems, grouped by the three attack classes used by the
[TAOP gaming-resistance benchmark](../README.md):

| Class | Meaning | Entries |
|---|---|---|
| `sybil_farming` | Many cheap identities manufacture reputation without valuable work. | 12 |
| `slow_burn_harvest` | One identity accrues trust slowly, then extracts once. | 10 |
| `collusive_ring` | A closed group mutually inflates its members' reputation. | 12 |

## Entry shape

```json
{
  "id": "sybil-002",
  "title": "Sybil farming of self-attested completions",
  "attackClass": "sybil_farming",
  "description": "Fresh identities self-attest large numbers of completions ...",
  "onChainSignals": ["bursts of attestations from new accounts", "..."],
  "realWorldEvidence": "Early empirical work on permissionless agent-reputation ...",
  "sources": [{ "title": "...", "authors": "...", "venue": "...", "year": 2026, "url": "..." }],
  "applicableMechanisms": ["self_attestation"],
  "mitigations": ["bonded challenges with watchers", "..."],
  "severity": "high",
  "confidence": "high"
}
```

Every entry carries a `confidence` field. `high` means a peer-reviewed result or
a well-documented incident; `medium` means industry reporting or a close analog
in another domain; `low` means a plausible pattern observed anecdotally. The
dataset deliberately does not inflate confidence: negative results and weak
evidence are labelled as such.

## Using it

- The benchmark's published results are produced without reading this dataset;
  the dataset exists to ground the attack classes in documented prior art.
- To map a pattern to a benchmark run, use `attackClass` (scenario) and
  `applicableMechanisms` (which built-in mechanisms the pattern applies to).
- `onChainSignals` are the fields a defender or indexer can actually observe in
  transaction and account data.

## Contributing

Add an entry by appending to `patterns.json`; keep IDs unique and consistent
with the `class-NNN` scheme. `pnpm --filter @taopp/benchmark test` validates
schema shape, ID uniqueness, and class balance.
