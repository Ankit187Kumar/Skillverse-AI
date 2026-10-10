"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { Job } from "./types";

/** Polls a background job until it finishes, then calls onDone(job). */
export function useJob(initial: Job | null, onDone?: (job: Job) => void) {
  const [job, setJob] = useState<Job | null>(initial);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  const [tracked, setTracked] = useState<Job | null>(initial);
  if (initial && initial.id !== tracked?.id) {
    setTracked(initial);
    setJob(initial);
  }

  useEffect(() => {
    if (!job || job.status === "succeeded" || job.status === "failed") return;
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const next = await api<Job>(`/jobs/${job.id}`);
        if (!alive) return;
        setJob(next);
        if (next.status === "succeeded" || next.status === "failed") done.current?.(next);
      } catch {
        if (alive) setJob({ ...job }); // retry on transient errors
      }
    }, 1500);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [job]);

  const running = !!job && (job.status === "queued" || job.status === "running");
  return { job, running, setJob };
}
