import * as anchorNamespace from "@anchor-lang/core";

type AnchorModule = typeof anchorNamespace;

/**
 * Anchor ships CJS with getter-style re-exports and Node 20/22's CJS
 * named-export detection misses `BN` (`Object.defineProperty(exports, "BN",
 * { get })`), leaving `anchorNamespace.BN` undefined even though the value is
 * exported. The CJS default binding is always the module object, so fall back
 * to it when the named binding is missing. Bundlers and Node 24+ detect the
 * named export and take the first branch.
 */
const fallback = (anchorNamespace as unknown as { default?: AnchorModule })
  .default;

export const anchor: AnchorModule =
  typeof anchorNamespace.BN === "function"
    ? anchorNamespace
    : (fallback ?? anchorNamespace);
