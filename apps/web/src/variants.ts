export const VARIANTS = ["minimal", "luxury", "creative"] as const;

export type VariantId = (typeof VARIANTS)[number];

export const DEFAULT_VARIANT: VariantId = "minimal";

export interface VariantMeta {
  id: VariantId;
  label: string;
  thesis: string;
}

export const VARIANTS_META: Record<VariantId, VariantMeta> = {
  minimal: {
    id: "minimal",
    label: "Minimal",
    thesis: "The Instrument — paper, ink, hairlines, tabular numerals.",
  },
  luxury: {
    id: "luxury",
    label: "Luxury",
    thesis: "The Vault — obsidian, ivory, champagne gold rules.",
  },
  creative: {
    id: "creative",
    label: "Creative",
    thesis: "The Living Ledger — warm paper, vermilion, living graph.",
  },
};

export function isVariantId(value: string | null | undefined): value is VariantId {
  return value != null && (VARIANTS as readonly string[]).includes(value);
}

/** The switcher is a build-time decision; production ships one variant. */
export const SHOW_SWITCHER: boolean =
  import.meta.env.DEV ||
  (import.meta.env.VITE_SHOW_VARIANTS as string | undefined) === "1";
