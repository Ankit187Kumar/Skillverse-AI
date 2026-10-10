"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Award,
  BarChart3,
  CalendarCheck,
  Code2,
  Compass,
  Flame,
  GraduationCap,
  Lock,
  MessagesSquare,
  Pencil,
  RefreshCw,
  Sparkles,
  Target,
  TrendingDown,
} from "lucide-react";
import { Heatmap, ScoreBars, ScoreRing, TrendChart } from "@/components/charts";
import { JobStatus } from "@/components/job-status";
import { NextSteps, STEP_ICON } from "@/components/next-steps";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { Badge, EmptyState, ErrorState, ProgressBar, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import type { GoalsProgress, Job, Overview, Roadmap } from "@/lib/types";
import { useJob } from "@/lib/use-job";
import { cn, formatDate, tzOffset } from "@/lib/utils";

const fade = (i: number) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.04 * i } });

const SOURCE = {
  interviews: { label: "Interviews", icon: MessagesSquare },
  learning: { label: "Learning", icon: GraduationCap },
  coding: { label: "Coding", icon: Code2 },
} as const;

function actionHref(kind: string, target: string) {
  const t = encodeURIComponent(target);
  if (kind === "learn") return `/learn/new?topic=${t}`;
  if (kind === "interview") return `/interview/new?topics=${t}`;
  if (kind === "coding") return "/coding";
  if (kind === "research") return "/research";
  return "/dashboard";
}

export default function ProgressPage() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  const fetchOv = useCallback(
    () =>
      api<Overview>(`/analytics/overview?tz=${tzOffset()}`)
        .then(setOv)
        .catch((e) => setError(errorMessage(e))),
    [],
  );
  useEffect(() => {
    fetchOv();
  }, [fetchOv]);

  if (error) return <ErrorState message={error} onRetry={() => { setError(""); fetchOv(); }} />;
  if (!ov) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-40 rounded-3xl" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const earned = ov.badges.filter((b) => b.earned).length;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">Progress & analytics</h1>
        <p className="mt-1 text-fg-muted">Everything you&apos;ve practised, where you&apos;re strong, and what to do next.</p>
      </div>

      {/* Headline numbers */}
      <motion.section {...fade(0)} className="grid gap-4 lg:grid-cols-3">
        <Card className="flex items-center gap-4 p-5">
          <ScoreRing score={ov.overall_progress} size={104} stroke={10} label="Overall progress" />
          <div>
            <p className="text-sm font-semibold text-fg">Overall progress</p>
            <p className="text-xs text-fg-subtle">Blend of lessons completed, problems solved and interviews taken.</p>
          </div>
        </Card>
        <Card className="grid grid-cols-3 gap-2 p-5 lg:col-span-2">
          {[
            { label: "Current streak", value: `${ov.streak.current} d`, icon: Flame, tone: "text-coral" },
            { label: "Best streak", value: `${ov.streak.best} d`, icon: Award, tone: "text-warning" },
            { label: "Active days", value: ov.streak.active_days, icon: CalendarCheck, tone: "text-cyan" },
            { label: "Interviews", value: ov.interviews.completed, icon: MessagesSquare, tone: "text-purple" },
            { label: "Lessons done", value: ov.learning.lessons_completed, icon: GraduationCap, tone: "text-blue" },
            { label: "Problems solved", value: `${ov.coding.solved}/${ov.coding.total}`, icon: Code2, tone: "text-success" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl p-2">
              <s.icon className={cn("h-4 w-4", s.tone)} aria-hidden />
              <p className="mt-1 font-display text-xl font-bold text-fg sm:text-2xl">{s.value}</p>
              <p className="text-xs text-fg-subtle">{s.label}</p>
            </div>
          ))}
        </Card>
      </motion.section>

      <div className="grid gap-4 lg:grid-cols-3">
        <GoalsCard goals={ov.goals} onSaved={(g) => setOv({ ...ov, goals: g })} />
        <Card {...fade(2)} className="lg:col-span-2">
          <CardHeader title="Activity" description="Practice actions over the last 12 weeks" icon={<CalendarCheck className="h-4 w-4" />} />
          <CardBody>
            <Heatmap days={ov.streak.heatmap} />
          </CardBody>
        </Card>
      </div>

      <RoadmapCard />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card {...fade(3)} className="lg:col-span-3">
          <CardHeader title="Interview score trend" icon={<BarChart3 className="h-4 w-4" />} />
          <CardBody>
            {ov.interviews.trend.length ? (
              <>
                <TrendChart points={ov.interviews.trend.map((t) => ({ label: formatDate(t.date, { day: "numeric", month: "short" }), value: t.score, hint: `${t.type} · ${t.role}` }))} />
                {ov.interviews.by_type.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {ov.interviews.by_type.map((t) => (
                      <Badge key={t.type} tone="brand">
                        {t.type}: {Math.round(t.average)} avg · {t.count}×
                      </Badge>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <EmptyState icon={<MessagesSquare className="h-6 w-6" />} title="No interview scores yet" action={<ButtonLink href="/interview/new" size="sm">Start an interview</ButtonLink>} />
            )}
          </CardBody>
        </Card>
        <Card {...fade(4)} className="lg:col-span-2">
          <CardHeader title="Interview skills" description="Average of your last 10 reports" icon={<Target className="h-4 w-4" />} />
          <CardBody>
            <ScoreBars items={ov.interviews.criteria.map((c) => ({ label: c.label, value: c.score }))} />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card {...fade(5)}>
          <CardHeader title="Skill-wise mastery" description="Across interviews, courses and coding topics" icon={<Sparkles className="h-4 w-4" />} />
          <CardBody>
            {ov.skills.length ? (
              <ul className="space-y-3">
                {ov.skills.slice(0, 12).map((s) => {
                  const Src = SOURCE[s.source];
                  return (
                    <li key={`${s.source}-${s.skill}`}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                        <span className="flex min-w-0 items-center gap-2 font-semibold text-fg">
                          <Src.icon className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-label={Src.label} />
                          <span className="truncate">{s.skill}</span>
                        </span>
                        <span className="font-display font-bold tabular-nums text-fg">{Math.round(s.score)}</span>
                      </div>
                      <ProgressBar value={s.score} label={s.skill} />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-fg-muted">Your skill map fills in as you take interviews, quizzes and coding problems.</p>
            )}
          </CardBody>
        </Card>
        <Card {...fade(6)}>
          <CardHeader title="Weaknesses & skill gaps" description="Where focused practice will help most" icon={<TrendingDown className="h-4 w-4" />} />
          <CardBody>
            {ov.weaknesses.length ? (
              <ul className="space-y-2">
                {ov.weaknesses.map((w, i) => (
                  <li key={i} className="flex items-start gap-3 rounded-xl bg-muted/60 p-3">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-coral" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-fg">{w.title}</span>
                      <span className="block text-xs text-fg-muted">{w.detail}</span>
                    </span>
                    <Badge>{w.source}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg-muted">No clear weak spots yet. Keep practising and this list will guide you.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card {...fade(7)} className="lg:col-span-2">
          <CardHeader title="Courses & projects" icon={<GraduationCap className="h-4 w-4" />} action={<span className="text-sm font-semibold text-fg-muted">{ov.learning.progress}% of lessons</span>} />
          <CardBody>
            {ov.learning.courses.length ? (
              <ul className="space-y-3">
                {ov.learning.courses.map((c) => (
                  <li key={c.id}>
                    <Link href={`/learn/${c.id}`} className="block rounded-xl border border-line p-3 transition-colors hover:bg-muted/50">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-fg">{c.title}</span>
                        <span className="flex gap-1.5">
                          {c.status === "completed" && <Badge tone="success">Completed</Badge>}
                          {c.mastery != null && <Badge tone="brand">Mastery {Math.round(c.mastery)}%</Badge>}
                          {c.project_score != null && <Badge tone="warning">Project {Math.round(c.project_score)}</Badge>}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <ProgressBar value={c.progress} label={`${c.title} progress`} />
                        <span className="whitespace-nowrap text-xs text-fg-subtle">
                          {c.completed_lessons}/{c.total_lessons}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<GraduationCap className="h-6 w-6" />} title="No courses yet" action={<ButtonLink href="/learn/new" size="sm">Create a learning path</ButtonLink>} />
            )}
          </CardBody>
        </Card>
        <Card {...fade(8)}>
          <CardHeader title="Coding practice" icon={<Code2 className="h-4 w-4" />} />
          <CardBody className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-fg-muted">Acceptance rate</span>
              <span className="font-display font-bold text-fg">{ov.coding.acceptance_rate != null ? `${ov.coding.acceptance_rate}%` : "—"}</span>
            </div>
            <ScoreBars
              suffix="%"
              items={(["Easy", "Medium", "Hard"] as const).map((d) => ({
                label: d,
                hint: `${ov.coding.by_difficulty[d].solved} of ${ov.coding.by_difficulty[d].total} solved`,
                value: ov.coding.by_difficulty[d].total ? (100 * ov.coding.by_difficulty[d].solved) / ov.coding.by_difficulty[d].total : 0,
              }))}
            />
            <ButtonLink href="/coding/history" variant="outline" size="sm" className="w-full">
              Practice history
            </ButtonLink>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card {...fade(9)}>
          <CardHeader title="Recommended next" icon={<Compass className="h-4 w-4" />} />
          <CardBody>
            <NextSteps steps={ov.recommendations} />
          </CardBody>
        </Card>
        <Card {...fade(10)} className="lg:col-span-2">
          <CardHeader title="Badges" icon={<Award className="h-4 w-4" />} action={<span className="text-sm font-semibold text-fg-muted">{earned}/{ov.badges.length}</span>} />
          <CardBody>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {ov.badges.map((b) => (
                <li key={b.id} className={cn("rounded-2xl border p-3 text-center", b.earned ? "border-purple/30 bg-brand-soft" : "border-dashed border-line opacity-70")}>
                  <span className={cn("mx-auto grid h-10 w-10 place-items-center rounded-full", b.earned ? "bg-brand-gradient text-white" : "bg-muted text-fg-subtle")}>
                    {b.earned ? <Award className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
                  </span>
                  <p className="mt-2 text-sm font-semibold text-fg">{b.title}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-fg-subtle">{b.description}</p>
                  <span className="sr-only">{b.earned ? "Earned" : "Locked"}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function GoalsCard({ goals, onSaved }: { goals: GoalsProgress; onSaved: (g: GoalsProgress) => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => ({
    ...Object.fromEntries(goals.weekly.map((g) => [g.key, g.target])),
    daily: goals.daily.target,
  }) as Record<string, number>);
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const g = await api<GoalsProgress>(`/analytics/goals?tz=${tzOffset()}`, {
        method: "PUT",
        body: { weekly: { interviews: form.interviews, lessons: form.lessons, problems: form.problems, research: form.research }, daily: form.daily },
      });
      onSaved(g);
      setEditing(false);
      toast("Goals updated.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card {...fade(1)}>
      <CardHeader
        title="Goals"
        description={goals.weekly_complete ? "This week's goals are done! 🎉" : "Daily and weekly targets"}
        icon={<Target className="h-4 w-4" />}
        action={
          <Button variant="ghost" size="sm" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
            <Pencil className="h-4 w-4" /> {editing ? "Close" : "Edit"}
          </Button>
        }
      />
      <CardBody>
        {editing ? (
          <form onSubmit={save} className="space-y-3">
            {[["daily", "Practice actions per day", 1, 20], ...goals.weekly.map((g) => [g.key, `${g.label} per week`, 0, 100])].map(([k, label, min, max]) => (
              <label key={k as string} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-fg">{label as string}</span>
                <Input
                  type="number"
                  min={min as number}
                  max={max as number}
                  value={form[k as string]}
                  onChange={(e) => setForm({ ...form, [k as string]: Number(e.target.value) })}
                  className="h-9 w-20 text-center"
                />
              </label>
            ))}
            <Button type="submit" size="sm" loading={saving} className="w-full">
              Save goals
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-4 rounded-xl bg-brand-soft p-3">
              <ScoreRing score={Math.min(100, (100 * goals.daily.done) / Math.max(1, goals.daily.target))} size={64} stroke={7} label="Today's goal" />
              <div>
                <p className="text-sm font-semibold text-fg">Today</p>
                <p className="text-xs text-fg-muted">
                  {goals.daily.done} of {goals.daily.target} practice actions
                </p>
              </div>
            </div>
            {goals.weekly.map((g) => (
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
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function RoadmapCard() {
  const toast = useToast();
  const [data, setData] = useState<{ roadmap: Roadmap | null; created_at: string | null; model_name: string | null; job: Job | null } | null>(null);
  const fetchRoadmap = useCallback(
    () =>
      api<{ roadmap: Roadmap | null; created_at: string | null; model_name: string | null; job: Job | null }>("/analytics/roadmap")
        .then(setData)
        .catch(() => setData({ roadmap: null, created_at: null, model_name: null, job: null })),
    [],
  );
  useEffect(() => {
    fetchRoadmap();
  }, [fetchRoadmap]);
  const { job, running, setJob } = useJob(data?.job ?? null, () => fetchRoadmap());

  const generate = async () => {
    try {
      setJob(await api<Job>(`/analytics/roadmap?tz=${tzOffset()}`, { method: "POST" }));
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const r = data?.roadmap;
  return (
    <Card {...fade(2)} className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-brand-gradient p-5 text-white">
        <div className="flex items-center gap-3">
          <Compass className="h-6 w-6" />
          <div>
            <p className="font-display text-lg font-semibold">Your personalised improvement roadmap</p>
            <p className="text-sm text-white/80">{r ? r.headline : "AI analyses your interviews, courses and coding to plan your next steps."}</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={generate} loading={running} className="bg-white text-[#4C1D95] hover:bg-white/90">
          {r ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />} {r ? "Refresh" : "Create roadmap"}
        </Button>
      </div>
      <CardBody>
        {(running || job?.status === "failed") && <JobStatus job={job} title="Building your roadmap" onRetry={generate} />}
        {!r && !running && <p className="text-sm text-fg-muted">No roadmap yet. Create one any time; it works best after a few practice sessions.</p>}
        {r && !running && (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-3 lg:col-span-2">
              {r.focus_areas.map((f, i) => (
                <div key={i} className="rounded-2xl border border-line p-4">
                  <p className="font-display font-semibold text-fg">
                    {i + 1}. {f.title}
                  </p>
                  <p className="mt-1 text-sm text-fg-muted">{f.why}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {f.actions.map((a, j) => (
                      <Link key={j} href={actionHref(a.kind, a.target || a.label)} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-soft px-3 py-1.5 text-sm font-medium text-fg hover:ring-1 hover:ring-purple/40">
                        {STEP_ICON[a.kind] ?? <Sparkles className="h-4 w-4" />} {a.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-4">
              {r.weekly_plan.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-fg-subtle">This week</p>
                  <ol className="space-y-2">
                    {r.weekly_plan.map((d) => (
                      <li key={d.day} className="text-sm">
                        <span className="font-semibold text-fg">{d.day}:</span> <span className="text-fg-muted">{d.tasks.join(" · ")}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {r.milestones.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-fg-subtle">Milestones</p>
                  <ul className="space-y-1.5">
                    {r.milestones.map((m) => (
                      <li key={m} className="flex gap-2 text-sm text-fg">
                        <Target className="mt-0.5 h-4 w-4 shrink-0 text-coral" /> {m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {data?.created_at && (
                <p className="text-xs text-fg-subtle">
                  Generated {formatDate(data.created_at)} by {data.model_name}.
                </p>
              )}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
