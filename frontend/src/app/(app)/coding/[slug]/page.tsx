"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  History,
  Lightbulb,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Terminal,
} from "lucide-react";
import { CodeEditor } from "@/components/code-editor";
import { DIFF_TONE, JudgeResults, ReviewPanel, VerdictBadge } from "@/components/coding-ui";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, Textarea } from "@/components/ui/field";
import { AIThinking, Badge, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import type { CodeLang, CodeReview, CodingConfig, Judged, ProblemDetail, SubmissionSummary } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

type Tab = "problem" | "hints" | "submissions";
type Output =
  | { kind: "judged"; title: string; judged: Judged; submissionId?: number }
  | { kind: "custom"; status: string; stdout: string; stderr: string; time_ms: number | null }
  | null;

export default function ProblemPage() {
  const { slug } = useParams<{ slug: string }>();
  const toast = useToast();
  const [cfg, setCfg] = useState<CodingConfig | null>(null);
  const [p, setP] = useState<ProblemDetail | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("problem");
  const [lang, setLang] = useState<CodeLang>("python");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"run" | "submit" | "review" | null>(null);
  const [output, setOutput] = useState<Output>(null);
  const [review, setReview] = useState<CodeReview | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [stdin, setStdin] = useState("");
  const [saved, setSaved] = useState<"saved" | "saving" | "idle">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAll = useCallback(
    () =>
      Promise.all([api<CodingConfig>("/coding/config"), api<ProblemDetail>(`/coding/problems/${slug}`)])
        .then(([c, d]) => {
          setCfg(c);
          setP(d);
          const available = c.execution_available ? c.languages.map((l) => l.id) : c.all_languages.map((l) => l.id);
          const l = d.last_language && available.includes(d.last_language) ? d.last_language : available[0] ?? "python";
          setLang(l);
          setCode(d.drafts[l] ?? d.starters[l]);
          setStdin(d.samples[0]?.input ?? "");
        })
        .catch((e) => setError(errorMessage(e))),
    [slug],
  );
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Auto-save the draft shortly after typing stops.
  const scheduleSave = (value: string, language: CodeLang) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaved("saving");
    saveTimer.current = setTimeout(async () => {
      try {
        await api(`/coding/problems/${slug}/draft`, { method: "PUT", body: { language, code: value } });
        setP((x) => (x ? { ...x, drafts: { ...x.drafts, [language]: value } } : x));
        setSaved("saved");
      } catch {
        setSaved("idle");
      }
    }, 1200);
  };
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const changeLang = (l: CodeLang) => {
    if (!p) return;
    setLang(l);
    setCode(p.drafts[l] ?? p.starters[l]);
    setReview(null);
  };

  const run = async (custom: boolean) => {
    setBusy("run");
    setReview(null);
    try {
      const r = await api<Judged & { mode: string; status?: string; stdout?: string; stderr?: string; time_ms?: number | null }>(`/coding/problems/${slug}/run`, {
        method: "POST",
        body: { language: lang, code, stdin: custom ? stdin : undefined },
      });
      setOutput(
        r.mode === "custom"
          ? { kind: "custom", status: r.status!, stdout: r.stdout ?? "", stderr: r.stderr ?? "", time_ms: r.time_ms ?? null }
          : { kind: "judged", title: "Sample tests", judged: r },
      );
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    setBusy("submit");
    setReview(null);
    try {
      const r = await api<Judged & { id: number; first_solve: boolean }>(`/coding/problems/${slug}/submit`, { method: "POST", body: { language: lang, code } });
      setOutput({ kind: "judged", title: "All tests", judged: r, submissionId: r.id });
      const summary: SubmissionSummary = { id: r.id, language: lang, verdict: r.verdict, passed: r.passed, total: r.total, created_at: new Date().toISOString() };
      setP((x) => (x ? { ...x, solved: x.solved || r.verdict === "accepted", submissions: [summary, ...x.submissions] } : x));
      if (r.first_solve) toast("Solved! Nicely done. 🎉", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const aiReview = async () => {
    setBusy("review");
    try {
      const sid = output?.kind === "judged" ? output.submissionId : undefined;
      setReview(
        sid
          ? await api<CodeReview>(`/coding/submissions/${sid}/review`, { method: "POST" })
          : await api<CodeReview>(`/coding/problems/${slug}/review`, { method: "POST", body: { language: lang, code } }),
      );
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const revealHint = async () => {
    try {
      const r = await api<{ hints: string[]; hints_total: number }>(`/coding/problems/${slug}/hint`, { method: "POST" });
      setP((x) => (x ? { ...x, hints: r.hints } : x));
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const revealExplanation = async () => {
    if (!p?.solved && !confirm("Show the full explanation? Try solving it first for the best learning.")) return;
    try {
      const r = await api<{ explanation: string; expected_complexity: string }>(`/coding/problems/${slug}/explanation`, { method: "POST" });
      setP((x) => (x ? { ...x, ...r } : x));
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  if (error) return <ErrorState message={error} onRetry={() => { setError(""); fetchAll(); }} />;
  if (!p || !cfg) {
    return (
      <div className="grid gap-4 lg:grid-cols-2" aria-busy="true">
        <Skeleton className="h-[32rem]" />
        <Skeleton className="h-[32rem]" />
      </div>
    );
  }

  const canRun = cfg.execution_available;
  const langs = canRun ? cfg.languages : cfg.all_languages;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/coding" className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" /> Problems
        </Link>
        <h1 className="font-display text-xl font-bold text-fg">{p.title}</h1>
        <Badge tone={DIFF_TONE[p.difficulty]}>{p.difficulty}</Badge>
        <Badge>{p.topic}</Badge>
        {p.solved && (
          <Badge tone="success">
            <CheckCircle2 className="h-3 w-3" /> Solved
          </Badge>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left: problem */}
        <Card className="flex min-h-[28rem] flex-col overflow-hidden lg:h-[calc(100dvh-12rem)]">
          <div role="tablist" aria-label="Problem panels" className="flex border-b border-line px-2">
            {(
              [
                ["problem", "Problem", BookOpen],
                ["hints", `Hints${p.hints.length ? ` (${p.hints.length}/${p.hints_total})` : ""}`, Lightbulb],
                ["submissions", `Submissions${p.submissions.length ? ` (${p.submissions.length})` : ""}`, History],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  "relative inline-flex items-center gap-1.5 px-3 py-3 text-sm font-semibold transition-colors",
                  tab === id ? "text-fg" : "text-fg-subtle hover:text-fg",
                )}
              >
                <Icon className="h-4 w-4" /> {label}
                {tab === id && <motion.span layoutId="code-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-brand-gradient" />}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-5" role="tabpanel">
            {tab === "problem" && (
              <div className="space-y-5">
                <Markdown>{p.statement}</Markdown>
                <div>
                  <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-fg-subtle">Input</h3>
                  <Markdown className="text-sm">{p.input_format}</Markdown>
                </div>
                <div>
                  <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-fg-subtle">Output</h3>
                  <Markdown className="text-sm">{p.output_format}</Markdown>
                </div>
                {p.constraints && (
                  <div>
                    <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-fg-subtle">Constraints</h3>
                    <p className="text-sm text-fg">{p.constraints}</p>
                  </div>
                )}
                {p.samples.map((s, i) => (
                  <div key={i} className="rounded-2xl border border-line p-3.5">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-fg-subtle">Example {i + 1}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <pre className="overflow-auto rounded-xl bg-muted p-2.5 font-mono text-xs text-fg">{s.input}</pre>
                      <pre className="overflow-auto rounded-xl bg-muted p-2.5 font-mono text-xs text-fg">{s.output}</pre>
                    </div>
                    {s.explanation && <p className="mt-2 text-sm text-fg-muted">{s.explanation}</p>}
                  </div>
                ))}
                <p className="text-xs text-fg-subtle">Submissions are checked against these examples plus {p.hidden_tests} hidden tests, including large inputs.</p>
              </div>
            )}
            {tab === "hints" && (
              <div className="space-y-3">
                {p.hints.map((h, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2 rounded-xl bg-warning/10 p-3 text-sm text-fg">
                    <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <span className="min-w-0 flex-1">
                      <strong>Hint {i + 1}:</strong> <Markdown className="inline text-sm [&>p]:inline">{h}</Markdown>
                    </span>
                  </motion.div>
                ))}
                {p.hints.length < p.hints_total ? (
                  <Button variant="outline" size="sm" onClick={revealHint}>
                    <Lightbulb className="h-4 w-4" /> Show hint {p.hints.length + 1} of {p.hints_total}
                  </Button>
                ) : !p.explanation ? (
                  <Button variant="outline" size="sm" onClick={revealExplanation}>
                    <BookOpen className="h-4 w-4" /> Show the full explanation
                  </Button>
                ) : null}
                {p.hints.length === 0 && <p className="text-sm text-fg-muted">Stuck? Reveal hints one at a time. The full explanation unlocks after the last hint or when you solve it.</p>}
                {p.explanation && (
                  <div className="rounded-2xl bg-brand-soft p-4">
                    <p className="mb-1 text-xs font-bold uppercase tracking-wide text-purple dark:text-[#c4b5fd]">Explanation</p>
                    <Markdown className="text-sm">{p.explanation}</Markdown>
                    {p.expected_complexity && <p className="mt-2 text-sm font-semibold text-fg">Target: {p.expected_complexity}</p>}
                  </div>
                )}
              </div>
            )}
            {tab === "submissions" && (
              <ul className="space-y-2">
                {p.submissions.length === 0 && <li className="text-sm text-fg-muted">No submissions yet.</li>}
                {p.submissions.map((s) => (
                  <li key={s.id}>
                    <Link href={`/coding/submissions/${s.id}`} className="flex items-center gap-3 rounded-xl border border-line p-3 text-sm hover:bg-muted/60">
                      <VerdictBadge verdict={s.verdict} />
                      <span className="text-fg-muted">
                        {s.passed}/{s.total} · {s.language}
                      </span>
                      <span className="ml-auto text-xs text-fg-subtle">{timeAgo(s.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        {/* Right: editor */}
        <div className="flex flex-col gap-4">
          <Card className="flex min-h-[26rem] flex-col overflow-hidden lg:h-[calc(100dvh-24rem)] lg:min-h-[22rem]">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
              <div className="w-48">
                <Select aria-label="Language" value={lang} onChange={(e) => changeLang(e.target.value as CodeLang)} className="h-9 text-sm">
                  {langs.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              </div>
              <span className="text-xs text-fg-subtle" aria-live="polite">
                {saved === "saving" ? "Saving…" : saved === "saved" ? "Draft saved" : ""}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  if (confirm("Reset to the starter code for this language?")) {
                    setCode(p.starters[lang]);
                    scheduleSave(p.starters[lang], lang);
                  }
                }}
              >
                <RotateCcw className="h-4 w-4" /> Reset
              </Button>
            </div>
            <div className="min-h-0 flex-1">
              <CodeEditor
                value={code}
                language={lang}
                onChange={(v) => {
                  setCode(v);
                  scheduleSave(v, lang);
                }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-line p-3">
              <Button variant="ghost" size="sm" onClick={() => setCustomOpen((o) => !o)} disabled={!canRun} aria-expanded={customOpen}>
                <Terminal className="h-4 w-4" /> Custom input
              </Button>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={aiReview} loading={busy === "review"} disabled={!!busy && busy !== "review"}>
                  <Sparkles className="h-4 w-4" /> AI review
                </Button>
                <Button variant="secondary" size="sm" onClick={() => run(customOpen)} loading={busy === "run"} disabled={!canRun || (!!busy && busy !== "run")} title={canRun ? undefined : "No sandbox configured"}>
                  <Play className="h-4 w-4" /> Run
                </Button>
                <Button size="sm" onClick={submit} loading={busy === "submit"} disabled={!canRun || (!!busy && busy !== "submit")} title={canRun ? undefined : "No sandbox configured"}>
                  <Send className="h-4 w-4" /> Submit
                </Button>
              </div>
            </div>
            {customOpen && (
              <div className="border-t border-line p-3">
                <label htmlFor="stdin" className="mb-1 block text-xs font-bold uppercase tracking-wide text-fg-subtle">
                  Custom input (used by Run)
                </label>
                <Textarea id="stdin" value={stdin} onChange={(e) => setStdin(e.target.value)} rows={3} className="font-mono text-xs" />
              </div>
            )}
          </Card>

          {(output || busy === "run" || busy === "submit" || review || busy === "review") && (
            <Card className="space-y-4 p-4">
              {(busy === "run" || busy === "submit") && <AIThinking label={busy === "submit" ? "Running all tests in the sandbox" : "Running"} />}
              {output?.kind === "judged" && busy !== "run" && busy !== "submit" && <JudgeResults judged={output.judged} title={output.title} />}
              {output?.kind === "custom" && busy !== "run" && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-fg">
                    Custom run · <VerdictBadge verdict={output.status === "ok" ? "passed" : output.status} />
                    {output.time_ms != null && <span className="ml-2 text-xs text-fg-subtle">{Math.round(output.time_ms)} ms</span>}
                  </p>
                  <pre className="max-h-48 overflow-auto rounded-xl border border-line bg-muted p-2.5 font-mono text-xs text-fg">{output.stdout || "(no output)"}</pre>
                  {output.stderr && <pre className="max-h-40 overflow-auto rounded-xl border border-line bg-muted p-2.5 font-mono text-xs text-danger">{output.stderr}</pre>}
                </div>
              )}
              {busy === "review" && <AIThinking label="Reviewing complexity and mistakes" />}
              {review && busy !== "review" && (
                <div className="border-t border-line pt-4">
                  <p className="mb-3 flex items-center gap-2 font-display font-semibold text-fg">
                    <Sparkles className="h-4 w-4 text-purple" /> AI review
                  </p>
                  <ReviewPanel review={review} />
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
