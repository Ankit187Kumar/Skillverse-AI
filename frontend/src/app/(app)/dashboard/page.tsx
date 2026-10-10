"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import {
  Activity,
  ArrowRight,
  Award,
  CheckCircle2,
  Circle,
  Clock,
  Code2,
  Flame,
  GraduationCap,
  Lock,
  MessagesSquare,
  Quote,
  Sparkles,
  Target,
  Telescope,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { ScoreBars, TrendChart } from "@/components/charts";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, ProgressBar, Skeleton } from "@/components/ui/feedback";
import { api, errorMessage } from "@/lib/api";
import type { Dashboard } from "@/lib/types";
import { cn, formatDate, greeting, timeAgo, tzOffset } from "@/lib/utils";
import { NextSteps } from "@/components/next-steps";

const fade = (i: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: 0.04 * i, duration: 0.35 },
});

function CountUp({ value, suffix = "" }: { value: number | null; suffix?: string }) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => `${Math.round(v)}${suffix}`);
  useEffect(() => {
    if (value == null) return;
    const c = animate(mv, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1] });
    return () => c.stop();
  }, [value, mv]);
  if (value == null) return <span>—</span>;
  return <motion.span>{rounded}</motion.span>;
}

const QUICK = [
  { href: "/interview/new", title: "AI Interview", text: "Start a mock interview", icon: MessagesSquare, live: true },
  { href: "/learn", title: "Learn Skills", text: "Personal learning paths", icon: GraduationCap, live: true },
  { href: "/research", title: "Research Agent", text: "Cited research reports", icon: Telescope, live: true },
  { href: "/coding", title: "Coding Lab", text: "Sandboxed practice", icon: Code2, live: true },
];

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  const fetchData = useCallback(
    () =>
      api<Dashboard>(`/dashboard?tz=${tzOffset()}`)
        .then(setData)
        .catch((e) => setError(errorMessage(e))),
    [],
  );
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  const load = () => {
    setError("");
    fetchData();
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <DashboardSkeleton />;

  const { stats } = data;
  const trend = data.score_trend.map((p) => ({
    label: formatDate(p.date, { day: "numeric", month: "short" }),
    value: p.score,
    hint: p.role,
  }));

  return (
    <div className="space-y-6">
      {/* Hero */}
      <motion.section
        {...fade(0)}
        className="relative overflow-hidden rounded-3xl bg-brand-gradient p-6 text-white shadow-lift sm:p-8"
      >
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-[#F97373]/25 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-white/80">{greeting()},</p>
            <h1 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">{data.user.first_name} 👋</h1>
            <figure className="mt-4 flex gap-3 text-white/90">
              <Quote className="mt-0.5 h-5 w-5 shrink-0 opacity-70" aria-hidden />
              <blockquote>
                <p className="text-[15px] leading-relaxed">{data.quote.text}</p>
                <figcaption className="mt-1 text-sm text-white/70">— {data.quote.author}</figcaption>
              </blockquote>
            </figure>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 rounded-2xl bg-white/15 px-4 py-3 backdrop-blur">
              <motion.span
                animate={stats.streak > 0 ? { scale: [1, 1.15, 1] } : undefined}
                transition={{ repeat: Infinity, duration: 2.2 }}
              >
                <Flame className={cn("h-7 w-7", stats.streak > 0 ? "text-[#FFD2A8]" : "text-white/60")} />
              </motion.span>
              <div>
                <div className="font-display text-2xl font-bold leading-none">{stats.streak}</div>
                <div className="text-xs font-semibold text-white/80">day streak</div>
              </div>
            </div>
            <Link
              href={data.in_progress_interview ? `/interview/${data.in_progress_interview.id}` : "/interview/new"}
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-white px-5 text-sm font-bold text-[#4C1D95] shadow-lg transition-transform hover:scale-[1.03] active:scale-[0.98]"
            >
              {data.in_progress_interview ? "Resume interview" : "Start practising"} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </motion.section>

      {data.in_progress_interview && (
        <motion.div {...fade(1)}>
          <Link
            href={`/interview/${data.in_progress_interview.id}`}
            className="flex items-center gap-3 rounded-2xl border border-cyan/40 bg-cyan/10 p-4 text-sm transition-colors hover:bg-cyan/15"
          >
            <Clock className="h-5 w-5 text-cyan" />
            <span className="flex-1 text-fg">
              You have an unfinished interview for <strong>{data.in_progress_interview.role}</strong>. Pick up where you left off.
            </span>
            <ArrowRight className="h-4 w-4 text-fg-muted" />
          </Link>
        </motion.div>
      )}

      {/* Stats */}
      <section aria-label="Your stats" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[
          { label: "Interviews completed", value: stats.interviews_completed, icon: MessagesSquare },
          { label: "Average interview score", value: stats.average_score, icon: TrendingUp },
          { label: "Lessons completed", value: stats.lessons_completed, icon: GraduationCap },
          { label: `Problems solved (of ${stats.problems_total})`, value: stats.problems_solved, icon: Trophy },
        ].map((s, i) => (
          <Card key={s.label} {...fade(i + 1)} interactive className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-fg-subtle sm:text-sm">{s.label}</span>
              <s.icon className="h-4 w-4 text-purple dark:text-[#c4b5fd]" aria-hidden />
            </div>
            <div className="mt-2 font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
              <CountUp value={s.value} />
            </div>
          </Card>
        ))}
      </section>

      {/* Quick actions */}
      <section aria-label="Quick actions" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {QUICK.map((q, i) => (
          <Link key={q.href} href={q.href} className="rounded-2xl">
            <Card {...fade(i + 5)} interactive className="h-full p-4 sm:p-5">
              <div className="flex items-start justify-between">
                <span
                  className={cn(
                    "grid h-11 w-11 place-items-center rounded-xl",
                    q.live ? "bg-brand-gradient text-white shadow-[0_8px_20px_-8px_rgb(124_58_237/0.7)]" : "bg-muted text-fg-subtle",
                  )}
                >
                  <q.icon className="h-5 w-5" />
                </span>
                <ArrowRight className="h-4 w-4 text-fg-subtle" />
              </div>
              <h3 className="mt-3 font-display text-[15px] font-semibold text-fg">{q.title}</h3>
              <p className="mt-0.5 text-xs text-fg-muted sm:text-sm">{q.text}</p>
            </Card>
          </Link>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card {...fade(9)} className="lg:col-span-2">
          <CardHeader title="Recommended next" description="Personalised from your interviews, courses and coding" icon={<Sparkles className="h-4 w-4" />} action={<Link href="/progress" className="whitespace-nowrap text-sm font-semibold text-purple hover:underline dark:text-[#c4b5fd]">Full analytics →</Link>} />
          <CardBody>
            <NextSteps steps={data.recommendations} />
          </CardBody>
        </Card>
        <Card {...fade(10)}>
          <CardHeader title="This week" description={data.weekly_goals.weekly_complete ? "Weekly goals complete! 🎉" : "Your weekly goals"} icon={<Target className="h-4 w-4" />} />
          <CardBody className="space-y-3.5">
            <div className="flex items-center justify-between rounded-xl bg-brand-soft px-3 py-2 text-sm">
              <span className="font-semibold text-fg">Today</span>
              <span className="text-fg-muted">
                {data.weekly_goals.daily.done}/{data.weekly_goals.daily.target} practice actions
              </span>
            </div>
            {data.weekly_goals.weekly.map((g) => (
              <div key={g.key}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-fg">{g.label}</span>
                  <span className={cn("font-semibold", g.target && g.done >= g.target ? "text-success" : "text-fg-muted")}>
                    {g.done}/{g.target || "—"}
                  </span>
                </div>
                <ProgressBar value={g.target ? (100 * g.done) / g.target : 0} label={`${g.label} this week`} />
              </div>
            ))}
            {data.goals.length > 0 && (
              <div className="border-t border-line pt-3">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-fg-subtle">Your learning goals</h3>
                <ul className="space-y-1.5">
                  {data.goals.map((g) => (
                    <li key={g} className="flex gap-2 text-sm text-fg">
                      <Target className="mt-0.5 h-4 w-4 shrink-0 text-coral" aria-hidden /> {g}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Performance */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card {...fade(9)} className="lg:col-span-3">
          <CardHeader title="Interview performance" description="Overall score of your recent interviews" icon={<TrendingUp className="h-4 w-4" />} />
          <CardBody>
            {trend.length ? (
              <>
                <TrendChart points={trend} />
                {trend.length === 1 && (
                  <p className="mt-2 text-center text-xs text-fg-subtle">Complete another interview to start seeing your trend.</p>
                )}
              </>
            ) : (
              <EmptyState
                icon={<TrendingUp className="h-6 w-6" />}
                title="No scores yet"
                description="Finish your first mock interview to see your performance trend here."
                action={<ButtonLink href="/interview/new" size="sm">Start an interview</ButtonLink>}
              />
            )}
          </CardBody>
        </Card>
        <Card {...fade(10)} className="lg:col-span-2">
          <CardHeader title="Skill mastery" description="Average across your last 10 reports" icon={<Target className="h-4 w-4" />} />
          <CardBody>
            {data.skill_mastery.some((m) => m.score != null) ? (
              <ScoreBars items={data.skill_mastery.map((m) => ({ label: m.label, value: m.score }))} />
            ) : (
              <EmptyState icon={<Target className="h-6 w-6" />} title="Mastery appears after your first report" />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Roadmap */}
        <Card {...fade(11)}>
          <CardHeader
            title="Getting started"
            icon={<Sparkles className="h-4 w-4" />}
            action={<span className="font-display text-sm font-bold text-fg">{data.roadmap_progress}%</span>}
          />
          <CardBody className="space-y-4">
            <ProgressBar value={data.roadmap_progress} label="Roadmap progress" />
            <ul className="space-y-1">
              {data.roadmap.map((r) => (
                <li key={r.title}>
                  <Link
                    href={r.href}
                    className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm transition-colors hover:bg-muted"
                  >
                    {r.done ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-label="Done" />
                    ) : (
                      <Circle className="h-5 w-5 shrink-0 text-line-strong" aria-label="Not done" />
                    )}
                    <span className={cn("flex-1", r.done ? "text-fg-subtle line-through" : "text-fg")}>{r.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        {/* Continue learning */}
        <Card {...fade(12)}>
          <CardHeader title="Continue learning" icon={<GraduationCap className="h-4 w-4" />} />
          <CardBody className="space-y-3">
            {data.courses.length ? (
              data.courses.map((c) => (
                <Link key={c.id} href={c.resume_lesson_key ? `/learn/${c.id}/${c.resume_lesson_key}` : `/learn/${c.id}`} className="block rounded-xl border border-line p-3 transition-colors hover:bg-muted/50">
                  <p className="truncate text-sm font-semibold text-fg">{c.title}</p>
                  {c.resume_title && <p className="truncate text-xs text-fg-muted">Next: {c.resume_title}</p>}
                  <div className="mt-2 flex items-center gap-2">
                    <ProgressBar value={c.progress} label={`${c.title} progress`} />
                    <span className="text-xs text-fg-subtle">{c.progress}%</span>
                  </div>
                </Link>
              ))
            ) : (
              <EmptyState icon={<GraduationCap className="h-6 w-6" />} title="No courses yet" className="py-4" action={<ButtonLink href="/learn/new" size="sm">Create a learning path</ButtonLink>} />
            )}
          </CardBody>
        </Card>

        {/* Activity */}
        <Card {...fade(13)}>
          <CardHeader title="Recent activity" icon={<Activity className="h-4 w-4" />} />
          <CardBody>
            {data.recent_activity.length ? (
              <ol className="relative space-y-4 border-l border-line pl-5">
                {data.recent_activity.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-elevated bg-brand-gradient" />
                    {a.link ? (
                      <Link href={a.link} className="text-sm font-medium text-fg hover:text-purple dark:hover:text-[#c4b5fd]">
                        {a.title}
                      </Link>
                    ) : (
                      <p className="text-sm font-medium text-fg">{a.title}</p>
                    )}
                    <p className="text-xs text-fg-subtle">{timeAgo(a.created_at)}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-fg-muted">Nothing yet.</p>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Achievements */}
      <Card {...fade(14)}>
        <CardHeader
          title="Achievements"
          icon={<Award className="h-4 w-4" />}
          action={
            <Link href="/progress" className="whitespace-nowrap text-sm font-semibold text-purple hover:underline dark:text-[#c4b5fd]">
              {data.badges_earned}/{data.badges_total} badges →
            </Link>
          }
        />
        <CardBody>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {data.achievements.map((a) => (
              <li
                key={a.id}
                className={cn(
                  "rounded-2xl border p-4 text-center transition-all",
                  a.earned ? "border-purple/30 bg-brand-soft" : "border-dashed border-line opacity-70",
                )}
              >
                <span
                  className={cn(
                    "mx-auto grid h-11 w-11 place-items-center rounded-full",
                    a.earned ? "bg-brand-gradient text-white shadow-[0_6px_18px_-6px_rgb(124_58_237/0.7)]" : "bg-muted text-fg-subtle",
                  )}
                >
                  {a.earned ? <Award className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
                </span>
                <p className="mt-2 text-sm font-semibold text-fg">{a.title}</p>
                <p className="mt-0.5 text-xs text-fg-subtle">{a.description}</p>
                <span className="sr-only">{a.earned ? "Earned" : "Not earned yet"}</span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <Skeleton className="h-48 rounded-3xl" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-72 rounded-2xl lg:col-span-3" />
        <Skeleton className="h-72 rounded-2xl lg:col-span-2" />
      </div>
    </div>
  );
}
