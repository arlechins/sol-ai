#!/usr/bin/env python3
"""Mutation spot-check for the Rust program — a test-strength probe.

The EVM sibling uses `slither-mutate`; there is no equivalent driver for an
Anchor workspace, so this deliberately breaks one critical line at a time and
asserts the test suite catches it. A surviving mutant is a real test gap.

    python3 scripts/mutation-spotcheck.py
    MUTATION_ONLY=halving python3 scripts/mutation-spotcheck.py   # single mutant

Each mutant is applied to the working tree, the full workspace suite runs, and
the original bytes are restored afterwards — including when a run crashes.
Exits non-zero when any mutation survives.
"""

from __future__ import annotations

import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

REPUTATION = "programs/taop_reputation/src/instructions/reputation.rs"
CAPABILITY = "programs/taop_reputation/src/instructions/capability.rs"
CONFIG = "programs/taop_reputation/src/instructions/config.rs"
STATE = "programs/taop_reputation/src/state.rs"


@dataclass(frozen=True)
class Mutant:
    file: str
    label: str
    find: str
    replace: str


MUTANTS: list[Mutant] = [
    Mutant(
        STATE,
        "decay: score not halved for inactivity",
        "    (net >> halvings, true)",
        "    (net, true)",
    ),
    Mutant(
        STATE,
        "decay: halving cap removed",
        "    if halvings > 63 {\n        halvings = 63;\n    }",
        "    // mutated: halving cap removed",
    ),
    Mutant(
        REPUTATION,
        "attest: pause check ignored",
        "    require!(!ctx.accounts.config.paused, TaopError::Paused);\n    require!(result_uri.len() <= MAX_URI_LEN, TaopError::UriTooLong);",
        "    require!(true, TaopError::Paused);\n    require!(result_uri.len() <= MAX_URI_LEN, TaopError::UriTooLong);",
    ),
    Mutant(
        REPUTATION,
        "challenge: recorded bond zeroed",
        "    challenge.bond_lamports = bond;",
        "    challenge.bond_lamports = 0;",
    ),
    Mutant(
        REPUTATION,
        "resolve: anyone may resolve",
        "    require!(\n        authority == ctx.accounts.config.admin || authority == ctx.accounts.config.certifier,\n        TaopError::Unauthorized\n    );",
        "    require!(true, TaopError::Unauthorized);",
    ),
    Mutant(
        REPUTATION,
        "resolve: upheld dispute not recorded",
        "        ctx.accounts.agent.disputes = ctx\n            .accounts\n            .agent\n            .disputes\n            .checked_add(1)",
        "        ctx.accounts.agent.disputes = ctx\n            .accounts\n            .agent\n            .disputes\n            .checked_add(0)",
    ),
    Mutant(
        REPUTATION,
        "cancel: timeout can never elapse",
        "        now.saturating_sub(ctx.accounts.challenge.timestamp) >= CHALLENGE_TIMEOUT_SECS,",
        "        now.saturating_sub(ctx.accounts.challenge.timestamp) >= i64::MAX,",
    ),
    Mutant(
        CAPABILITY,
        "certify: anyone may certify",
        "pub fn certify_capability(ctx: Context<CertifyCapability>) -> Result<()> {\n    let authority = ctx.accounts.authority.key();\n    require!(\n        authority == ctx.accounts.config.admin || authority == ctx.accounts.config.certifier,\n        TaopError::Unauthorized\n    );",
        "pub fn certify_capability(ctx: Context<CertifyCapability>) -> Result<()> {\n    let authority = ctx.accounts.authority.key();\n    require!(\n        true,\n        TaopError::Unauthorized\n    );",
    ),
    Mutant(
        CAPABILITY,
        "slash: anyone may slash",
        "pub fn slash_capability(ctx: Context<SlashCapability>, penalty_lamports: u64) -> Result<()> {\n    let authority = ctx.accounts.authority.key();\n    require!(\n        authority == ctx.accounts.config.admin || authority == ctx.accounts.config.certifier,\n        TaopError::Unauthorized\n    );",
        "pub fn slash_capability(ctx: Context<SlashCapability>, penalty_lamports: u64) -> Result<()> {\n    let authority = ctx.accounts.authority.key();\n    require!(\n        true,\n        TaopError::Unauthorized\n    );",
    ),
    Mutant(
        CONFIG,
        "init: upgrade-authority check removed",
        "    assert_upgrade_authority(&ctx.accounts.program_data, &ctx.accounts.admin.key())?;",
        "    // mutated: upgrade-authority check removed",
    ),
    Mutant(
        CONFIG,
        "init: zero certifier accepted",
        "    require!(\n        decay_period_secs <= MAX_DECAY_PERIOD_SECS,\n        TaopError::DecayPeriodTooLong\n    );\n    require!(certifier != Pubkey::default(), TaopError::InvalidAuthority);",
        "    require!(\n        decay_period_secs <= MAX_DECAY_PERIOD_SECS,\n        TaopError::DecayPeriodTooLong\n    );\n    require!(true, TaopError::InvalidAuthority);",
    ),
]


PROGRAM_SO = ROOT / "target/deploy/taop_reputation.so"
PROPTEST_DIR = ROOT / "programs/taop_reputation/proptest-regressions"


def snapshot_regressions() -> dict[Path, bytes]:
    """Mutants trip proptest, which writes regression seeds; keep the tree clean."""
    if not PROPTEST_DIR.exists():
        return {}
    return {path: path.read_bytes() for path in PROPTEST_DIR.rglob("*") if path.is_file()}


def restore_regressions(snapshot: dict[Path, bytes]) -> None:
    if PROPTEST_DIR.exists():
        for path in PROPTEST_DIR.rglob("*"):
            if path.is_file() and path not in snapshot:
                path.unlink()
    for path, data in snapshot.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)


def run_build() -> subprocess.CompletedProcess[str]:
    """Recompile the program; the integration suite loads the built .so."""
    return subprocess.run(
        ["anchor", "build"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )


def run_suite() -> subprocess.CompletedProcess[str]:
    # The compute-unit snapshot is skipped: it would flag every mutation as a
    # regression, which says nothing about the behavior tests under probe.
    return subprocess.run(
        [
            "cargo",
            "test",
            "--workspace",
            "--quiet",
            "--",
            "--skip",
            "instruction_compute_units_stay_within_budget",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )


def main() -> int:
    only = os.environ.get("MUTATION_ONLY")
    selected = [mutant for mutant in MUTANTS if not only or only in mutant.label]

    caught: list[str] = []
    survived: list[str] = []
    broken: list[str] = []

    program_so_backup = PROGRAM_SO.read_bytes() if PROGRAM_SO.exists() else None
    regression_backup = snapshot_regressions()

    try:
        for mutant in selected:
            path = ROOT / mutant.file
            original = path.read_text()
            occurrences = original.count(mutant.find)
            if occurrences != 1:
                print(f"BROKEN  {mutant.label}: anchor found {occurrences} times")
                broken.append(mutant.label)
                continue

            path.write_text(original.replace(mutant.find, mutant.replace))
            try:
                build = run_build()
                if build.returncode != 0:
                    print(f"INVALID {mutant.label}: mutant does not compile")
                    broken.append(mutant.label)
                    continue
                result = run_suite()
                survived_this = result.returncode == 0
            finally:
                path.write_text(original)

            if survived_this:
                print(f"SURVIVED {mutant.label}")
                survived.append(mutant.label)
            else:
                print(f"CAUGHT   {mutant.label}")
                caught.append(mutant.label)
    finally:
        # Tests load the built artifact; never leave a mutated .so behind.
        if program_so_backup is not None:
            PROGRAM_SO.write_bytes(program_so_backup)
        restore_regressions(regression_backup)

    print(
        f"\n{len(caught)} caught · {len(survived)} survived · {len(broken)} broken anchors "
        f"(of {len(selected)})"
    )
    if survived or broken:
        print("Mutation spot-check failed: repair the test gaps or the anchors above.")
        return 1
    print("Mutation spot-check passed: every seeded fault was detected.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
