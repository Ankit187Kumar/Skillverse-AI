"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AIThinking, Badge, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import type { Resume } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

const MAX_MB = 5;
const ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function ResumeManager({ onChange }: { onChange?: (r: Resume[]) => void }) {
  const toast = useToast();
  const [items, setItems] = useState<Resume[] | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const update = useCallback(
    (r: Resume[]) => {
      setItems(r);
      onChange?.(r);
    },
    [onChange],
  );

  const fetchItems = useCallback(
    () =>
      api<Resume[]>("/resumes")
        .then(update)
        .catch((e) => setError(errorMessage(e))),
    [update],
  );
  useEffect(() => {
    fetchItems();
  }, [fetchItems]);
  const load = () => {
    setError("");
    fetchItems();
  };

  const upload = async (file: File) => {
    if (!/\.(pdf|docx)$/i.test(file.name)) return toast("Please choose a PDF or DOCX file.", "error");
    if (file.size > MAX_MB * 1024 * 1024) return toast(`The file is larger than ${MAX_MB} MB.`, "error");
    const fd = new FormData();
    fd.append("file", file);
    setUploading(true);
    try {
      const r = await api<Resume>("/resumes", { method: "POST", body: fd });
      update([r, ...(items ?? [])]);
      toast(r.parsed ? "Resume analysed." : "Resume saved, but AI analysis failed. You can retry.", r.parsed ? "success" : "info");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  };

  const reanalyze = async (id: number) => {
    setBusyId(id);
    try {
      const r = await api<Resume>(`/resumes/${id}/analyze`, { method: "POST" });
      update((items ?? []).map((x) => (x.id === id ? r : x)));
      toast(r.parsed ? "Resume analysed." : r.parse_error ?? "Analysis failed.", r.parsed ? "success" : "error");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this resume? Its extracted text and analysis will be removed.")) return;
    setBusyId(id);
    try {
      await api(`/resumes/${id}`, { method: "DELETE" });
      update((items ?? []).filter((x) => x.id !== id));
      toast("Resume deleted.", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) upload(f);
        }}
        className={cn(
          "flex flex-col items-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors",
          drag ? "border-purple bg-brand-soft" : "border-line hover:border-purple/50",
        )}
      >
        {uploading ? (
          <AIThinking label="Reading and analysing your resume" />
        ) : (
          <>
            <UploadCloud className="h-9 w-9 text-purple dark:text-[#c4b5fd]" aria-hidden />
            <p className="mt-3 text-sm font-semibold text-fg">Drop a PDF or DOCX here</p>
            <p className="mt-1 text-xs text-fg-subtle">
              Up to {MAX_MB} MB. We keep only the extracted text and summary, never the file itself.
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => input.current?.click()}>
              Choose file
            </Button>
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              aria-label="Upload resume"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
          </>
        )}
      </div>

      {error && <ErrorState message={error} onRetry={load} />}
      {!items && !error && <Skeleton className="h-20" />}

      <ul className="space-y-3">
        <AnimatePresence initial={false}>
          {items?.map((r) => (
            <motion.li
              key={r.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="rounded-2xl border border-line bg-elevated p-4"
            >
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-purple dark:text-[#c4b5fd]">
                  <FileText className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-fg">{r.filename}</p>
                  <p className="text-xs text-fg-subtle">
                    {formatDate(r.created_at)} · {(r.size_bytes / 1024).toFixed(0)} KB
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {!r.parsed && (
                    <Button size="sm" variant="ghost" onClick={() => reanalyze(r.id)} loading={busyId === r.id} aria-label="Retry analysis">
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => remove(r.id)} disabled={busyId === r.id} aria-label={`Delete ${r.filename}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {r.parsed ? (
                <div className="mt-3 space-y-2">
                  {r.parsed.summary && <p className="text-sm text-fg-muted">{r.parsed.summary}</p>}
                  {r.parsed.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {r.parsed.skills.slice(0, 16).map((s) => (
                        <Badge key={s} tone="brand">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-fg-subtle">
                    {r.parsed.experience.length} experience · {r.parsed.projects.length} projects · {r.parsed.education.length} education entries found
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-xs text-warning">
                  Not analysed yet{r.parse_error ? `: ${r.parse_error}` : ""}. Interviews can still use the raw text.
                </p>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
