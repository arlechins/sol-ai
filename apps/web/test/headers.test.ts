import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const headers = readFileSync(resolve(process.cwd(), "public/_headers"), "utf8");
const lower = headers.toLowerCase();

const REQUIRED = [
  "x-content-type-options: nosniff",
  "x-frame-options: deny",
  "referrer-policy: strict-origin-when-cross-origin",
  "permissions-policy:",
  "cross-origin-opener-policy: same-origin",
  "strict-transport-security:",
  "content-security-policy:",
];

describe("Cloudflare Pages security headers", () => {
  for (const header of REQUIRED) {
    it(`sets ${header.split(":")[0]}`, () => {
      expect(lower).toContain(header);
    });
  }

  it("locks down the CSP frame ancestors, object, and base", () => {
    expect(lower).toContain("frame-ancestors 'none'");
    expect(lower).toContain("object-src 'none'");
    expect(lower).toContain("base-uri 'self'");
    expect(lower).toContain("form-action 'self'");
  });

  it("never allows eval or inline scripts", () => {
    expect(lower).not.toContain("unsafe-eval");
    expect(lower).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("caches fingerprinted assets immutably", () => {
    expect(headers).toContain("/assets/*");
    expect(lower).toContain("max-age=31536000");
    expect(lower).toContain("immutable");
  });
});
