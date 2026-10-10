"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, FileText, Search, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { AIThinking, Badge, EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import type { Job, ResearchDocument } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

interface Hit {
  text: string;
  score: number;
  title: string;
  document_id: number;
  chunk: number;
}

export default function LibraryPage() {
  const toast = useToast();
  const [docs, setDocs] = useState<ResearchDocument[] | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ mode: string; results: Hit[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const fetchDocs = useCallback(
    () =>
      api<ResearchDocument[]>("/documents")
        .then(setDocs)
        .catch((e) => setError(errorMessage(e))),
    [],
  );
  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  const upload = async (files: FileList | File[]) => {
    setUploading(true);
    for (const f of Array.from(files)) {
      if (!/\.(pdf|docx|txt|md|markdown)$/i.test(f.name)) {
        toast(`${f.name}: use PDF, DOCX, TXT or Markdown.`, "error");
        continue;
      }
      if (f.size > 15 * 1024 * 1024) {
        toast(`${f.name} is larger than 15 MB.`, "error");
        continue;
      }
      const fd = new FormData();
      fd.append("file", f);
      try {
        const r = await api<{ document: ResearchDocument; job: Job }>("/documents", { method: "POST", body: fd });
        toast(`${f.name} added.`, "success");
        setDocs((d) => [r.document, ...(d ?? [])]);
      } catch (e) {
        toast(`${f.name}: ${errorMessage(e)}`, "error");
      }
    }
    setUploading(false);
    if (input.current) input.current.value = "";
    setTimeout(fetchDocs, 1500); // pick up indexing status
  };

  const remove = async (d: ResearchDocument) => {
    if (!confirm(`Delete ${d.filename}?`)) return;
    try {
      await api(`/documents/${d.id}`, { method: "DELETE" });
      setDocs((x) => x?.filter((y) => y.id !== d.id) ?? null);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setSearching(true);
    try {
      setHits(await api(`/documents/search?q=${encodeURIComponent(q.trim())}`));
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/research" className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Research
      </Link>
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">Document library</h1>
        <p className="mt-1 text-fg-muted">Upload your own material so the research agent can search and cite it.</p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files?.length) upload(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center rounded-3xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          drag ? "border-purple bg-brand-soft" : "border-line hover:border-purple/50",
        )}
      >
        {uploading ? (
          <AIThinking label="Reading and indexing" />
        ) : (
          <>
            <UploadCloud className="h-10 w-10 text-purple dark:text-[#c4b5fd]" />
            <p className="mt-3 font-semibold text-fg">Drop PDF, DOCX, TXT or Markdown files</p>
            <p className="mt-1 text-xs text-fg-subtle">Up to 15 MB each. Text is extracted and split into passages for search; the original file isn&apos;t kept.</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => input.current?.click()}>
              Choose files
            </Button>
            <input
              ref={input}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md,.markdown"
              className="sr-only"
              aria-label="Upload documents"
              onChange={(e) => e.target.files && upload(e.target.files)}
            />
          </>
        )}
      </div>

      {error && <ErrorState message={error} />}

      <Card>
        <CardHeader title="Search your documents" icon={<Search className="h-4 w-4" />} />
        <CardBody>
          <form onSubmit={search} className="flex gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask or search across everything you've uploaded" aria-label="Search documents" />
            <Button type="submit" loading={searching} disabled={q.trim().length < 2}>
              Search
            </Button>
          </form>
          {hits && (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-fg-subtle">
                {hits.results.length} passages · {hits.mode === "semantic" ? "semantic (embedding) search" : "keyword search (embedding model unavailable)"}
              </p>
              {hits.results.map((h, i) => (
                <div key={i} className="rounded-xl border border-line p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-fg-muted">
                    <FileText className="h-3.5 w-3.5" /> {h.title} · passage {h.chunk + 1}
                  </p>
                  <p className="line-clamp-5 text-sm text-fg">{h.text}</p>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {!docs && !error && <Skeleton className="h-24" />}
      {docs?.length === 0 && (
        <Card>
          <EmptyState icon={<FileText className="h-6 w-6" />} title="Your library is empty" description="Upload reports, papers or notes to research them." />
        </Card>
      )}
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {docs?.map((d) => (
            <motion.li key={d.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }}>
              <Card className="flex items-center gap-3 p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-purple dark:text-[#c4b5fd]">
                  <FileText className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-fg">{d.filename}</p>
                  <p className="text-xs text-fg-subtle">
                    {formatDate(d.created_at)} · {(d.char_count / 1000).toFixed(1)}k characters · {d.chunk_count} passages
                  </p>
                </div>
                {d.embedded ? (
                  <Badge tone="success">
                    <Check className="h-3 w-3" /> Semantic
                  </Badge>
                ) : (
                  <Badge tone="warning">{d.chunk_count ? "Keyword only" : "Indexing…"}</Badge>
                )}
                <Button variant="ghost" size="icon" onClick={() => remove(d)} aria-label={`Delete ${d.filename}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Card>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
