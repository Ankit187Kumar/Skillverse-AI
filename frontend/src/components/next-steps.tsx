"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Code2, GraduationCap, MessagesSquare, Sparkles, Target, Telescope } from "lucide-react";
import type { NextStep } from "@/lib/types";

export const STEP_ICON: Record<string, React.ReactNode> = {
  interview: <MessagesSquare className="h-4 w-4" />,
  learn: <GraduationCap className="h-4 w-4" />,
  review: <BookOpen className="h-4 w-4" />,
  coding: <Code2 className="h-4 w-4" />,
  research: <Telescope className="h-4 w-4" />,
  goal: <Target className="h-4 w-4" />,
};

/** Actionable recommendation cards linking to the right place in the app. */
export function NextSteps({ steps }: { steps: NextStep[] }) {
  if (!steps.length) return <p className="text-sm text-fg-muted">You&apos;re all caught up. 🎉</p>;
  return (
    <ul className="space-y-2">
      {steps.map((r, i) => (
        <li key={i}>
          <Link href={r.href} className="group flex items-center gap-3 rounded-xl border border-line p-3 transition-colors hover:border-purple/40 hover:bg-muted/50">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-purple dark:text-[#c4b5fd]">{STEP_ICON[r.kind] ?? <Sparkles className="h-4 w-4" />}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-fg">{r.title}</span>
              <span className="block truncate text-xs text-fg-muted">{r.detail}</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

