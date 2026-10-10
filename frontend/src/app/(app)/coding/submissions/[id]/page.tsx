"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { CodeEditor } from "@/components/code-editor";
import { JudgeResults, ReviewPanel, VerdictBadge } from "@/components/coding-ui";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { AIThinking, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import type { CodeLang, CodeReview, Judged } from "@/lib/types";
import { formatDate } from "@/lib/utils";

interface Submission extends Judged {
  id: number;
  problem: string;
  title: string;
  language: CodeLang;
  code: string;
  ai_review: CodeReview | null;
  created_at: string;
}

export default function SubmissionPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [s, setS] = useState<Submission | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Submission>(`/coding/submissions/${id}`)
      .then(setS)
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  const review = async () => {
    setBusy(true);
    try {
      const r = await api<CodeReview>(`/coding/submissions/${id}/review`, { method: "POST" });
      setS((x) => (x ? { ...x, ai_review: r } : x));
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorState message={error} />;
  if (!s) return <Skeleton className="h-96" />;
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href={`/coding/${s.problem}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> {s.title}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold text-fg">Submission #{s.id}</h1>
        <VerdictBadge verdict={s.verdict} />
        <span className="text-sm text-fg-subtle">
          {s.language} · {formatDate(s.created_at)}
        </span>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="h-[28rem] overflow-hidden">
          <CodeEditor value={s.code} language={s.language} readOnly label="Submitted code" />
        </Card>
        <div className="space-y-5">
          <Card>
            <CardBody>
              <JudgeResults judged={s} title="All tests" />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="AI review" icon={<Sparkles className="h-4 w-4" />} />
            <CardBody>
              {busy ? (
                <AIThinking label="Reviewing complexity and mistakes" />
              ) : s.ai_review ? (
                <ReviewPanel review={s.ai_review} />
              ) : (
                <Button onClick={review}>
                  <Sparkles className="h-4 w-4" /> Explain my result
                </Button>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
