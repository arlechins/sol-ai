import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_VARIANT, VARIANTS, type VariantId } from "../src/variants";

function parseTokens(css: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  const pattern = /(--c-[a-z0-9-]+)\s*:\s*([^;]+);/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css))) {
    tokens[match[1]] = match[2].trim();
  }
  return tokens;
}

function tokensFor(variant: VariantId): Record<string, string> {
  const base = readFileSync(
    resolve(process.cwd(), "src/variants/base.tokens.css"),
    "utf8",
  );
  const own = readFileSync(
    resolve(process.cwd(), `src/variants/${variant}/tokens.css`),
    "utf8",
  );
  return { ...parseTokens(base), ...parseTokens(own) };
}

function relativeLuminance(hex: string): number {
  const clean = hex.trim().slice(0, 7);
  const [r, g, b] = [1, 3, 5].map((offset) => {
    const value = parseInt(clean.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

const TEXT_PAIRS: [string, string][] = [
  ["--c-ink", "--c-canvas"],
  ["--c-ink", "--c-surface"],
  ["--c-muted", "--c-canvas"],
  ["--c-muted", "--c-surface"],
  ["--c-accent-ink", "--c-canvas"],
  ["--c-accent-ink", "--c-surface"],
  ["--c-on-accent", "--c-accent"],
  ["--c-success-ink", "--c-canvas"],
  ["--c-alert-ink", "--c-canvas"],
  ["--c-info", "--c-canvas"],
  ["--c-warn", "--c-canvas"],
];

describe("variant token contrast (WCAG AA, small text)", () => {
  it("covers every declared variant", () => {
    expect(VARIANTS).toContain(DEFAULT_VARIANT);
    expect(VARIANTS.length).toBeGreaterThanOrEqual(3);
  });

  for (const variant of VARIANTS) {
    const tokens = tokensFor(variant);

    for (const [fg, bg] of TEXT_PAIRS) {
      it(`${variant}: ${fg} on ${bg} >= 4.5`, () => {
        const foreground = tokens[fg];
        const background = tokens[bg];
        expect(foreground, `${fg} missing in ${variant}`).toBeTruthy();
        expect(background, `${bg} missing in ${variant}`).toBeTruthy();
        const ratio = contrast(foreground, background);
        expect(
          ratio,
          `${variant} ${fg} ${foreground} on ${bg} ${background} = ${ratio.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
