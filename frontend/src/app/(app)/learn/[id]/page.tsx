"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  CircleDot,
  ClipboardCheck,
  Hammer,
  Lightbulb,
  MessagesSquare,
  PlayCircle,
  RotateCcw,
  Target,
} from "lucide-react";
import { ScoreRing } from "@/components/charts";
import { JobStatus } from "@/components/job-status";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, ErrorState, ProgressBar, Skeleton } from "@/components/ui/feedback";
import { api, errorMessage } from "@/lib/api";
import type { CourseDetail, Job, Recommendation } from "@/lib/types";
import { useJob } from "@/lib/use-job";
import { cn } from "@/lib/utils";

const REC_ICON: Record<string, React.ReactNode> = {
  continue: <PlayCircle className="h-4 w-4" />,
  review: <RotateCcw className="h-4 w-4" />,
  review_module: <RotateCcw className="h-4 w-4" />,
  assessment: <ClipboardCheck className="h-4 w-4" />,
  project: <Hammer className="h-4 w-4" />,
  interview: <MessagesSquare className="h-4 w-4" />,
};

function recHref(courseId: number, r: Recommendation) {
  if (r.href) return r.href;
  if (r.lesson_key) return `/learn/${courseId}/${r.lesson_key}`;
  if (r.kind === "assessment") return `/learn/${courseId}/assessment`;
  if (r.kind === "project") return `/learn/${courseId}/project`;
  return `/learn/${courseId}`;
}

export default function CoursePage() {
  const { id } = useParams<{ id: string }>();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);

  const fetchCourse = useCallback(
    () =>
      api<CourseDetail>(`/learning/courses/${id}`)
        .then(setCourse)
        .catch((e) => setError(errorMessage(e))),
    [id],
  );
  useEffect(() => {
    fetchCourse();
  }, [fetchCourse]);

  const { job } = useJob(course?.job ?? null, () => fetchCourse());

  const retry = async () => {
    setRetrying(true);
    try {
      const r = await api<{ course: CourseDetail; job: Job }>(`/learning/courses/${id}/retry`, { method: "POST" });
      setCourse(r.course);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRetrying(false);
    }
  };

  if (error && !course) return <ErrorState message={error} onRetry={() => { setError(""); fetchCourse(); }} />;
  if (!course) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-48 rounded-3xl" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  const back = (
    <Link href="/learn" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg">
      <ArrowLeft className="h-4 w-4" /> Courses
    </Link>
  );

  if (course.status === "generating") {
    return (
      <div className="mx-auto max-w-2xl">
        {back}
        <h1 className="mb-4 font-display text-2xl font-bold text-fg">{course.topic}</h1>
        <JobStatus job={job ?? { id: 0, kind: "course_outline", status: "running", progress: 5, message: "Designing your curriculum", ref_type: null, ref_id: null, error: null, created_at: "", updated_at: "" }} title="Building your learning path" />
      </div>
    );
  }
  if (course.status === "failed") {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        {back}
        <h1 className="font-display text-2xl font-bold text-fg">{course.topic}</h1>
        <ErrorState message={course.error ?? "The outline couldn't be created."} />
        <Button onClick={retry} loading={retrying}>
          <RotateCcw className="h-4 w-4" /> Try again
        </Button>
      </div>
    );
  }

  const s = course.stats;
  const resumeKey = s.resume_lesson_key;
  return (
    <div className="space-y-6">
      {back}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-line bg-elevated p-6 shadow-card sm:p-8"
      >
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-brand-gradient opacity-15 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center">
          <div className="flex-1">
            <div className="flex flex-wrap gap-2">
              <Badge tone="brand">{course.level}</Badge>
              <Badge>{course.hours_per_week} h/week</Badge>
              {course.status === "completed" && <Badge tone="success">Completed</Badge>}
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">{course.title}</h1>
            {course.description && <p className="mt-2 max-w-2xl text-fg-muted">{course.description}</p>}
            <div className="mt-5 max-w-md">
              <div className="mb-1.5 flex justify-between text-sm font-semibold">
                <span className="text-fg">
                  {s.completed_lessons} of {s.total_lessons} lessons
                </span>
                <span className="text-fg-muted">{s.progress}%</span>
              </div>
              <ProgressBar value={s.progress} label="Course progress" />
            </div>
            {resumeKey && course.status !== "completed" && (
              <ButtonLink href={`/learn/${course.id}/${resumeKey}`} size="lg" className="mt-5">
                <PlayCircle className="h-5 w-5" /> {s.completed_lessons ? "Continue where you stopped" : "Start the first lesson"}
              </ButtonLink>
            )}
          </div>
          <div className="flex items-center gap-4 self-center lg:self-auto">
            <ScoreRing score={s.mastery} label="Mastery" size={120} />
            <p className="max-w-[9rem] text-xs text-fg-subtle">Mastery is your average best quiz score across attempted lessons.</p>
          </div>
        </div>
      </motion.section>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {course.modules.map((m) => {
            const done = m.lessons.filter((l) => l.status === "completed").length;
            return (
              <Card key={m.index}>
                <CardHeader
                  title={`Module ${m.index + 1}: ${m.title}`}
                  description={m.summary}
                  action={
                    <span className="whitespace-nowrap text-xs font-semibold text-fg-subtle">
                      {done}/{m.lessons.length}
                    </span>
                  }
                />
                <CardBody className="pt-4">
                  {m.objectives.length > 0 && (
                    <ul className="mb-4 flex flex-wrap gap-1.5">
                      {m.objectives.map((o) => (
                        <li key={o} className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs text-fg-muted">
                          <Target className="h-3 w-3 text-coral" /> {o}
                        </li>
                      ))}
                    </ul>
                  )}
                  <ol className="space-y-1">
                    {m.lessons.map((l) => (
                      <li key={l.key}>
                        <Link
                          href={`/learn/${course.id}/${l.key}`}
                          className={cn(
                            "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted",
                            l.key === resumeKey && "bg-brand-soft ring-1 ring-purple/20",
                          )}
                        >
                          {l.status === "completed" ? (
                            <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-label="Completed" />
                          ) : l.status === "in_progress" ? (
                            <CircleDot className="h-5 w-5 shrink-0 text-blue" aria-label="In progress" />
                          ) : (
                            <Circle className="h-5 w-5 shrink-0 text-line-strong" aria-label="Not started" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-fg">{l.title}</span>
                            {l.summary && <span className="block truncate text-xs text-fg-subtle">{l.summary}</span>}
                          </span>
                          {l.best_quiz_score != null && (
                            <Badge tone={l.best_quiz_score >= 60 ? "success" : "warning"}>{Math.round(l.best_quiz_score)}%</Badge>
                          )}
                          <ArrowRight className="h-4 w-4 shrink-0 text-fg-subtle" />
                        </Link>
                      </li>
                    ))}
                  </ol>
                </CardBody>
              </Card>
            );
          })}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Recommended for you" icon={<Lightbulb className="h-4 w-4" />} />
            <CardBody className="space-y-2">
              {course.recommendations.length ? (
                course.recommendations.map((r, i) => (
                  <Link key={i} href={recHref(course.id, r)} className="flex gap-3 rounded-xl border border-line p-3 transition-colors hover:border-purple/40 hover:bg-muted/50">
                    <span className="mt-0.5 text-purple dark:text-[#c4b5fd]">{REC_ICON[r.kind] ?? <Lightbulb className="h-4 w-4" />}</span>
                    <span>
                      <span className="block text-sm font-semibold text-fg">{r.title}</span>
                      <span className="block text-xs text-fg-muted">{r.detail}</span>
                    </span>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-fg-muted">You&apos;re all caught up.</p>
              )}
            </CardBody>
          </Card>

          {course.outcomes.length > 0 && (
            <Card>
              <CardHeader title="You will be able to" icon={<Target className="h-4 w-4" />} />
              <CardBody>
                <ul className="space-y-2">
                  {course.outcomes.map((o) => (
                    <li key={o} className="flex gap-2 text-sm text-fg">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {o}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          <Card interactive>
            <Link href={`/learn/${course.id}/assessment`} className="block p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-purple dark:text-[#c4b5fd]">
                  <ClipboardCheck className="h-5 w-5" />
                </span>
                <div className="flex-1">
                  <p className="font-display font-semibold text-fg">Final assessment</p>
                  <p className="text-xs text-fg-muted">
                    {course.assessment_result ? `Last score ${Math.round(course.assessment_result.score)}%` : "10 questions across all modules"}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-fg-subtle" />
              </div>
            </Link>
          </Card>

          {course.project && (
            <Card interactive>
              <Link href={`/learn/${course.id}/project`} className="block p-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-purple dark:text-[#c4b5fd]">
                    <Hammer className="h-5 w-5" />
                  </span>
                  <div className="flex-1">
                    <p className="font-display font-semibold text-fg">Capstone: {course.project.title}</p>
                    <p className="text-xs text-fg-muted">
                      {course.project_feedback ? `Reviewed · ${Math.round(course.project_feedback.score)}/100` : course.project_submitted ? "Submitted" : "Build it and get AI feedback"}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-fg-subtle" />
                </div>
              </Link>
            </Card>
          )}
          <p className="px-1 text-xs text-fg-subtle">Course written by {course.model_name}. AI content can contain mistakes; cross-check important facts.</p>
        </div>
      </div>
    </div>
  );
}
