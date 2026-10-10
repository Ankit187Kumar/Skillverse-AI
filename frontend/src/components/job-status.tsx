"use client";

import { motion } from "framer-motion";
import { RotateCcw, Sparkles } from "lucide-react";
import type { Job } from "@/lib/types";
import { Button } from "./ui/button";
import { AIThinking, ErrorState, ProgressBar } from "./ui/feedback";

/** Progress card for a background AI job (queued/running), or an error with retry when it failed. */
export function JobStatus({
  job,
  title,
  hint = "Local models can take a minute or two. You can leave this page; the work continues in the background.",
  onRetry,
}: {
  job: Job | null;
  title: string;
  hint?: string;
  onRetry?: () => void;
}) {
  if (!job) return null;
  if (job.status === "failed") {
    return <ErrorState message={job.error ?? "Something went wrong."} onRetry={onRetry} />;
  }
  if (job.status === "succeeded") return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl border border-line bg-elevated p-5 shadow-card"
      role="status"
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-gradient opacity-15 blur-2xl" />
      <div className="relative flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-gradient text-white">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold text-fg">{title}</p>
          <AIThinking label={job.message || "Working"} className="mt-1" />
          <ProgressBar value={Math.max(job.progress, 6)} className="mt-3" label={title} />
          <p className="mt-2 text-xs text-fg-subtle">{hint}</p>
        </div>
      </div>
    </motion.div>
  );
}

export function RetryButton({ onClick, label = "Try again" }: { onClick: () => void; label?: string }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      <RotateCcw className="h-4 w-4" /> {label}
    </Button>
  );
}
