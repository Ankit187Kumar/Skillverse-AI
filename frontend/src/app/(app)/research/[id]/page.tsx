"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  BookOpenCheck,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Globe,
  HelpCircle,
  Info,
  ListTree,
  Plus,
  Printer,
  RefreshCw,
  Scale,
  Sparkles,
  Telescope,
  Trash2,
} from "lucide-react";
import { JobStatus } from "@/components/job-status";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, TagInput } from "@/components/ui/field";
import { Badge, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import type { Claim, Job, ResearchProject, ResearchSource, SubQuestion } from "@/lib/types";
import { useJob } from "@/lib/use-job";
import { cn, formatDate } from "@/lib/utils";

export default function ResearchProjectPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [p, setP] = useState<ResearchProject | null>(null);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<SubQuestion[] | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchProject = useCallback(
    () =>
      api<ResearchProject>(`/research/projects/${id}`)
        .then((d) => {
          setP(d);
          setPlan(d.plan?.sub_questions ?? null);
        })
        .catch((e) => setError(errorMessage(e))),
    [id],
  );
  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const { job, running, setJob } = useJob(p?.job ?? null, () => fetchProject());

  const savePlan = async () => {
    if (!plan) return null;
    const cleaned = plan.filter((q) => q.question.trim().length >= 5);
    if (!cleaned.length) {
      toast("Add at least one sub-question (5+ characters).", "error");
      return null;
    }
    const d = await api<ResearchProject>(`/research/projects/${id}/plan`, { method: "PUT", body: { sub_questions: cleaned } });
    setP(d);
    setPlan(d.plan?.sub_questions ?? null);
    return d;
  };

  const run = async () => {
    setSaving(true);
    try {
      if (!(await savePlan())) return;
      setJob(await api<Job>(`/research/projects/${id}/run`, { method: "POST" }));
      setP((x) => (x ? { ...x, status: "running" } : x));
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const replan = async () => {
    if (!confirm("Create a new plan? Your edits to the current plan will be replaced.")) return;
    try {
      setJob(await api<Job>(`/research/projects/${id}/plan`, { method: "POST" }));
      setP((x) => (x ? { ...x, status: "planning" } : x));
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const exportMd = async (mode: "copy" | "download") => {
    try {
      const res = await fetch(`/api/research/projects/${id}/export.md`, { credentials: "same-origin" });
      if (!res.ok) throw new Error("Export failed.");
      const text = await res.text();
      if (mode === "copy") {
        await navigator.clipboard.writeText(text);
        toast("Report copied as Markdown.", "success");
      } else {
        const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `${(p?.title ?? "report").replace(/[^\w\- ]+/g, "_").slice(0, 60)}.md`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  if (error && !p) return <ErrorState message={error} onRetry={() => { setError(""); fetchProject(); }} />;
  if (!p) return <Skeleton className="h-96" />;

  const busy = running || p.status === "planning" || p.status === "running";
  const r = p.report;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/research" className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" /> Research
        </Link>
        {r && !busy && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => exportMd("copy")}>
              <Copy className="h-4 w-4" /> Copy
            </Button>
            <Button size="sm" variant="outline" onClick={() => exportMd("download")}>
              <Download className="h-4 w-4" /> Markdown
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print / PDF
            </Button>
          </div>
        )}
      </div>

      <header>
        <div className="flex flex-wrap gap-2">
          <Badge tone="brand">{p.field}</Badge>
          {p.use_web && p.web_available && <Badge><Globe className="h-3 w-3" /> Web</Badge>}
          {p.documents.length > 0 && <Badge><FileText className="h-3 w-3" /> {p.documents.length} document{p.documents.length > 1 ? "s" : ""}</Badge>}
        </div>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">{r?.title ?? p.title}</h1>
        <p className="mt-2 text-fg-muted">{p.prompt}</p>
      </header>

      {busy && (
        <JobStatus
          job={job ?? { id: 0, kind: "research", status: "running", progress: 5, message: p.status === "planning" ? "Planning" : "Researching", ref_type: null, ref_id: null, error: null, created_at: "", updated_at: "" }}
          title={p.status === "planning" ? "Planning your research" : "Researching"}
          hint="Searching, reading pages and writing can take a few minutes with local models. You can leave this page."
        />
      )}
      {p.status === "failed" && !busy && (
        <div className="space-y-3">
          <ErrorState message={p.error ?? "Research failed."} />
          <div className="flex gap-2">
            {p.plan ? <Button onClick={run} loading={saving}><RefreshCw className="h-4 w-4" /> Run again</Button> : <Button onClick={replan}><RefreshCw className="h-4 w-4" /> Plan again</Button>}
          </div>
        </div>
      )}

      {/* Plan editor */}
      {plan && !busy && (
        <PlanEditor
          plan={plan}
          setPlan={setPlan}
          collapsed={!!r}
          onRun={run}
          onReplan={replan}
          running={saving}
          meta={p.plan}
          hasReport={!!r}
        />
      )}

      {r && !busy && (
        <>
          <Legend notes={p.notes} sources={p.sources} />
          <Card>
            <CardHeader title="Executive summary" icon={<Sparkles className="h-4 w-4" />} />
            <CardBody className="space-y-3">
              {r.executive_summary.map((c, i) => (
                <ClaimText key={i} c={c} />
              ))}
            </CardBody>
          </Card>

          {r.key_findings.length > 0 && (
            <Card>
              <CardHeader title="Key findings" icon={<BookOpenCheck className="h-4 w-4" />} />
              <CardBody>
                <ul className="space-y-3">
                  {r.key_findings.map((c, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-gradient" />
                      <ClaimText c={c} />
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {r.sections.map((s, i) => (
            <Card key={i}>
              <CardHeader title={s.heading} />
              <CardBody className="space-y-4">
                {s.paragraphs.map((c, j) => (
                  <ClaimText key={j} c={c} />
                ))}
              </CardBody>
            </Card>
          ))}

          {r.viewpoints.length > 0 && (
            <Card>
              <CardHeader title="Viewpoints compared" icon={<Scale className="h-4 w-4" />} />
              <CardBody className="grid gap-3 sm:grid-cols-2">
                {r.viewpoints.map((v, i) => (
                  <div key={i} className="rounded-2xl border border-line p-4">
                    <p className="font-semibold text-fg">{v.perspective}</p>
                    <p className="mt-1 text-sm leading-relaxed text-fg-muted">
                      {v.summary} <Cites nums={v.citations} />
                    </p>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <Card>
              <CardHeader title="Limitations" icon={<AlertTriangle className="h-4 w-4" />} />
              <CardBody>
                <ul className="list-disc space-y-1.5 pl-5 text-sm text-fg">
                  {r.limitations.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Open questions" icon={<HelpCircle className="h-4 w-4" />} />
              <CardBody>
                <ul className="list-disc space-y-1.5 pl-5 text-sm text-fg">
                  {r.open_questions.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </div>

          <SourcesList sources={p.sources} />
          <p className="text-center text-xs text-fg-subtle">
            Written by {p.model_name} on {formatDate(p.updated_at)}. Check important claims against the linked sources.
          </p>
        </>
      )}
    </div>
  );
}

function PlanEditor({
  plan,
  setPlan,
  collapsed,
  onRun,
  onReplan,
  running,
  meta,
  hasReport,
}: {
  plan: SubQuestion[];
  setPlan: (p: SubQuestion[]) => void;
  collapsed: boolean;
  onRun: () => void;
  onReplan: () => void;
  running: boolean;
  meta: ResearchProject["plan"];
  hasReport: boolean;
}) {
  const [open, setOpen] = useState(!collapsed);
  const update = (i: number, q: Partial<SubQuestion>) => setPlan(plan.map((x, j) => (j === i ? { ...x, ...q } : x)));
  return (
    <Card className="print:hidden">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between p-5 text-left sm:p-6" aria-expanded={open}>
        <span className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-soft text-purple dark:text-[#c4b5fd]">
            <ListTree className="h-4 w-4" />
          </span>
          <span>
            <span className="block font-display font-semibold text-fg">Research plan</span>
            <span className="block text-sm text-fg-muted">{plan.length} sub-questions · edit before running</span>
          </span>
        </span>
        <ChevronDown className={cn("h-5 w-5 text-fg-subtle transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">
              {meta?.objective && <p className="text-sm text-fg"><strong>Objective:</strong> {meta.objective}</p>}
              {meta?.scope && <p className="text-sm text-fg-muted"><strong className="text-fg">Scope:</strong> {meta.scope}</p>}
              {plan.map((q, i) => (
                <div key={i} className="rounded-2xl border border-line p-4">
                  <div className="flex items-start gap-2">
                    <span className="mt-2.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-brand-soft text-xs font-bold text-fg">{i + 1}</span>
                    <Input value={q.question} onChange={(e) => update(i, { question: e.target.value })} aria-label={`Sub-question ${i + 1}`} maxLength={400} />
                    <Button variant="ghost" size="icon" onClick={() => setPlan(plan.filter((_, j) => j !== i))} aria-label={`Remove sub-question ${i + 1}`} disabled={plan.length <= 1}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mt-2 pl-8">
                    <TagInput value={q.search_queries} onChange={(v) => update(i, { search_queries: v })} placeholder="Search queries (Enter to add)" max={4} />
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap justify-between gap-2">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPlan([...plan, { question: "", search_queries: [] }])} disabled={plan.length >= 8}>
                    <Plus className="h-4 w-4" /> Add sub-question
                  </Button>
                  <Button variant="ghost" size="sm" onClick={onReplan}>
                    <RefreshCw className="h-4 w-4" /> New plan
                  </Button>
                </div>
                <Button onClick={onRun} loading={running}>
                  <Telescope className="h-4 w-4" /> {hasReport ? "Re-run research" : "Run research"}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function Cites({ nums }: { nums: number[] }) {
  if (!nums.length) return null;
  return (
    <span className="whitespace-nowrap">
      {nums.map((n) => (
        <a
          key={n}
          href={`#source-${n}`}
          className="ml-0.5 inline-grid h-5 min-w-5 place-items-center rounded-md bg-blue/12 px-1 align-text-top text-[11px] font-bold text-blue hover:bg-blue hover:text-white dark:text-[#93c5fd]"
          aria-label={`Source ${n}`}
        >
          {n}
        </a>
      ))}
    </span>
  );
}

function ClaimText({ c }: { c: Claim }) {
  if (c.kind === "fact") {
    return (
      <p className="leading-relaxed text-fg">
        {c.text} <Cites nums={c.citations} />
      </p>
    );
  }
  return (
    <div className={cn("rounded-xl border-l-4 py-1.5 pl-3", c.unsupported ? "border-warning bg-warning/5" : "border-purple/50 bg-brand-soft/50")}>
      <p className="mb-0.5 text-[11px] font-bold uppercase tracking-wide text-fg-subtle">
        {c.unsupported ? "Unsupported claim — no source backs this" : "AI interpretation"}
      </p>
      <p className="leading-relaxed text-fg">
        {c.text} <Cites nums={c.citations} />
      </p>
    </div>
  );
}

function Legend({ notes, sources }: { notes: ResearchProject["notes"]; sources: ResearchSource[] }) {
  const read = sources.filter((s) => s.fetched).length;
  return (
    <div className="rounded-2xl border border-line bg-elevated p-4 text-sm print:hidden">
      <p className="flex items-center gap-2 font-semibold text-fg">
        <Info className="h-4 w-4 text-blue" /> How to read this report
      </p>
      <ul className="mt-2 grid gap-1.5 text-fg-muted sm:grid-cols-2">
        <li>
          Plain paragraphs with numbers <Cites nums={[1]} /> are facts taken from the numbered sources.
        </li>
        <li>
          <span className="font-semibold text-purple dark:text-[#c4b5fd]">AI interpretation</span> blocks are analysis, not source-backed facts.
        </li>
        <li>
          {sources.length} sources, {read} actually read by the agent · retrieval: {notes.retrieval_mode ?? "n/a"}
        </li>
        {!!notes.invalid_citations_removed && <li>{notes.invalid_citations_removed} citation(s) to non-existent sources were removed automatically.</li>}
        {!!notes.fetch_failures?.length && <li>{notes.fetch_failures.length} page(s) couldn&apos;t be downloaded; only their search snippets were available.</li>}
        {!!notes.search_errors?.length && <li className="text-danger">Search problems: {notes.search_errors[0]}</li>}
      </ul>
    </div>
  );
}

function SourcesList({ sources }: { sources: ResearchSource[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!sources.length) {
    return (
      <Card>
        <CardHeader title="Sources" icon={<BadgeCheck className="h-4 w-4" />} />
        <CardBody>
          <p className="text-sm text-fg-muted">No sources were used. Everything above is the model&apos;s unverified general knowledge.</p>
        </CardBody>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader title="Sources" description="Expand a source to see the exact passages the agent used." icon={<BadgeCheck className="h-4 w-4" />} />
      <CardBody>
        <ol className="space-y-2">
          {sources.map((s) => (
            <li key={s.number} id={`source-${s.number}`} className="scroll-mt-24 rounded-2xl border border-line">
              <div className="flex items-start gap-3 p-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue/12 text-xs font-bold text-blue dark:text-[#93c5fd]">{s.number}</span>
                <div className="min-w-0 flex-1">
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-sm font-semibold text-fg hover:text-blue">
                      <span className="break-words">{s.title}</span> <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    </a>
                  ) : (
                    <p className="text-sm font-semibold text-fg">{s.title}</p>
                  )}
                  {s.url && <p className="truncate text-xs text-fg-subtle">{s.url}</p>}
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge>{s.kind === "web" ? <Globe className="h-3 w-3" /> : <FileText className="h-3 w-3" />} {s.kind === "web" ? "Web" : "Your document"}</Badge>
                    {s.fetched ? <Badge tone="success">Read by agent</Badge> : <Badge tone="warning">Snippet only — page not read</Badge>}
                    {!s.cited && <Badge>Not cited</Badge>}
                  </div>
                </div>
                <button onClick={() => setOpen(open === s.number ? null : s.number)} className="rounded-lg p-1.5 text-fg-subtle hover:bg-muted print:hidden" aria-expanded={open === s.number} aria-label="Show passages">
                  <ChevronDown className={cn("h-4 w-4 transition-transform", open === s.number && "rotate-180")} />
                </button>
              </div>
              {open === s.number && (
                <div className="whitespace-pre-wrap border-t border-line p-3 text-xs leading-relaxed text-fg-muted">{s.excerpt}</div>
              )}
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}
