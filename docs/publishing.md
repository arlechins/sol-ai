# Publishing `@taopp/*` packages

Two packages are published to npm: `@taopp/solana` and `@taopp/mcp-server`. The
release workflow (`.github/workflows/release.yml`) builds, tests, lints the
packages, and publishes them **with provenance** when a GitHub release is
published.

## Enabling the workflow

Publishing is gated so that releases do not trigger failing runs before npm is
configured. Set the repository variable `NPM_PUBLISH=true` when you are ready:

```bash
gh variable set NPM_PUBLISH --body "true" --repo arlechins/sol-ai
```

Until then, the publish job is skipped and releases (and manual dispatches)
only generate the SBOM and run CI. Manual dispatch is for validating the SBOM:
`gh workflow run release.yml -f tag=<tag>`.

## One-time setup on npmjs.com

Pick one of the two authentication modes:

**A. Trusted publishing (recommended, no long-lived token).**

For each package (`@taopp/solana`, `@taopp/mcp-server`), open **Settings →
Publishing access → Trusted publisher → GitHub Actions** and configure:

| Field | Value |
|---|---|
| Organization/user | `arlechins` |
| Repository | `sol-ai` |
| Workflow filename | `release.yml` |
| Environment | (leave empty unless you use one) |

npm then accepts OIDC tokens minted by this workflow; the `NODE_AUTH_TOKEN`
secret can stay unset.

**B. Granular access token.**

Create a token with publish rights for the `@taopp` scope and store it as the
repository secret `NPM_TOKEN`. The workflow falls back to it automatically.

## Release flow

```bash
# 1. Bump versions in both packages (independent versions are fine)
pnpm --filter @taopp/solana version patch --no-git-tag-version
pnpm --filter @taopp/mcp-server version patch --no-git-tag-version
git add packages/*/package.json && git commit -m "release: @taopp/solana x.y.z, @taopp/mcp-server x.y.z"
git push

# 2. Tag and create the GitHub release (this triggers the publish workflow)
git tag vX.Y.Z && git push origin vX.Y.Z
gh release create vX.Y.Z --title "vX.Y.Z" --notes "..."
```

The workflow runs `publint`, `arethetypeswrong`, and built-artifact smokes
(the MCP server over stdio from both builds, webhook signing from ESM and CJS)
before publishing, so a broken export map or bundle cannot reach npm. The npm
version it installs is pinned (trusted publishing needs >= 11.5.1). It does not start a validator, so the SDK
integration tests skip; run `./scripts/localnet.sh` and `pnpm -r --if-present
test` locally before tagging if you changed program-facing code.

## Software bill of materials

Every release also produces an SPDX SBOM (`taop-solana.spdx.json`) via
`anchore/sbom-action`, attached to the GitHub release and available as a
workflow artifact. It covers the Cargo and pnpm dependency graphs.

## Verify a release

```bash
npm view @taopp/solana version
npm view @taopp/mcp-server version
# Provenance attestation is linked on the package page, or:
npm view @taopp/solana dist.integrity
```

Consumers can pin and verify:

```bash
npm install @taopp/solana@x.y.z --foreground-scripts
```

## Rollback

npm does not allow re-publishing a version. If a release is broken:

1. Deprecate it: `npm deprecate @taopp/solana@x.y.z "reason"`.
2. Publish a patch with the fix through the same workflow.
