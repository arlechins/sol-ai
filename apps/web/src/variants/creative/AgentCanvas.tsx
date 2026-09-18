import { useEffect, useRef } from "react";

interface GraphNode {
  x: number;
  y: number;
  radius: number;
  phase: number;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The living agent graph: a lightweight canvas of agents and their
 * attestation edges. DPR-capped at 2, paused when off-screen or when the
 * tab is hidden, and rendered once (no animation) under reduced motion.
 */
export function AgentCanvas({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const random = mulberry32(7);
    const nodes: GraphNode[] = Array.from({ length: 24 }, () => ({
      x: random(),
      y: random(),
      radius: 1 + random() * 2.4,
      phase: random() * Math.PI * 2,
    }));

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = true;
    let running = true;

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduced) draw(0);
    }

    function draw(time: number) {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      const t = time / 1000;
      const points = nodes.map((node) => ({
        x: node.x * width,
        y: node.y * height,
        radius: node.radius + (reduced ? 0 : Math.sin(t * 0.9 + node.phase) * 0.7),
      }));

      const limit = Math.min(width, height) * 0.3;
      for (let i = 0; i < points.length; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
          const dx = points[i].x - points[j].x;
          const dy = points[i].y - points[j].y;
          const distance = Math.hypot(dx, dy);
          if (distance > limit) continue;
          ctx.strokeStyle = `rgba(20, 18, 16, ${(1 - distance / limit) * 0.14})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(points[i].x, points[i].y);
          ctx.lineTo(points[j].x, points[j].y);
          ctx.stroke();
        }
      }

      points.forEach((point, index) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
        ctx.fillStyle = index % 4 === 0 ? "rgba(255, 77, 31, 0.85)" : "rgba(20, 18, 16, 0.5)";
        ctx.fill();
      });
    }

    function tick(time: number) {
      if (running && visible) draw(time);
      frame = requestAnimationFrame(tick);
    }

    function onVisibility() {
      running = document.visibilityState !== "hidden";
    }

    resize();
    const observer =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries) visible = entry.isIntersecting;
            },
            { threshold: 0.05 },
          )
        : null;
    observer?.observe(canvas);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);

    if (reduced) {
      draw(0);
    } else {
      frame = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none ${className}`}
    />
  );
}
