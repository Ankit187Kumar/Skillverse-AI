"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, Cpu, Lock, Lightbulb, Wrench, XCircle } from "lucide-react";
import type { CodeReview, Judged, TestResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/feedback";

export const VERDICT_LABEL: Record<string, { label: string; tone: "success" | "danger" | "warning" | "neutral" }> = {
  accepted: { label: "Accepted", tone: "success" },
  passed: { label: "Passed", tone: "success" },
  wrong_answer: { label: "Wrong answer", tone: "danger" },
  runtime_error: { label: "Runtime error", tone: "danger" },
  compile_error: { label: "Compile error", tone: "danger" },
  time_limit: { label: "Time limit exceeded", tone: "warning" },
  memory_limit: { label: "Memory limit exceeded", tone: "warning" },
  error: { label: "Sandbox error", tone: "neutral" },
};

export const DIFF_TONE = { Easy: "success", Medium: "warning", Hard: "danger" } as const;

export function VerdictBadge({ verdict }: { verdict: string }) {
  const v = VERDICT_LABEL[verdict] ?? { label: verdict, tone: "neutral" as const };
  return <Badge tone={v.tone}>{v.label}</Badge>;
}

export function JudgeResults({ judged, title }: { judged: Judged; title: string }) {
  const [open, setOpen] = useState<number | null>(() => {
    const f = judged.results.find((r) => r.status !== "passed" && !r.hidden);
    return f ? f.index : null;
  });
  const ok = judged.verdict === "accepted";
  return (
    <div className="space-y-3">
      <div className={cn("flex flex-wrap items-center gap-3 rounded-2xl p-3.5", ok ? "bg-success/10" : "bg-danger/5")} role="status">
        {ok ? <CheckCircle2 className="h-6 w-6 text-success" /> : <XCircle className="h-6 w-6 text-danger" />}
        <div className="flex-1">
          <p className="font-display font-bold text-fg">{VERDICT_LABEL[judged.verdict]?.label ?? judged.verdict}</p>
          <p className="text-xs text-fg-muted">
            {title}: {judged.passed}/{judged.total} tests passed
            {judged.max_time_ms != null && ` · slowest ${Math.round(judged.max_time_ms)} ms`}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5" aria-label="Test results">
        {judged.results.map((r) => (
          <button
            key={r.index}
            onClick={() => setOpen(open === r.index ? null : r.index)}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition-colors",
              r.status === "passed" ? "bg-success/12 text-success" : r.status === "time_limit" || r.status === "memory_limit" ? "bg-warning/15 text-warning" : "bg-danger/12 text-danger",
              open === r.index && "ring-2 ring-purple/40",
            )}
            aria-label={`Test ${r.index + 1}: ${VERDICT_LABEL[r.status]?.label}`}
          >
            {r.hidden && <Lock className="h-3 w-3" />}#{r.index + 1}
          </button>
        ))}
      </div>
      {open != null && judged.results[open] && <TestDetail r={judged.results[open]} />}
    </div>
  );
}

function Block({ label, text, tone }: { label: string; text?: string; tone?: "danger" }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-fg-subtle">{label}</p>
      <pre className={cn("max-h-48 overflow-auto rounded-xl border border-line bg-muted p-2.5 font-mono text-xs leading-relaxed text-fg", tone === "danger" && "text-danger")}>
        {text || "(empty)"}
      </pre>
    </div>
  );
}

function TestDetail({ r }: { r: TestResult }) {
  return (
    <div className="space-y-3 rounded-2xl border border-line p-3.5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-fg">Test {r.index + 1}</span>
        <Badge tone={VERDICT_LABEL[r.status]?.tone}>{VERDICT_LABEL[r.status]?.label}</Badge>
        {r.time_ms != null && (
          <span className="inline-flex items-center gap-1 text-xs text-fg-subtle">
            <Clock className="h-3 w-3" /> {Math.round(r.time_ms)} ms
          </span>
        )}
      </div>
      {r.hidden ? (
        <p className="flex items-start gap-2 text-sm text-fg-muted">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" /> Hidden test — its input isn&apos;t shown. Hidden tests include edge cases and large inputs.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          <Block label="Input" text={r.input} />
          <Block label="Expected" text={r.expected} />
          <Block label="Your output" text={r.actual} />
        </div>
      )}
      {r.stderr && <Block label="Error output" text={r.stderr} tone="danger" />}
    </div>
  );
}

export function ReviewPanel({ review }: { review: CodeReview }) {
  const [more, setMore] = useState(false);
  return (
    <div className="space-y-4">
      {!review.executed && (
        <p className="flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-sm text-fg">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          Static review only — your code was not run, so correctness can&apos;t be confirmed.
        </p>
      )}
      <p className="leading-relaxed text-fg">{review.summary}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-brand-soft p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-fg-subtle">Time</p>
          <p className="font-mono text-lg font-bold text-fg">{review.time_complexity}</p>
        </div>
        <div className="rounded-xl bg-brand-soft p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-fg-subtle">Space</p>
          <p className="font-mono text-lg font-bold text-fg">{review.space_complexity}</p>
        </div>
      </div>
      {review.meets_expected != null && (
        <p className={cn("flex items-center gap-2 text-sm font-semibold", review.meets_expected ? "text-success" : "text-warning")}>
          <Cpu className="h-4 w-4" /> {review.meets_expected ? "Fast enough for the constraints" : "Likely too slow for the largest inputs"}
        </p>
      )}
      {review.complexity_explanation && <p className="text-sm text-fg-muted">{review.complexity_explanation}</p>}
      {review.mistakes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-fg-subtle">Mistakes to fix</p>
          {review.mistakes.map((m, i) => (
            <div key={i} className="rounded-xl border border-danger/25 bg-danger/5 p-3">
              <p className="text-sm font-semibold text-fg">{m.issue}</p>
              <p className="mt-1 text-sm text-fg-muted">{m.explanation}</p>
              {m.fix_hint && (
                <p className="mt-1.5 flex gap-1.5 text-sm text-fg">
                  <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue" /> {m.fix_hint}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      {(review.improvements.length > 0 || review.code_quality.length > 0) && (
        <div>
          <button onClick={() => setMore((m) => !m)} className="inline-flex items-center gap-1 text-sm font-semibold text-purple dark:text-[#c4b5fd]" aria-expanded={more}>
            Improvements and code quality <ChevronDown className={cn("h-4 w-4 transition-transform", more && "rotate-180")} />
          </button>
          {more && (
            <ul className="mt-2 space-y-1.5">
              {[...review.improvements, ...review.code_quality].map((x, i) => (
                <li key={i} className="flex gap-2 text-sm text-fg">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> {x}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="text-xs text-fg-subtle">Review by {review.model}. AI analysis can be wrong; the test results are the ground truth.</p>
    </div>
  );
}
