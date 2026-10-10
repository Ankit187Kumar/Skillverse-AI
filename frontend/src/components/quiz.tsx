"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle } from "lucide-react";
import type { QuizResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Markdown } from "./markdown";

/** Multiple-choice quiz. Answers are graded on the server; `result` shows feedback per question. */
export function Quiz({
  questions,
  result,
  onSubmit,
  submitting,
  submitLabel = "Check my answers",
  meta,
}: {
  questions: { question: string; options: string[]; module?: string }[];
  result: QuizResult | null;
  onSubmit: (answers: (number | null)[]) => void;
  submitting?: boolean;
  submitLabel?: string;
  meta?: React.ReactNode;
}) {
  const [answers, setAnswers] = useState<(number | null)[]>(() =>
    result ? result.results.map((r) => r.chosen) : questions.map(() => null),
  );
  const [showResult, setShowResult] = useState(!!result);
  const answered = answers.filter((a) => a !== null).length;

  const retry = () => {
    setAnswers(questions.map(() => null));
    setShowResult(false);
  };

  return (
    <div className="space-y-5">
      {questions.map((q, qi) => {
        const r = showResult && result ? result.results[qi] : null;
        return (
          <fieldset key={qi} className="rounded-2xl border border-line p-4 sm:p-5">
            <legend className="sr-only">Question {qi + 1}</legend>
            <div className="mb-3 flex items-start gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-soft font-display text-sm font-bold text-fg">
                {qi + 1}
              </span>
              <div className="flex-1">
                {q.module && <p className="mb-1 text-xs font-semibold text-fg-subtle">{q.module}</p>}
                <Markdown className="text-[15px] font-semibold">{q.question}</Markdown>
              </div>
              {r && (r.correct ? <CheckCircle2 className="h-5 w-5 text-success" aria-label="Correct" /> : <XCircle className="h-5 w-5 text-danger" aria-label="Incorrect" />)}
            </div>
            <div className="grid gap-2">
              {q.options.map((opt, oi) => {
                const chosen = answers[qi] === oi;
                const isCorrect = r && r.correct_index === oi;
                const isWrongChoice = r && chosen && !r.correct;
                return (
                  <label
                    key={oi}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-colors",
                      r ? "cursor-default" : "hover:border-purple/50",
                      isCorrect
                        ? "border-success/50 bg-success/10"
                        : isWrongChoice
                          ? "border-danger/50 bg-danger/10"
                          : chosen
                            ? "border-purple bg-brand-soft"
                            : "border-line",
                    )}
                  >
                    <input
                      type="radio"
                      name={`q-${qi}`}
                      checked={chosen}
                      disabled={!!r}
                      onChange={() => setAnswers((a) => a.map((v, i) => (i === qi ? oi : v)))}
                      className="mt-0.5 accent-[#7C3AED]"
                    />
                    <span className="text-fg">{opt}</span>
                  </label>
                );
              })}
            </div>
            {r && r.explanation && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 rounded-xl bg-muted p-3 text-sm text-fg-muted">
                {r.explanation}
              </motion.p>
            )}
          </fieldset>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-fg-muted">{meta ?? `${answered} of ${questions.length} answered`}</span>
        {showResult && result ? (
          <Button variant="outline" onClick={retry}>
            Try again
          </Button>
        ) : (
          <Button
            onClick={() => {
              onSubmit(answers);
              setShowResult(true);
            }}
            loading={submitting}
            disabled={answered < questions.length}
          >
            {submitLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
