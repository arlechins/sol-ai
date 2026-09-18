import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const text = readFileSync(
  resolve(process.cwd(), "public/.well-known/security.txt"),
  "utf8",
);
const fields = new Map(
  text
    .split("\n")
    .filter((line) => line.includes(":"))
    .map((line) => {
      const index = line.indexOf(":");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

describe("security.txt", () => {
  it("routes reports to private vulnerability reporting", () => {
    expect(fields.get("Contact")).toContain("security/advisories/new");
  });

  it("links the security policy", () => {
    expect(fields.get("Policy")).toContain("SECURITY.md");
  });

  it("declares a canonical URL and a future expiry", () => {
    expect(fields.get("Canonical")).toMatch(/^https:\/\//);
    const expires = Date.parse(fields.get("Expires") ?? "");
    expect(Number.isFinite(expires)).toBe(true);
    expect(expires).toBeGreaterThan(Date.now());
  });
});
