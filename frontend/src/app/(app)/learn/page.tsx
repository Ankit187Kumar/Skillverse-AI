"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, BookOpen, GraduationCap, Loader2, Plus, Trash2, Trophy } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState, ErrorState, ProgressBar, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import type { CourseSummary } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

export default function LearnPage() {
  const toast = useToast();
  const [items, setItems] = useState<CourseSummary[] | null>(null);
  const [error, setError] = useState("");

  const fetchItems = useCallback(
    () =>
      api<CourseSummary[]>("/learning/courses")
        .then(setItems)
        .catch((e) => setError(errorMessage(e))),
    [],
  );
  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Refresh while an outline is still being written.
  useEffect(() => {
    if (!items?.some((c) => c.status === "generating")) return;
    const t = setTimeout(fetchItems, 2500);
    return () => clearTimeout(t);
  }, [items, fetchItems]);

  const remove = async (c: CourseSummary) => {
    if (!confirm(`Delete “${c.title}” and all its progress?`)) return;
    try {
      await api(`/learning/courses/${c.id}`, { method: "DELETE" });
      setItems((xs) => xs?.filter((x) => x.id !== c.id) ?? null);
      toast("Course deleted.", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const active = items?.filter((c) => c.status !== "completed") ?? [];
  const done = items?.filter((c) => c.status === "completed") ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">Learn Skills</h1>
          <p className="mt-1 text-fg-muted">Your AI tutor builds a course for any topic and adapts to how you do.</p>
        </div>
        <ButtonLink href="/learn/new" size="lg">
          <Plus className="h-5 w-5" /> New course
        </ButtonLink>
      </div>

      {error && (
        <ErrorState
          message={error}
          onRetry={() => {
            setError("");
            fetchItems();
          }}
        />
      )}
      {!items && !error && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      )}
      {items?.length === 0 && (
        <Card>
          <EmptyState
            icon={<GraduationCap className="h-6 w-6" />}
            title="Start your first course"
            description="Pick any topic — Python, public speaking, statistics, guitar theory — and get a personalised learning path."
            action={<ButtonLink href="/learn/new">Create a course</ButtonLink>}
          />
        </Card>
      )}

      {active.length > 0 && <CourseGrid items={active} onDelete={remove} />}
      {done.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-fg">
            <Trophy className="h-5 w-5 text-warning" /> Completed
          </h2>
          <CourseGrid items={done} onDelete={remove} />
        </section>
      )}
    </div>
  );
}

function CourseGrid({ items, onDelete }: { items: CourseSummary[]; onDelete: (c: CourseSummary) => void }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((c, i) => (
        <motion.li key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }}>
          <Card interactive className="flex h-full flex-col p-5">
            <div className="flex items-start justify-between gap-2">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-gradient text-white shadow-[0_8px_20px_-8px_rgb(124_58_237/0.7)]">
                {c.status === "generating" ? <Loader2 className="h-5 w-5 animate-spin" /> : c.status === "failed" ? <AlertTriangle className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
              </span>
              <div className="flex items-center gap-1">
                <Badge>{c.level}</Badge>
                <button onClick={() => onDelete(c)} className="rounded-lg p-1.5 text-fg-subtle hover:bg-muted hover:text-danger" aria-label={`Delete ${c.title}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <Link href={`/learn/${c.id}`} className="mt-3 flex-1">
              <h3 className="font-display text-[17px] font-semibold leading-snug text-fg">{c.title}</h3>
              <p className="mt-1 text-xs text-fg-subtle">Updated {timeAgo(c.updated_at)}</p>
            </Link>
            {c.status === "generating" ? (
              <p className="mt-4 text-sm text-fg-muted">Designing your curriculum…</p>
            ) : c.status === "failed" ? (
              <p className="mt-4 text-sm text-danger">Outline failed — open to retry.</p>
            ) : (
              <div className="mt-4">
                <div className="mb-1.5 flex justify-between text-xs font-semibold text-fg-muted">
                  <span>
                    {c.stats.completed_lessons}/{c.stats.total_lessons} lessons
                  </span>
                  <span>{c.stats.mastery != null ? `Mastery ${Math.round(c.stats.mastery)}%` : `${c.stats.progress}%`}</span>
                </div>
                <ProgressBar value={c.stats.progress} label={`${c.title} progress`} />
              </div>
            )}
            <Link
              href={c.stats.resume_lesson_key && c.status !== "completed" ? `/learn/${c.id}/${c.stats.resume_lesson_key}` : `/learn/${c.id}`}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-purple hover:underline dark:text-[#c4b5fd]"
            >
              {c.status === "completed" ? "Review course" : c.stats.completed_lessons ? "Continue learning" : "Open course"} <ArrowRight className="h-4 w-4" />
            </Link>
          </Card>
        </motion.li>
      ))}
    </ul>
  );
}
