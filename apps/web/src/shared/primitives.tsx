import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Link } from "react-router-dom";
import { decaySeries, shortKey } from "../lib/format";
import { explorer } from "../content";
import { useVariantPath } from "../variant-context";

/* ---------------------------------------------------------------- layout */

export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className}`}>
      {children}
    </div>
  );
}

export function Reveal({
  children,
  delay = 0,
  className = "",
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "li";
}) {
  const ref = useRef<HTMLDivElement | HTMLLIElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const classes = `reveal ${shown ? "is-in" : ""} ${className}`;
  const style = delay ? { transitionDelay: `${delay}ms` } : undefined;

  if (as === "li") {
    return (
      <li ref={ref as RefObject<HTMLLIElement>} className={classes} style={style}>
        {children}
      </li>
    );
  }

  return (
    <div ref={ref as RefObject<HTMLDivElement>} className={classes} style={style}>
      {children}
    </div>
  );
}

export function Eyebrow({
  children,
  index,
  className = "",
}: {
  children: ReactNode;
  index?: string;
  className?: string;
}) {
  return (
    <p
      className={`font-mono text-[11px] uppercase tracking-[0.22em] text-muted ${className}`}
    >
      {index ? <span className="text-accent-ink">{index} / </span> : null}
      {children}
    </p>
  );
}

export function Section({
  id,
  eyebrow,
  index,
  title,
  lede,
  children,
  className = "",
  headerClassName = "",
}: {
  id?: string;
  eyebrow?: ReactNode;
  index?: string;
  title: ReactNode;
  lede?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-24 border-t border-hairline py-20 md:py-28 ${className}`}
    >
      <Container>
        <Reveal>
          <header className={`max-w-3xl ${headerClassName}`}>
            {eyebrow ? <Eyebrow index={index}>{eyebrow}</Eyebrow> : null}
            <h2 className="mt-5 font-display text-3xl leading-[1.08] tracking-[-0.02em] text-ink sm:text-4xl md:text-[2.75rem]">
              {title}
            </h2>
            {lede ? (
              <p className="mt-5 text-base leading-relaxed text-muted sm:text-lg">
                {lede}
              </p>
            ) : null}
          </header>
        </Reveal>
        <div className="mt-12 md:mt-16">{children}</div>
      </Container>
    </section>
  );
}

export function Rule({ className = "" }: { className?: string }) {
  return <hr className={`border-0 border-t border-hairline ${className}`} />;
}

/* --------------------------------------------------------------- actions */

type ActionKind = "primary" | "ghost" | "quiet";

function actionClass(kind: ActionKind): string {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-btn px-4 py-2.5 font-mono text-[12px] uppercase tracking-[0.14em] transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50";
  if (kind === "primary") {
    return `${base} bg-ink text-canvas hover:bg-accent hover:text-on-accent`;
  }
  if (kind === "ghost") {
    return `${base} border border-hairline-2 text-ink hover:border-ink hover:bg-surface-2`;
  }
  return `${base} text-muted hover:text-ink`;
}

export function ActionLink({
  to,
  href,
  children,
  kind = "primary",
  className = "",
}: {
  to?: string;
  href?: string;
  children: ReactNode;
  kind?: ActionKind;
  className?: string;
}) {
  const withVariant = useVariantPath();
  const classes = `${actionClass(kind)} ${className}`;

  if (to) {
    return (
      <Link to={withVariant(to)} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <a
      href={href}
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel={href?.startsWith("http") ? "noreferrer noopener" : undefined}
      className={classes}
    >
      {children}
    </a>
  );
}

export function CopyButton({
  value,
  label = "Copy",
  className = "",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const area = document.createElement("textarea");
      area.value = value;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    timer.current = window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-live="polite"
      className={`rounded-btn border border-hairline px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted transition-colors hover:border-ink hover:text-ink ${className}`}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

/* ------------------------------------------------------------ data bits */

export function AddressChip({
  address,
  href,
  label,
}: {
  address: string;
  href?: string;
  label?: string;
}) {
  const text = (
    <span className="font-mono text-[12px] text-ink">
      {label ? <span className="mr-2 text-faint">{label}</span> : null}
      {shortKey(address, 6, 6)}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-2 rounded-pill border border-hairline bg-surface px-3 py-1.5">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="transition-colors hover:text-accent-ink"
        >
          {text}
        </a>
      ) : (
        text
      )}
      <CopyButton value={address} label="Copy" />
    </span>
  );
}

export function TxLink({
  signature,
  children,
}: {
  signature: string;
  children?: ReactNode;
}) {
  return (
    <a
      href={explorer.tx(signature)}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1.5 font-mono text-[12px] text-accent-ink hover:underline"
    >
      {children ?? shortKey(signature, 6, 6)}
      <span aria-hidden="true">↗</span>
    </a>
  );
}

type Tone = "neutral" | "success" | "alert" | "warn" | "info";

const TONES: Record<Tone, string> = {
  neutral: "border-hairline text-muted",
  success: "border-success-ink/40 text-success-ink",
  alert: "border-alert-ink/40 text-alert-ink",
  warn: "border-warn/40 text-warn",
  info: "border-info/40 text-info",
};

export function StatusPill({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill border bg-surface px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Stat({
  value,
  label,
  hint,
  className = "",
}: {
  value: ReactNode;
  label: string;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <span className="tabular font-display text-3xl tracking-[-0.02em] text-ink sm:text-4xl">
        {value}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
        {label}
      </span>
      {hint ? <span className="text-xs text-faint">{hint}</span> : null}
    </div>
  );
}

export function DataRow({
  k,
  v,
  mono = true,
}: {
  k: ReactNode;
  v: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-hairline py-2.5 last:border-b-0">
      <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
        {k}
      </dt>
      <dd className={`text-right text-sm text-ink ${mono ? "tabular font-mono" : ""}`}>
        {v}
      </dd>
    </div>
  );
}

export function ScoreMeter({
  score,
  max,
  label = "score",
}: {
  score: number;
  max?: number;
  label?: string;
}) {
  const ceiling = Math.max(max ?? 0, score, 1);
  const width = Math.min(100, (score / ceiling) * 100);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-4">
        <span className="tabular font-display text-5xl tracking-[-0.03em] text-ink">
          {score}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          {label}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={ceiling}
        className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-2"
      >
        <div
          className="h-full rounded-pill bg-accent transition-[width] duration-500"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

export function DecaySparkline({
  base,
  lastActivity,
  decayPeriodSecs,
  now,
  className = "",
}: {
  base: number;
  lastActivity: number;
  decayPeriodSecs: number;
  now: number;
  className?: string;
}) {
  const series = decaySeries({ base, lastActivity, decayPeriodSecs, now });
  const maxScore = Math.max(1, ...series.map((point) => point.score));
  const width = 240;
  const height = 48;
  const points = series
    .map((point, index) => {
      const x = (index / (series.length - 1)) * width;
      const y = height - (point.score / maxScore) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Projected score decay over the next three inactivity periods"
      className={className}
    >
      <line
        x1="0"
        y1={height - 3}
        x2={width}
        y2={height - 3}
        stroke="currentColor"
        className="text-hairline"
        strokeWidth="1"
      />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        className="text-accent"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className="h-3 animate-pulse rounded-pill bg-surface-2"
          style={{ width: `${88 - index * 14}%` }}
        />
      ))}
    </div>
  );
}

export function ErrorNote({
  children,
  onRetry,
}: {
  children: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-alert-ink/30 bg-surface px-4 py-3 text-sm text-alert-ink"
    >
      <span className="leading-relaxed">{children}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="font-mono text-[11px] uppercase tracking-[0.16em] underline decoration-dotted underline-offset-4 hover:text-ink"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-hairline-2 bg-surface px-4 py-6 text-sm leading-relaxed text-muted">
      {children}
    </div>
  );
}

export function CodeBlock({
  code,
  label,
}: {
  code: string;
  label?: string;
}) {
  return (
    <figure className="overflow-hidden rounded-card border border-hairline bg-surface">
      <figcaption className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          {label}
        </span>
        <CopyButton value={code} />
      </figcaption>
      <pre className="overflow-x-auto px-4 py-4 text-[12.5px] leading-relaxed">
        <code className="font-mono text-ink">{code}</code>
      </pre>
    </figure>
  );
}
