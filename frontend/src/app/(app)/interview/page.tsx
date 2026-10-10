"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, MessagesSquare, Plus, Trash2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import type { InterviewSummary } from "@/lib/types";
import { formatDate, scoreTone } from "@/lib/utils";

export default function InterviewsPage() {
  const toast = useToast();
  const [items, setItems] = useState<InterviewSummary[] | null>(null);
  const [error, setError] = useState("");

  const fetchItems = useCallback(
    () =>
      api<InterviewSummary[]>("/interviews")
        .then(setItems)
        .catch((e) => setError(errorMessage(e))),
    [],
  );
  useEffect(() => {
    fetchItems();
  }, [fetchItems]);
  const load = () => {
    setError("");
    fetchItems();
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this interview, its transcript and report?")) return;
    try {
      await api(`/interviews/${id}`, { method: "DELETE" });
      setItems((xs) => xs?.filter((x) => x.id !== id) ?? null);
      toast("Interview deleted.", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">AI Interview</h1>
          <p className="mt-1 text-fg-muted">Practise realistic interviews and track how you improve.</p>
        </div>
        <ButtonLink href="/interview/new" size="lg">
          <Plus className="h-5 w-5" /> New interview
        </ButtonLink>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}
      {!items && !error && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      )}

      {items && items.length === 0 && (
        <Card>
          <EmptyState
            icon={<MessagesSquare className="h-6 w-6" />}
            title="No interviews yet"
            description="Set up a mock interview for the role you're targeting. It takes about a minute."
            action={<ButtonLink href="/interview/new">Start your first interview</ButtonLink>}
          />
        </Card>
      )}

      <ul className="space-y-3">
        <AnimatePresence initial={false}>
          {items?.map((it, i) => {
            const tone = scoreTone(it.overall_score);
            const href = it.status === "completed" ? `/interview/${it.id}/report` : `/interview/${it.id}`;
            return (
              <motion.li
                key={it.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0, transition: { delay: i * 0.03 } }}
                exit={{ opacity: 0, height: 0 }}
              >
                <Card interactive className="flex items-center gap-4 p-4">
                  <div
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl font-display text-base font-bold"
                    style={{ background: "var(--bg-muted)", color: tone.color }}
                    aria-label={it.overall_score == null ? "No score" : `Score ${Math.round(it.overall_score)}`}
                  >
                    {it.overall_score == null ? "—" : Math.round(it.overall_score)}
                  </div>
                  <Link href={href} className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-fg">{it.role}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
                      <Badge tone="brand">{it.interview_type}</Badge>
                      <span>{it.difficulty}</span>
                      <span>·</span>
                      <span>{formatDate(it.started_at)}</span>
                      {it.status === "in_progress" && <Badge tone="warning">In progress</Badge>}
                    </div>
                  </Link>
                  <Button variant="ghost" size="icon" onClick={() => remove(it.id)} aria-label={`Delete interview for ${it.role}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Link href={href} aria-label={it.status === "completed" ? "View report" : "Resume"} className="hidden text-fg-subtle hover:text-fg sm:block">
                    <ArrowRight className="h-5 w-5" />
                  </Link>
                </Card>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}
