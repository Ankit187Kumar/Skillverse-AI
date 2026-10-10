"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Code2, Sparkles } from "lucide-react";
import { DIFF_TONE, VerdictBadge } from "@/components/coding-ui";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { api, errorMessage } from "@/lib/api";
import type { SubmissionSummary } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

export default function HistoryPage() {
  const [items, setItems] = useState<SubmissionSummary[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<SubmissionSummary[]>("/coding/submissions?limit=100")
      .then(setItems)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/coding" className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Problems
      </Link>
      <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">Practice history</h1>
      {error && <ErrorState message={error} />}
      {!items && !error && <Skeleton className="h-64" />}
      {items?.length === 0 && (
        <Card>
          <EmptyState icon={<Code2 className="h-6 w-6" />} title="No submissions yet" action={<ButtonLink href="/coding">Pick a problem</ButtonLink>} />
        </Card>
      )}
      {!!items?.length && (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {items.map((s) => (
              <li key={s.id}>
                <Link href={`/coding/submissions/${s.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/60 sm:px-5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-fg">{s.title}</span>
                    <span className="text-xs text-fg-subtle">
                      {s.language} · {s.passed}/{s.total} tests · {timeAgo(s.created_at)}
                    </span>
                  </span>
                  {s.reviewed && <Sparkles className="h-4 w-4 text-purple" aria-label="AI reviewed" />}
                  {s.difficulty && <Badge tone={DIFF_TONE[s.difficulty as keyof typeof DIFF_TONE]}>{s.difficulty}</Badge>}
                  <VerdictBadge verdict={s.verdict} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
