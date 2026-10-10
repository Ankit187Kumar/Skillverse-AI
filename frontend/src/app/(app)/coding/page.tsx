"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Circle, CircleDot, Code2, History, ShieldCheck } from "lucide-react";
import { DIFF_TONE } from "@/components/coding-ui";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Segmented, Select } from "@/components/ui/field";
import { Badge, ErrorState, ProgressBar, Skeleton } from "@/components/ui/feedback";
import { api, errorMessage } from "@/lib/api";
import type { CodingConfig, CodingStats, ProblemListItem } from "@/lib/types";

type Diff = "All" | "Easy" | "Medium" | "Hard";

export default function CodingPage() {
  const [cfg, setCfg] = useState<CodingConfig | null>(null);
  const [stats, setStats] = useState<CodingStats | null>(null);
  const [data, setData] = useState<{ topics: string[]; problems: ProblemListItem[] } | null>(null);
  const [error, setError] = useState("");
  const [diff, setDiff] = useState<Diff>("All");
  const [topic, setTopic] = useState("");
  const [status, setStatus] = useState("");

  const fetchAll = useCallback(
    () =>
      Promise.all([api<CodingConfig>("/coding/config"), api<CodingStats>("/coding/stats"), api<{ topics: string[]; problems: ProblemListItem[] }>("/coding/problems")])
        .then(([c, s, d]) => {
          setCfg(c);
          setStats(s);
          setData(d);
        })
        .catch((e) => setError(errorMessage(e))),
    [],
  );
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const list = useMemo(
    () =>
      (data?.problems ?? []).filter(
        (p) => (diff === "All" || p.difficulty === diff) && (!topic || p.topic === topic) && (!status || p.status === status),
      ),
    [data, diff, topic, status],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">Coding Lab</h1>
          <p className="mt-1 text-fg-muted">Solve problems, run them against real tests in a sandbox, and get AI feedback on complexity and mistakes.</p>
        </div>
        <ButtonLink href="/coding/history" variant="outline">
          <History className="h-4 w-4" /> Practice history
        </ButtonLink>
      </div>

      {error && <ErrorState message={error} />}

      {cfg &&
        (cfg.execution_available ? (
          <p className="flex items-start gap-2 rounded-2xl border border-success/30 bg-success/5 p-3.5 text-sm text-fg">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            Code runs in an isolated {cfg.runner} sandbox, never on the app server. Languages: {cfg.languages.map((l) => `${l.label} ${l.version}`).join(", ")}.
          </p>
        ) : (
          <p className="flex items-start gap-2 rounded-2xl border border-warning/40 bg-warning/10 p-3.5 text-sm text-fg">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            {cfg.error ?? "Code execution isn't configured."} You can still write solutions and get an AI review; see the README to enable the Piston or Judge0 sandbox.
          </p>
        ))}

      {stats && (
        <section aria-label="Your coding stats" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="p-4">
            <p className="text-sm font-semibold text-fg-subtle">Solved</p>
            <p className="mt-1 font-display text-3xl font-bold text-fg">
              {stats.solved}
              <span className="text-base font-semibold text-fg-subtle">/{stats.total_problems}</span>
            </p>
          </Card>
          {(["Easy", "Medium", "Hard"] as const).map((d) => (
            <Card key={d} className="p-4">
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-fg-subtle">{d}</span>
                <span className="text-fg">
                  {stats.by_difficulty[d].solved}/{stats.by_difficulty[d].total}
                </span>
              </div>
              <ProgressBar
                className="mt-3"
                value={stats.by_difficulty[d].total ? (100 * stats.by_difficulty[d].solved) / stats.by_difficulty[d].total : 0}
                label={`${d} solved`}
              />
            </Card>
          ))}
        </section>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented<Diff> label="Difficulty" value={diff} onChange={setDiff} options={(["All", "Easy", "Medium", "Hard"] as Diff[]).map((v) => ({ value: v, label: v }))} />
        <div className="grid grid-cols-2 gap-2 lg:w-96">
          <Select aria-label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
            <option value="">All topics</option>
            {data?.topics.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
          <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            <option value="new">Not tried</option>
            <option value="attempted">Attempted</option>
            <option value="solved">Solved</option>
          </Select>
        </div>
      </div>

      {!data && !error && <Skeleton className="h-96" />}
      <Card className="overflow-hidden">
        <ul className="divide-y divide-line">
          {list.map((p, i) => (
            <motion.li key={p.slug} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: Math.min(i, 15) * 0.02 } }}>
              <Link href={`/coding/${p.slug}`} className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-muted/60 sm:px-5">
                {p.status === "solved" ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-label="Solved" />
                ) : p.status === "attempted" ? (
                  <CircleDot className="h-5 w-5 shrink-0 text-warning" aria-label="Attempted" />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-line-strong" aria-label="Not tried" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-fg">{p.title}</span>
                  <span className="block text-xs text-fg-subtle">{p.topic}</span>
                </span>
                <Badge tone={DIFF_TONE[p.difficulty]}>{p.difficulty}</Badge>
              </Link>
            </motion.li>
          ))}
          {data && list.length === 0 && (
            <li className="flex flex-col items-center gap-2 p-10 text-center text-sm text-fg-muted">
              <Code2 className="h-6 w-6" /> No problems match these filters.
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}
