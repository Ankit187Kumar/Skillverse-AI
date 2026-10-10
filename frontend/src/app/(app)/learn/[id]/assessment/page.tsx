"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ClipboardCheck, RefreshCw } from "lucide-react";
import { ScoreBars, ScoreRing } from "@/components/charts";
import { JobStatus } from "@/components/job-status";
import { Quiz } from "@/components/quiz";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { AssessmentResult, Job } from "@/lib/types";
import { useJob } from "@/lib/use-job";

interface Assessment {
  course_id: number;
  course_title: string;
  questions: { question: string; options: string[]; module: string }[];
  result: AssessmentResult | null;
}

export default function AssessmentPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [data, setData] = useState<Assessment | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchData = useCallback(
    () =>
      api<Assessment>(`/learning/courses/${id}/assessment`)
        .then((d) => {
          setData(d);
          setMissing(false);
        })
        .catch((e) => {
          if (e instanceof ApiError && e.status === 404) setMissing(true);
          else setError(errorMessage(e));
        }),
    [id],
  );
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const gen = useJob(null, (j) => j.status === "succeeded" && fetchData());

  const create = async () => {
    try {
      gen.setJob(await api<Job>(`/learning/courses/${id}/assessment`, { method: "POST" }));
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const submit = async (answers: (number | null)[]) => {
    setBusy(true);
    try {
      const result = await api<AssessmentResult>(`/learning/courses/${id}/assessment/submit`, { method: "POST", body: { answers } });
      setData((d) => (d ? { ...d, result } : d));
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={`/learn/${id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Back to course
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">Final assessment</h1>
          {data && <p className="mt-1 text-fg-muted">{data.course_title}</p>}
        </div>
        {data && !gen.running && (
          <Button variant="outline" size="sm" onClick={() => confirm("Generate a new set of questions?") && create()}>
            <RefreshCw className="h-4 w-4" /> New questions
          </Button>
        )}
      </div>

      {error && <ErrorState message={error} />}
      {(gen.running || gen.job?.status === "failed") && <JobStatus job={gen.job} title="Writing your assessment" onRetry={create} />}
      {!data && !missing && !error && <Skeleton className="h-80" />}
      {missing && !gen.running && (
        <Card>
          <EmptyState
            icon={<ClipboardCheck className="h-6 w-6" />}
            title="Ready to test yourself?"
            description="10 questions across every module. You'll get a score per module and suggestions for what to revisit."
            action={<Button onClick={create}>Create my assessment</Button>}
          />
        </Card>
      )}

      {data?.result && (
        <Card>
          <CardHeader title="Your result" icon={<ClipboardCheck className="h-4 w-4" />} />
          <CardBody className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            <ScoreRing score={data.result.score} label="Assessment score" />
            <div className="w-full flex-1">
              <ScoreBars items={data.result.module_scores.map((m) => ({ label: m.module, value: m.score }))} />
              {data.result.weak_modules.length > 0 && (
                <p className="mt-4 text-sm text-fg-muted">
                  Modules under 60% are added to your course recommendations so you can revisit them.
                </p>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {data && !gen.running && (
        <Card>
          <CardBody>
            <Quiz key={data.result?.submitted_at ?? "new"} questions={data.questions} result={data.result} onSubmit={submit} submitting={busy} submitLabel="Submit assessment" />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
