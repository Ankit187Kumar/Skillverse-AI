"use client";

import { motion } from "framer-motion";
import { useId, useState } from "react";
import { scoreTone } from "@/lib/utils";

/** Circular score gauge (0–100). */
export function ScoreRing({ score, size = 132, stroke = 11, label }: { score: number | null; size?: number; stroke?: number; label?: string }) {
  const id = useId();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = score == null ? 0 : Math.max(0, Math.min(100, score));
  const tone = scoreTone(score);
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={`ring-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7C3AED" />
            <stop offset="0.6" stopColor="#2563EB" />
            <stop offset="1" stopColor="#06B6D4" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-muted)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#ring-${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (v / 100) * c }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute text-center" role="img" aria-label={`${label ?? "Score"}: ${score == null ? "not available" : Math.round(v)} out of 100`}>
        <div className={size < 90 ? "font-display text-base font-bold text-fg" : "font-display text-3xl font-bold tracking-tight text-fg"}>
          {score == null ? "—" : Math.round(v)}
        </div>
        {size >= 90 && (
          <div className="text-xs font-semibold" style={{ color: tone.color }}>
            {tone.label}
          </div>
        )}
      </div>
    </div>
  );
}

/** Line + area chart of scores over time. */
export function TrendChart({ points, height = 180 }: { points: { label: string; value: number; hint?: string }[]; height?: number }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = height;
  const pad = { l: 34, r: 14, t: 14, b: 26 };
  const n = points.length;
  const x = (i: number) => pad.l + (n === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (n - 1));
  const y = (v: number) => pad.t + (1 - v / 100) * (H - pad.t - pad.b);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
  const area = n ? `${line} L${x(n - 1)},${H - pad.b} L${x(0)},${H - pad.b} Z` : "";

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label={`Score trend: ${points.map((p) => `${p.label} ${Math.round(p.value)}`).join(", ")}`}>
        <defs>
          <linearGradient id={`line-${id}`} x1="0" x2="1">
            <stop offset="0" stopColor="#7C3AED" />
            <stop offset="0.55" stopColor="#2563EB" />
            <stop offset="1" stopColor="#06B6D4" />
          </linearGradient>
          <linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7C3AED" stopOpacity="0.22" />
            <stop offset="1" stopColor="#06B6D4" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={pad.l} x2={W - pad.r} y1={y(g)} y2={y(g)} stroke="var(--border)" strokeDasharray={g ? "3 5" : undefined} />
            <text x={pad.l - 8} y={y(g) + 4} textAnchor="end" fontSize="11" fill="var(--fg-subtle)">
              {g}
            </text>
          </g>
        ))}
        {n > 1 && <motion.path d={area} fill={`url(#area-${id})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }} />}
        {n > 1 && (
          <motion.path
            d={line}
            fill="none"
            stroke={`url(#line-${id})`}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        )}
        {points.map((p, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}>
            <circle cx={x(i)} cy={y(p.value)} r="14" fill="transparent" />
            <circle cx={x(i)} cy={y(p.value)} r={hover === i ? 6 : 4.5} fill="var(--bg-elevated)" stroke="#2563EB" strokeWidth="2.5" />
            {(n <= 6 || i === 0 || i === n - 1) && (
              <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--fg-subtle)">
                {p.label}
              </text>
            )}
          </g>
        ))}
      </svg>
      {hover != null && points[hover] && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg bg-[#0B1020] px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg dark:bg-white dark:text-[#0B1020]"
          style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(points[hover].value) / H) * 100 - 4}%` }}
        >
          {Math.round(points[hover].value)}
          {points[hover].hint && <span className="ml-1 font-normal opacity-75">· {points[hover].hint}</span>}
        </div>
      )}
    </div>
  );
}

/** Horizontal labelled bars, 0–100. */
export function ScoreBars({ items, suffix = "" }: { items: { label: string; value: number | null; hint?: string }[]; suffix?: string }) {
  return (
    <ul className="space-y-4">
      {items.map((it, i) => (
        <li key={it.label}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
            <span className="font-semibold text-fg">{it.label}</span>
            <span className="font-display font-bold tabular-nums text-fg">{it.value == null ? "—" : `${Math.round(it.value)}${suffix}`}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={it.label} aria-valuenow={it.value ?? 0} aria-valuemin={0} aria-valuemax={100}>
            <motion.div
              className="h-full rounded-full bg-brand-gradient"
              initial={{ width: 0 }}
              animate={{ width: `${it.value ?? 0}%` }}
              transition={{ duration: 0.9, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          {it.hint && <p className="mt-1 text-xs text-fg-subtle">{it.hint}</p>}
        </li>
      ))}
    </ul>
  );
}

/** GitHub-style activity heatmap: columns are weeks, rows are weekdays. */
export function Heatmap({ days }: { days: { date: string; count: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  if (!days.length) return null;
  const first = new Date(`${days[0].date}T00:00:00`);
  const pad = (first.getDay() + 6) % 7; // Monday = 0
  const cells = [...Array(pad).fill(null), ...days];
  const weeks: ({ date: string; count: number } | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const level = (c: number) => (c === 0 ? 0 : Math.min(4, Math.ceil((c / max) * 4)));
  const colors = ["var(--bg-muted)", "rgb(124 58 237 / 0.3)", "rgb(124 58 237 / 0.55)", "rgb(37 99 235 / 0.75)", "#06B6D4"];
  return (
    <div className="overflow-x-auto">
      <div className="inline-flex gap-1" role="img" aria-label={`Practice activity over the last ${days.length} days`}>
        {weeks.map((w, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {w.map((d, di) =>
              d ? (
                <span
                  key={di}
                  title={`${d.date}: ${d.count} activit${d.count === 1 ? "y" : "ies"}`}
                  className="h-3.5 w-3.5 rounded-[4px] transition-transform hover:scale-125"
                  style={{ background: colors[level(d.count)] }}
                />
              ) : (
                <span key={di} className="h-3.5 w-3.5" />
              ),
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1 text-[11px] text-fg-subtle">
        Less
        {colors.map((c) => (
          <span key={c} className="h-3 w-3 rounded-[3px]" style={{ background: c }} />
        ))}
        More
      </div>
    </div>
  );
}
