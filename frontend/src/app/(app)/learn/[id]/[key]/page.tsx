"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  HelpCircle,
  Key,
  Lightbulb,
  ListChecks,
  RefreshCw,
  Send,
  Sparkles,
  Target,
  Wand2,
} from "lucide-react";
import { JobStatus } from "@/components/job-status";
import { Markdown } from "@/components/markdown";
import { Quiz } from "@/components/quiz";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { AIThinking, Badge, ErrorState, ProgressBar, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import type { Job, Lesson, LessonExercise, QuizResult } from "@/lib/types";
import { useJob } from "@/lib/use-job";
import { cn } from "@/lib/utils";

export default function LessonPage() {
  const { id, key } = useParams<{ id: string; key: string }>();
  const toast = useToast();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState("");
  const [genJob, setGenJob] = useState<Job | null>(null);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [quizBusy, setQuizBusy] = useState(false);
  const [advice, setAdvice] = useState("");
  const [completing, setCompleting] = useState(false);
  const base = `/learning/courses/${id}/lessons/${key}`;

  const fetchLesson = useCallback(
    () =>
      api<Lesson>(base)
        .then((l) => {
          setLesson(l);
          setQuizResult(l.content?.last_quiz ?? null);
          return l;
        })
        .catch((e) => {
          setError(errorMessage(e));
          return null;
        }),
    [base],
  );

  const generate = useCallback(
    async (regenerate = false) => {
      try {
        setGenJob(await api<Job>(`${base}/generate${regenerate ? "?regenerate=true" : ""}`, { method: "POST" }));
      } catch (e) {
        setError(errorMessage(e));
      }
    },
    [base],
  );

  // Load the lesson; if it hasn't been written yet, start writing it right away.
  useEffect(() => {
    fetchLesson().then((l) => {
      if (!l) return;
      if (l.job) setGenJob(l.job);
      else if (!l.content) generate();
    });
  }, [fetchLesson, generate]);

  const { job, running } = useJob(genJob, () => fetchLesson());
  const remedial = useJob(null, () => fetchLesson());

  const submitQuiz = async (answers: (number | null)[]) => {
    setQuizBusy(true);
    try {
      const r = await api<QuizResult & { advice: string; status: Lesson["status"]; best_quiz_score: number }>(`${base}/quiz`, {
        method: "POST",
        body: { answers },
      });
      setQuizResult(r);
      setAdvice(r.advice);
      setLesson((l) => (l ? { ...l, status: r.status, best_quiz_score: r.best_quiz_score, quiz_attempts: l.quiz_attempts + 1 } : l));
      toast(r.passed ? `Passed with ${Math.round(r.score)}%` : `${Math.round(r.score)}% — review and try again`, r.passed ? "success" : "info");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setQuizBusy(false);
    }
  };

  const markComplete = async () => {
    setCompleting(true);
    try {
      await api(`${base}/complete`, { method: "POST" });
      setLesson((l) => (l ? { ...l, status: "completed" } : l));
      toast("Lesson marked complete.", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setCompleting(false);
    }
  };

  const simplify = async () => {
    try {
      remedial.setJob(await api<Job>(`${base}/simplify`, { method: "POST" }));
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const updateExercise = (i: number, ex: LessonExercise) =>
    setLesson((l) => (l && l.content ? { ...l, content: { ...l.content, exercises: l.content.exercises.map((e, j) => (j === i ? ex : e)) } } : l));

  if (error && !lesson) return <ErrorState message={error} onRetry={() => { setError(""); fetchLesson(); }} />;
  if (!lesson) {
    return (
      <div className="mx-auto max-w-3xl space-y-4" aria-busy="true">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const c = lesson.content;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/learn/${id}`} className="inline-flex min-w-0 items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4 shrink-0" /> <span className="truncate">{lesson.course_title}</span>
        </Link>
        <span className="whitespace-nowrap text-xs font-semibold text-fg-subtle">
          Lesson {lesson.position + 1} of {lesson.total_lessons}
        </span>
      </div>
      <ProgressBar value={((lesson.position + (lesson.status === "completed" ? 1 : 0.5)) / lesson.total_lessons) * 100} label="Position in course" />

      <header>
        <p className="text-sm font-semibold text-purple dark:text-[#c4b5fd]">
          Module {lesson.module_index + 1} · {lesson.module_title}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">{lesson.title}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          {lesson.status === "completed" && <Badge tone="success"><CheckCircle2 className="h-3 w-3" /> Completed</Badge>}
          {lesson.best_quiz_score != null && <Badge tone="brand">Best quiz {Math.round(lesson.best_quiz_score)}%</Badge>}
        </div>
      </header>

      {(running || job?.status === "failed") && (
        <JobStatus job={job} title="Your tutor is writing this lesson" onRetry={() => generate()} />
      )}

      {c && (
        <>
          {c.objectives.length > 0 && (
            <Card>
              <CardHeader title="In this lesson you will" icon={<Target className="h-4 w-4" />} />
              <CardBody>
                <ul className="space-y-2">
                  {c.objectives.map((o) => (
                    <li key={o} className="flex gap-2 text-sm text-fg">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {o}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Lesson" icon={<BookOpen className="h-4 w-4" />} />
            <CardBody>
              <Markdown>{c.explanation}</Markdown>
            </CardBody>
          </Card>

          <Remedial lesson={lesson} running={remedial.running} job={remedial.job} onSimplify={simplify} />

          {c.examples.length > 0 && (
            <Card>
              <CardHeader title="Worked examples" icon={<Sparkles className="h-4 w-4" />} />
              <CardBody className="space-y-5">
                {c.examples.map((ex, i) => (
                  <div key={i} className="rounded-2xl border border-line p-4">
                    <h3 className="mb-2 font-display text-[15px] font-semibold text-fg">{ex.title}</h3>
                    <Markdown>{ex.content}</Markdown>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          {c.key_points.length > 0 && (
            <Card className="bg-brand-soft">
              <CardHeader title="Key takeaways" icon={<Key className="h-4 w-4" />} />
              <CardBody>
                <ul className="space-y-2">
                  {c.key_points.map((k) => (
                    <li key={k} className="flex gap-2 text-sm font-medium text-fg">
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-purple dark:text-[#c4b5fd]" /> {k}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Practice exercises" description="Use hints first. The full solution unlocks after a hint or an attempt." icon={<Lightbulb className="h-4 w-4" />} />
            <CardBody className="space-y-5">
              {c.exercises.map((ex, i) => (
                <ExerciseCard key={i} index={i} ex={ex} base={base} onChange={(e) => updateExercise(i, e)} />
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Check your understanding"
              description={`Pass mark ${lesson.pass_mark}%. Passing completes the lesson.`}
              icon={<ListChecks className="h-4 w-4" />}
            />
            <CardBody>
              {quizResult && (
                <div className={cn("mb-5 rounded-2xl p-4", quizResult.passed ? "bg-success/10" : "bg-warning/10")} role="status">
                  <p className="font-display text-lg font-bold text-fg">
                    {Math.round(quizResult.score)}% · {quizResult.passed ? "Passed" : "Not passed yet"}
                  </p>
                  {advice && <p className="mt-1 text-sm text-fg-muted">{advice}</p>}
                  {!quizResult.passed && !c.remedial && (
                    <Button size="sm" variant="outline" className="mt-3" onClick={simplify} loading={remedial.running}>
                      <Wand2 className="h-4 w-4" /> Explain it more simply
                    </Button>
                  )}
                </div>
              )}
              <Quiz key={`${lesson.quiz_attempts}`} questions={c.quiz} result={quizResult} onSubmit={submitQuiz} submitting={quizBusy} />
            </CardBody>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              {lesson.status !== "completed" && (
                <Button variant="outline" onClick={markComplete} loading={completing}>
                  <CheckCircle2 className="h-4 w-4" /> Mark complete
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => {
                  if (confirm("Rewrite this lesson? The current text, hints and exercise feedback will be replaced.")) generate(true);
                }}
                disabled={running}
              >
                <RefreshCw className="h-4 w-4" /> Rewrite lesson
              </Button>
            </div>
            {lesson.status === "completed" && lesson.next_key && (
              <ButtonLink href={`/learn/${id}/${lesson.next_key}`}>
                Next lesson <ArrowRight className="h-4 w-4" />
              </ButtonLink>
            )}
          </div>
        </>
      )}

      <nav className="flex items-center justify-between border-t border-line pt-5" aria-label="Lesson navigation">
        {lesson.prev_key ? (
          <Link href={`/learn/${id}/${lesson.prev_key}`} className="inline-flex items-center gap-1 text-sm font-semibold text-fg-muted hover:text-fg">
            <ChevronLeft className="h-4 w-4" /> Previous
          </Link>
        ) : (
          <span />
        )}
        {lesson.next_key ? (
          <Link href={`/learn/${id}/${lesson.next_key}`} className="inline-flex items-center gap-1 text-sm font-semibold text-fg-muted hover:text-fg">
            Next <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <Link href={`/learn/${id}/assessment`} className="inline-flex items-center gap-1 text-sm font-semibold text-purple dark:text-[#c4b5fd]">
            Final assessment <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </nav>
    </div>
  );
}

function Remedial({ lesson, running, job, onSimplify }: { lesson: Lesson; running: boolean; job: Job | null; onSimplify: () => void }) {
  const r = lesson.content?.remedial;
  if (running || job?.status === "failed") return <JobStatus job={job} title="Writing a simpler explanation" onRetry={onSimplify} />;
  if (!r) {
    return (
      <button
        onClick={onSimplify}
        className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-line p-4 text-left text-sm transition-colors hover:border-purple/50 hover:bg-muted/40"
      >
        <Wand2 className="h-5 w-5 text-purple dark:text-[#c4b5fd]" />
        <span>
          <span className="block font-semibold text-fg">Still confusing? Explain it more simply</span>
          <span className="text-fg-muted">Get an everyday analogy and smaller step-by-step examples.</span>
        </span>
      </button>
    );
  }
  return (
    <Card className="border-cyan/40">
      <CardHeader title="In simpler terms" icon={<Wand2 className="h-4 w-4" />} />
      <CardBody className="space-y-4">
        {r.analogy && <p className="rounded-xl bg-cyan/10 p-3 text-sm text-fg"><strong>Analogy:</strong> {r.analogy}</p>}
        <Markdown>{r.explanation}</Markdown>
        {r.examples.map((ex, i) => (
          <div key={i} className="rounded-xl border border-line p-3">
            <p className="mb-1 text-sm font-semibold text-fg">{ex.title}</p>
            <Markdown>{ex.content}</Markdown>
          </div>
        ))}
        {r.check_yourself.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-fg-subtle">Check yourself</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-fg">
              {r.check_yourself.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

const VERDICT = {
  correct: { label: "Correct", cls: "bg-success/10 border-success/40" },
  partially_correct: { label: "Partly there", cls: "bg-warning/10 border-warning/40" },
  incorrect: { label: "Not yet", cls: "bg-danger/5 border-danger/30" },
};

function ExerciseCard({ index, ex, base, onChange }: { index: number; ex: LessonExercise; base: string; onChange: (e: LessonExercise) => void }) {
  const toast = useToast();
  const [answer, setAnswer] = useState(ex.feedback?.answer ?? "");
  const [busy, setBusy] = useState<"hint" | "solution" | "check" | null>(null);

  const call = async (kind: "hint" | "solution" | "check") => {
    setBusy(kind);
    try {
      const next = await api<LessonExercise>(`${base}/exercises/${index}/${kind}`, {
        method: "POST",
        body: kind === "check" ? { answer } : undefined,
      });
      onChange(next);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const tried = ex.hints.length > 0 || !!ex.feedback;
  return (
    <div className="rounded-2xl border border-line p-4 sm:p-5">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-fg-subtle">Exercise {index + 1}</p>
      <Markdown>{ex.prompt}</Markdown>

      <AnimatePresence initial={false}>
        {ex.hints.map((h, i) => (
          <motion.div key={i} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3 overflow-hidden">
            <div className="flex gap-2 rounded-xl bg-warning/10 p-3 text-sm text-fg">
              <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <span className="min-w-0 flex-1">
                <strong>Hint {i + 1}:</strong> <Markdown className="inline text-sm [&>p]:inline">{h}</Markdown>
              </span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      <div className="mt-4">
        <label htmlFor={`ex-${index}`} className="mb-1.5 block text-sm font-semibold text-fg">
          Your attempt
        </label>
        <Textarea id={`ex-${index}`} value={answer} onChange={(e) => setAnswer(e.target.value)} rows={4} maxLength={6000} placeholder="Write your answer or code here…" className="font-mono text-sm" />
      </div>

      {busy === "check" && <AIThinking label="Checking your attempt" className="mt-3" />}
      {ex.feedback && busy !== "check" && (
        <div className={cn("mt-3 rounded-xl border p-3", VERDICT[ex.feedback.verdict].cls)} role="status">
          <p className="text-sm font-bold text-fg">{VERDICT[ex.feedback.verdict].label}</p>
          <Markdown className="mt-1 text-sm">{ex.feedback.feedback}</Markdown>
          {ex.feedback.next_step && <p className="mt-2 text-sm text-fg-muted">Next: {ex.feedback.next_step}</p>}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => call("check")} disabled={answer.trim().length < 3} loading={busy === "check"}>
          <Send className="h-4 w-4" /> Check my attempt
        </Button>
        <Button size="sm" variant="outline" onClick={() => call("hint")} disabled={ex.hints.length >= ex.hints_total} loading={busy === "hint"}>
          <HelpCircle className="h-4 w-4" /> {ex.hints.length >= ex.hints_total ? "No more hints" : `Hint (${ex.hints.length}/${ex.hints_total})`}
        </Button>
        {!ex.solution && (
          <Button size="sm" variant="ghost" onClick={() => call("solution")} disabled={!tried} loading={busy === "solution"} title={tried ? undefined : "Try a hint or an attempt first"}>
            <Eye className="h-4 w-4" /> Show solution
          </Button>
        )}
      </div>

      {ex.solution && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 rounded-xl bg-brand-soft p-4">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-purple dark:text-[#c4b5fd]">Solution</p>
          <Markdown>{ex.solution}</Markdown>
        </motion.div>
      )}
    </div>
  );
}
