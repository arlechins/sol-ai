# Fuzz targets

Coverage-guided fuzzing for the program's pure and decoding surfaces. The
harness uses [`cargo-fuzz`](https://github.com/rust-fuzz/cargo-fuzz) with a
nightly toolchain; the normal test suite runs on stable and is unaffected.

## Targets

| Target | What it asserts |
|---|---|
| `score` | `compute_score` never panics, never exceeds net completions, and only reports decay when the inputs permit it |
| `programdata` | the hand-rolled `ProgramData` parser never panics and any accepted authority comes from the documented 45-byte layout |
| `account_decode` | Borsh decoding arbitrary bytes into any account struct never panics, and successful decodes re-encode within `INIT_SPACE` |

## Run locally

```bash
rustup toolchain install nightly --profile minimal
cargo install cargo-fuzz --locked

cd fuzz
cargo +nightly fuzz run score -- -max_total_time=120
cargo +nightly fuzz run programdata -- -max_total_time=120
cargo +nightly fuzz run account_decode -- -max_total_time=120
```

Compile check without the fuzzer (used in CI):

```bash
cargo +nightly build --manifest-path fuzz/Cargo.toml --bins
```

Crashes are written to `fuzz/artifacts/<target>/` and the corpus to
`fuzz/corpus/<target>/` (both gitignored). A weekly workflow runs each target
for two minutes; the last clean local smoke run covered 9.4M (score), 6.9M
(programdata), and 812K (account_decode) executions without a crash.
