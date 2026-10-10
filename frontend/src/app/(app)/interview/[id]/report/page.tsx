"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  Info,
  Lightbulb,
  MessageSquareQuote,
  Printer,
  RefreshCw,
  Repeat,
  ThumbsDown,
  ThumbsUp,
  Target,
} from "lucide-react";
import { ScoreBars, ScoreRing } from "@/components/charts";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { AIThinking, Badge, ErrorState, Skeleton } from "@/components/ui/feedback";
import { api, errorMessage } from "@/lib/api";
import type { Interview, Report, ScoreKey } from "@/lib/types";
import { cn, formatDate, formatDuration, scoreTone } from "@/lib/utils";

const LABELS: Record<ScoreKey, string> = {
  accuracy: "Accuracy & relevance",
  technical_knowledge: "Role knowledge",
  communication: "Communication clarity",
  problem_solving: "Problem solving",
  confidence: "Confident delivery",
};

function List({ items, icon, tone }: { items: string[]; icon: React.ReactNode; tone: string }) {
  if (!items.length) return <p className="text-sm text-fg-subtle">None noted.</p>;
  return (
    <ul className="space-y-2.5">
      {items.map((s, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-fg">
          <span className={cn("mt-0.5 shrink-0", tone)}>{icon}</span>
          {s}
        </li>
      ))}
    </ul>
  );
}

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [iv, setIv] = useState<Interview | null>(null);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [open, setOpen] = useState<number | null>(0);
  const [showCriteria, setShowCriteria] = useState(false);

  const fetchAll = useCallback(
    () =>
      Promise.all([api<Report>(`/interviews/${id}/report`), api<Interview>(`/interviews/${id}`)])
        .then(([r, i]) => {
          setReport(r);
          setIv(i);
        })
        .catch((e) => setError(errorMessage(e))),
    [id],
  );
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);
  const load = () => {
    setError("");
    fetchAll();
  };

  const retry = async () => {
    setRetrying(true);
    try {
      setReport(await api<Report>(`/interviews/${id}/report/retry`, { method: "POST" }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRetrying(false);
    }
  };

  if (error && !report) return <ErrorState message={error} onRetry={load} />;
  if (!report || !iv) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-56 rounded-3xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
      <Link href="/interview" className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Interviews
      </Link>
      <div className="flex gap-2">
        {report.status === "ready" && (
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print / PDF
          </Button>
        )}
        <ButtonLink href="/interview/new" size="sm">
          <Repeat className="h-4 w-4" /> Practise again
        </ButtonLink>
      </div>
    </div>
  );

  if (report.status === "failed" || !report.data) {
    const noAnswers = report.error?.startsWith("No answers");
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        {header}
        <Card className="p-6 text-center sm:p-8">
          <h1 className="font-display text-xl font-bold text-fg">
            {noAnswers ? "Nothing to evaluate yet" : "We couldn't generate your report"}
          </h1>
          <p className="mt-2 text-sm text-fg-muted">{report.error}</p>
          {!noAnswers && (
            <div className="mt-5 flex justify-center">
              {retrying ? (
                <AIThinking label="Writing your report" />
              ) : (
                <Button onClick={retry}>
                  <RefreshCw className="h-4 w-4" /> Try again
                </Button>
              )}
            </div>
          )}
          <p className="mt-4 text-xs text-fg-subtle">Your transcript is saved, so you can retry any time.</p>
        </Card>
      </div>
    );
  }

  const d = report.data;
  const tone = scoreTone(report.overall_score);
  const answered = iv.turns.filter((t) => t.role === "candidate").length;

  return (
    <div className="space-y-5">
      {header}

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-line bg-elevated p-6 shadow-card sm:p-8"
      >
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-brand-gradient opacity-15 blur-3xl" />
        <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <ScoreRing score={report.overall_score} label="Overall score" />
          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
              <Badge tone="brand">{iv.config.interview_type}</Badge>
              <Badge>{iv.config.difficulty}</Badge>
              <Badge>{iv.config.experience_level}</Badge>
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">{iv.config.role}</h1>
            <p className="mt-1 text-sm text-fg-subtle">
              {formatDate(iv.started_at)} · {answered} answers · {formatDuration(iv.elapsed_seconds)} · overall{" "}
              <span style={{ color: tone.color }} className="font-semibold">
                {tone.label.toLowerCase()}
              </span>
            </p>
            <p className="mt-4 leading-relaxed text-fg">{d.summary}</p>
          </div>
        </div>
      </motion.section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Score breakdown"
            icon={<Target className="h-4 w-4" />}
            action={
              <button
                onClick={() => setShowCriteria((s) => !s)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-purple hover:underline dark:text-[#c4b5fd]"
                aria-expanded={showCriteria}
              >
                <Info className="h-3.5 w-3.5" /> How we score
              </button>
            }
          />
          <CardBody>
            <AnimatePresence>
              {showCriteria && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="mb-5 rounded-xl bg-muted p-4 text-xs leading-relaxed text-fg-muted">
                    <p className="mb-2 font-semibold text-fg">
                      Each criterion is scored 0–100 by the AI from your written answers. The overall score is a weighted average calculated by SkillVerse, not by the AI.
                    </p>
                    <ul className="space-y-1.5">
                      {(Object.keys(LABELS) as ScoreKey[]).map((k) => (
                        <li key={k}>
                          <strong className="text-fg">
                            {LABELS[k]} ({Math.round(report.weights[k] * 100)}%):
                          </strong>{" "}
                          {report.criteria[k]}
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <ScoreBars
              items={(Object.keys(LABELS) as ScoreKey[]).map((k) => ({
                label: LABELS[k],
                value: d.scores[k],
                hint: k === "confidence" ? "Based only on your wording, never on camera, voice or emotions." : undefined,
              }))}
            />
          </CardBody>
        </Card>

        <div className="grid gap-5">
          <Card>
            <CardHeader title="Strengths" icon={<ThumbsUp className="h-4 w-4" />} />
            <CardBody>
              <List items={d.strengths} icon={<ThumbsUp className="h-4 w-4" />} tone="text-success" />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="To improve" icon={<ThumbsDown className="h-4 w-4" />} />
            <CardBody>
              <List items={d.weaknesses} icon={<Target className="h-4 w-4" />} tone="text-coral" />
            </CardBody>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader title="Question-by-question feedback" description="Open a question to see what worked and a suggested answer." icon={<MessageSquareQuote className="h-4 w-4" />} />
        <CardBody className="space-y-2">
          {d.question_feedback.map((q, i) => {
            const isOpen = open === i;
            const t = scoreTone(q.score);
            return (
              <div key={i} className="overflow-hidden rounded-2xl border border-line">
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-muted/60"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft font-display text-sm font-bold text-fg">{i + 1}</span>
                  <span className="flex-1 text-sm font-semibold leading-relaxed text-fg">{q.question}</span>
                  <span className="shrink-0 font-display text-sm font-bold tabular-nums" style={{ color: t.color }}>
                    {Math.round(q.score)}
                  </span>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-fg-subtle transition-transform", isOpen && "rotate-180")} />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                      <div className="space-y-4 border-t border-line p-4 text-sm leading-relaxed">
                        {q.answer_summary && (
                          <div>
                            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-fg-subtle">Your answer, in short</p>
                            <p className="text-fg-muted">{q.answer_summary}</p>
                          </div>
                        )}
                        <div>
                          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-fg-subtle">Feedback</p>
                          <p className="text-fg">{q.feedback}</p>
                        </div>
                        <div className="rounded-xl bg-brand-soft p-4">
                          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-purple dark:text-[#c4b5fd]">Suggested answer</p>
                          <p className="text-fg">{q.suggested_answer}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Improvement tips" icon={<Lightbulb className="h-4 w-4" />} />
          <CardBody>
            <List items={d.improvement_tips} icon={<Lightbulb className="h-4 w-4" />} tone="text-warning" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Study next" icon={<BookOpen className="h-4 w-4" />} />
          <CardBody className="space-y-4">
            <ul className="space-y-2">
              {d.recommended_lessons.map((l) => (
                <li key={l}>
                  <Link
                    href={`/learn/new?topic=${encodeURIComponent(l)}&goal=${encodeURIComponent(`Prepare for ${iv.config.role} interviews`)}`}
                    className="group flex items-start gap-2.5 rounded-lg text-sm leading-relaxed text-fg hover:text-purple dark:hover:text-[#c4b5fd]"
                  >
                    <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-blue" />
                    <span className="flex-1">{l}</span>
                    <span className="shrink-0 text-xs font-semibold text-purple opacity-0 transition-opacity group-hover:opacity-100 dark:text-[#c4b5fd] print:hidden">Start course →</span>
                  </Link>
                </li>
              ))}
            </ul>
            {d.skill_gaps.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-fg-subtle">Skill gaps for this role</p>
                <div className="flex flex-wrap gap-1.5">
                  {d.skill_gaps.map((g) => (
                    <Badge key={g} tone="warning">
                      {g}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Practise these next" icon={<Repeat className="h-4 w-4" />} />
          <CardBody>
            <List items={d.practice_questions} icon={<MessageSquareQuote className="h-4 w-4" />} tone="text-cyan" />
          </CardBody>
        </Card>
      </div>

      {d.confidence_signals.length > 0 && (
        <Card>
          <CardHeader title="What the confidence score is based on" description="Observable signals from your written answers only." icon={<Info className="h-4 w-4" />} />
          <CardBody>
            <List items={d.confidence_signals} icon={<Info className="h-4 w-4" />} tone="text-fg-subtle" />
          </CardBody>
        </Card>
      )}

      <p className="text-center text-xs text-fg-subtle">
        Report generated by {report.model_name}. AI feedback can be wrong or incomplete, so use it as a guide rather than a verdict.
      </p>
    </div>
  );
}
