"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, FileText, Globe, Library, Loader2, Telescope, Trash2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Badge, EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import type { Job, ResearchDocument, ResearchListItem, ResearchProject } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

interface Config {
  search_provider: string;
  web_available: boolean;
  fields: string[];
  max_sources: number;
}

const STATUS: Record<string, { label: string; tone: "neutral" | "brand" | "success" | "warning" | "danger" }> = {
  draft: { label: "Draft", tone: "neutral" },
  planning: { label: "Planning", tone: "brand" },
  planned: { label: "Plan ready", tone: "warning" },
  running: { label: "Researching", tone: "brand" },
  ready: { label: "Report ready", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
};

export default function ResearchPage() {
  const router = useRouter();
  const toast = useToast();
  const [config, setConfig] = useState<Config | null>(null);
  const [items, setItems] = useState<ResearchListItem[] | null>(null);
  const [docs, setDocs] = useState<ResearchDocument[]>([]);
  const [error, setError] = useState("");
  const [prompt, setPrompt] = useState("");
  const [goals, setGoals] = useState("");
  const [field, setField] = useState("General");
  const [useWeb, setUseWeb] = useState(true);
  const [docIds, setDocIds] = useState<number[]>([]);
  const [busy, setBusy] = useState<"plan" | "run" | null>(null);

  const fetchAll = useCallback(
    () =>
      Promise.all([api<Config>("/research/config"), api<ResearchListItem[]>("/research/projects"), api<ResearchDocument[]>("/documents")])
        .then(([c, p, d]) => {
          setConfig(c);
          setItems(p);
          setDocs(d);
          if (!c.web_available) setUseWeb(false);
        })
        .catch((e) => setError(errorMessage(e))),
    [],
  );
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const create = async (autoRun: boolean) => {
    if (prompt.trim().length < 10) return toast("Describe what you want to research (at least 10 characters).", "error");
    setBusy(autoRun ? "run" : "plan");
    try {
      const r = await api<{ project: ResearchProject; job: Job }>("/research/projects", {
        method: "POST",
        body: { prompt: prompt.trim(), goals: goals.trim(), field, use_web: useWeb, document_ids: docIds, auto_run: autoRun },
      });
      router.push(`/research/${r.project.id}`);
    } catch (e) {
      toast(errorMessage(e), "error");
      setBusy(null);
    }
  };

  const remove = async (p: ResearchListItem) => {
    if (!confirm(`Delete “${p.title}”?`)) return;
    try {
      await api(`/research/projects/${p.id}`, { method: "DELETE" });
      setItems((xs) => xs?.filter((x) => x.id !== p.id) ?? null);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const noSources = !useWeb && docIds.length === 0;
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">Research Agent</h1>
          <p className="mt-1 text-fg-muted">Plan, gather sources and get a structured report where every fact links to its source.</p>
        </div>
        <ButtonLink href="/research/library" variant="outline">
          <Library className="h-4 w-4" /> Document library
        </ButtonLink>
      </div>

      {error && <ErrorState message={error} />}

      <Card>
        <CardHeader title="New research" icon={<Telescope className="h-4 w-4" />} />
        <CardBody className="grid gap-5">
          <Field label="What do you want to research?" htmlFor="prompt">
            <Textarea
              id="prompt"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={3000}
              placeholder="e.g. How are mid-size Indian companies adopting generative AI in customer support, and what results are they reporting?"
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Goals (optional)" htmlFor="goals">
              <Textarea id="goals" rows={2} value={goals} onChange={(e) => setGoals(e.target.value)} maxLength={1500} placeholder="e.g. Decide whether to pilot an AI chatbot next quarter" />
            </Field>
            <Field label="Field" htmlFor="field">
              <Select id="field" value={field} onChange={(e) => setField(e.target.value)}>
                {(config?.fields ?? ["General"]).map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </Select>
            </Field>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-fg">Sources</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-2xl border p-4",
                  useWeb ? "border-purple bg-brand-soft" : "border-line",
                  !config?.web_available && "cursor-not-allowed opacity-60",
                )}
              >
                <input type="checkbox" className="mt-1 accent-[#7C3AED]" checked={useWeb} disabled={!config?.web_available} onChange={(e) => setUseWeb(e.target.checked)} />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                    <Globe className="h-4 w-4" /> Search the web
                  </span>
                  <span className="mt-0.5 block text-xs text-fg-muted">
                    {config?.web_available
                      ? `Via ${config.search_provider}. Pages are downloaded and read before being cited.`
                      : "Web search isn't configured on this server (see README → Research agent)."}
                  </span>
                </span>
              </label>
              <div className={cn("rounded-2xl border p-4", docIds.length ? "border-purple bg-brand-soft" : "border-line")}>
                <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                  <FileText className="h-4 w-4" /> Your documents
                </p>
                {docs.length ? (
                  <div className="mt-2 max-h-36 space-y-1.5 overflow-y-auto">
                    {docs.map((d) => (
                      <label key={d.id} className="flex items-center gap-2 text-sm text-fg">
                        <input
                          type="checkbox"
                          className="accent-[#7C3AED]"
                          checked={docIds.includes(d.id)}
                          onChange={(e) => setDocIds((ids) => (e.target.checked ? [...ids, d.id] : ids.filter((x) => x !== d.id)))}
                        />
                        <span className="truncate">{d.filename}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-fg-muted">
                    No documents yet.{" "}
                    <Link href="/research/library" className="font-semibold text-purple dark:text-[#c4b5fd]">
                      Upload PDFs, DOCX or text
                    </Link>
                  </p>
                )}
              </div>
            </div>
            {noSources && (
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-sm text-fg">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                Without web search or documents, the report can only use the model&apos;s general knowledge. It will be clearly labelled as unverified.
              </p>
            )}
          </fieldset>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => create(false)} loading={busy === "plan"} disabled={!!busy}>
              Plan first, then review
            </Button>
            <Button onClick={() => create(true)} loading={busy === "run"} disabled={!!busy}>
              <Telescope className="h-4 w-4" /> Plan and research
            </Button>
          </div>
        </CardBody>
      </Card>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold text-fg">Your research</h2>
        {!items && !error && <Skeleton className="h-24" />}
        {items?.length === 0 && (
          <Card>
            <EmptyState icon={<Telescope className="h-6 w-6" />} title="No research yet" description="Your reports will appear here." />
          </Card>
        )}
        <ul className="space-y-3">
          {items?.map((p, i) => (
            <motion.li key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.03 } }}>
              <Card interactive className="flex items-center gap-4 p-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-purple dark:text-[#c4b5fd]">
                  {p.status === "planning" || p.status === "running" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Telescope className="h-5 w-5" />}
                </span>
                <Link href={`/research/${p.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-fg">{p.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
                    <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
                    <span>{p.field}</span>·<span>{p.sources} sources</span>·<span>{timeAgo(p.updated_at)}</span>
                  </div>
                </Link>
                <Button variant="ghost" size="icon" onClick={() => remove(p)} aria-label={`Delete ${p.title}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
                <ArrowRight className="hidden h-5 w-5 text-fg-subtle sm:block" />
              </Card>
            </motion.li>
          ))}
        </ul>
      </section>
    </div>
  );
}
