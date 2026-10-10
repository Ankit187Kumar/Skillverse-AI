"use client";

import { useEffect, useState } from "react";
import { Cpu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "@/lib/api";
import type { AIStatus } from "@/lib/types";

/** Shows a setup hint when the configured model isn't reachable, instead of letting AI calls fail silently. */
export function AIStatusBanner() {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    api<AIStatus>("/system/ai-status")
      .then((s) => alive && setStatus(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const show = status && !status.model_available && !dismissed;
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="mb-5 overflow-hidden"
        >
          <div className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4">
            <Cpu className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-fg">AI model isn&apos;t ready ({status.model})</p>
              <p className="mt-0.5 text-fg-muted">
                {status.message} Interviews need the model to generate questions and reports. See the README&apos;s
                &ldquo;Ollama setup&rdquo; section.
              </p>
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="text-fg-subtle hover:text-fg"
              aria-label="Dismiss AI status notice"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
