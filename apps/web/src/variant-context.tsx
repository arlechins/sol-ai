import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import {
  DEFAULT_VARIANT,
  isVariantId,
  VARIANTS_META,
  type VariantId,
  type VariantMeta,
} from "./variants";

interface VariantContextValue {
  variant: VariantId;
  meta: VariantMeta;
  setVariant: (variant: VariantId) => void;
}

const VariantContext = createContext<VariantContextValue | null>(null);

const STORAGE_KEY = "taop.variant";

function fromPath(pathname: string): VariantId | null {
  const match = /^\/v\/([^/]+)/.exec(pathname);
  return match && isVariantId(match[1]) ? match[1] : null;
}

function fromStorage(): VariantId | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isVariantId(value) ? value : null;
  } catch {
    return null;
  }
}

export function VariantProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const pathVariant = fromPath(location.pathname);
  const [variant, setVariant] = useState<VariantId>(
    () => pathVariant ?? fromStorage() ?? DEFAULT_VARIANT,
  );

  useEffect(() => {
    if (pathVariant) setVariant(pathVariant);
  }, [pathVariant]);

  useEffect(() => {
    document.documentElement.dataset.variant = variant;
    try {
      localStorage.setItem(STORAGE_KEY, variant);
    } catch {
      // Storage may be unavailable; the query/path variant still applies.
    }
  }, [variant]);

  const value = useMemo<VariantContextValue>(
    () => ({ variant, meta: VARIANTS_META[variant], setVariant }),
    [variant],
  );

  return <VariantContext.Provider value={value}>{children}</VariantContext.Provider>;
}

export function useVariant(): VariantContextValue {
  const context = useContext(VariantContext);
  if (!context) throw new Error("useVariant must be used inside VariantProvider");
  return context;
}

/**
 * Returns a path that preserves the active variant in the URL, so a shared
 * link opens the same design. The default variant keeps clean paths.
 */
export function useVariantPath(): (path: string) => string {
  const { variant } = useVariant();
  return (path: string) => {
    if (variant === DEFAULT_VARIANT) return path;
    return path === "/" ? `/v/${variant}` : `/v/${variant}${path}`;
  };
}
