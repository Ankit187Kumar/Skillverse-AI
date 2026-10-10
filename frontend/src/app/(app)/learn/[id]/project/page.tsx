"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Hammer, Rocket, Send, ThumbsUp, Wrench } from "lucide-react";
import { ScoreBars, ScoreRing } from "@/components/charts";
import { JobStatus } from "@/components/job-status";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/field";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import type { CourseDetail, Job } from "@/lib/types";
import { useJob } from "@/lib/use-job";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [error, setError] = useState("");
  const [text, setText] = useState("");

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

  const review = useJob(null, () => fetchCourse());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      review.setJob(await api<Job>(`/learning/courses/${id}/project`, { method: "POST", body: { submission: text } }));
      toast("Submitted — your reviewer is reading it.", "info");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  if (error) return <ErrorState message={error} />;
  if (!course) return <Skeleton className="mx-auto h-96 max-w-3xl" />;
  const p = course.project;
  const fb = course.project_feedback;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={`/learn/${id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Back to course
      </Link>
      {p ? (
        <>
          <div>
            <p className="text-sm font-semibold text-purple dark:text-[#c4b5fd]">Capstone project</p>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">{p.title}</h1>
          </div>
          <Card>
            <CardHeader title="The brief" icon={<Hammer className="h-4 w-4" />} />
            <CardBody className="space-y-5">
              <Markdown>{p.brief}</Markdown>
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-fg-subtle">Requirements</h3>
                <ul className="space-y-2">
                  {p.requirements.map((r) => (
                    <li key={r} className="flex gap-2 text-sm text-fg">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {r}
                    </li>
                  ))}
                </ul>
              </div>
              {p.stretch.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-fg-subtle">Stretch goals</h3>
                  <ul className="space-y-2">
                    {p.stretch.map((r) => (
                      <li key={r} className="flex gap-2 text-sm text-fg">
                        <Rocket className="mt-0.5 h-4 w-4 shrink-0 text-cyan" /> {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardBody>
          </Card>

          {(review.running || review.job?.status === "failed") && <JobStatus job={review.job} title="Reviewing your project" />}

          {fb && !review.running && (
            <Card>
              <CardHeader title="Reviewer feedback" icon={<ThumbsUp className="h-4 w-4" />} />
              <CardBody className="space-y-6">
                <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
                  <ScoreRing score={fb.score} label="Project score" size={116} />
                  <p className="flex-1 leading-relaxed text-fg">{fb.summary}</p>
                </div>
                {fb.rubric.length > 0 && <ScoreBars items={fb.rubric.map((r) => ({ label: r.criterion, value: r.score, hint: r.comment }))} />}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-fg-subtle">Strengths</h3>
                    <ul className="space-y-2">
                      {fb.strengths.map((s) => (
                        <li key={s} className="flex gap-2 text-sm text-fg">
                          <ThumbsUp className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-fg-subtle">Improve next</h3>
                    <ul className="space-y-2">
                      {fb.improvements.map((s) => (
                        <li key={s} className="flex gap-2 text-sm text-fg">
                          <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-coral" /> {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title={fb ? "Submit an improved version" : "Submit your project"} icon={<Send className="h-4 w-4" />} />
            <CardBody>
              <form onSubmit={submit} className="space-y-4">
                <Field label="Describe what you built" htmlFor="sub" hint="Paste code, explain your approach and decisions, and add repository links. The reviewer can't open links, so include the important parts here.">
                  <Textarea id="sub" value={text} onChange={(e) => setText(e.target.value)} rows={10} maxLength={20000} className="font-mono text-sm" />
                </Field>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-fg-subtle">{text.length}/20000 · minimum 30 characters</span>
                  <Button type="submit" disabled={text.trim().length < 30} loading={review.running}>
                    <Send className="h-4 w-4" /> Get feedback
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>
        </>
      ) : (
        <ErrorState message="This course has no project." />
      )}
    </div>
  );
}
