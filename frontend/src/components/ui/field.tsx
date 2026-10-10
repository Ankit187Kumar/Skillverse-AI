"use client";

import { forwardRef, useId, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-xl border border-line bg-elevated px-3.5 text-[15px] text-fg placeholder:text-fg-subtle " +
  "transition-[border-color,box-shadow] duration-150 outline-none " +
  "focus:border-purple focus:ring-4 focus:ring-purple/15 aria-[invalid=true]:border-danger";

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-fg">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(control, "h-11", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(control, "min-h-24 py-2.5 leading-relaxed", className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(control, "h-11 appearance-none pr-10", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
    </div>
  );
});

/** Pick one option from a small set, rendered as a row of pills (radio group semantics). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; note?: string; disabled?: boolean }[];
  label: string;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled || o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-10 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-all duration-150",
              "disabled:cursor-not-allowed disabled:opacity-50",
              active
                ? "border-transparent bg-brand-gradient text-white shadow-[0_6px_16px_-6px_rgb(124_58_237/0.6)]"
                : "border-line bg-elevated text-fg-muted hover:border-purple/50 hover:text-fg",
            )}
          >
            {o.label}
            {o.note && <span className="ml-1.5 text-xs font-medium opacity-80">{o.note}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Free-text tags (skills, roles, goals). Enter or comma adds a tag. */
export function TagInput({
  value,
  onChange,
  placeholder,
  id,
  max = 20,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  id?: string;
  max?: number;
}) {
  const [draft, setDraft] = useState("");
  const autoId = useId();
  const inputId = id ?? autoId;

  const add = (raw: string) => {
    const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
    const next = [...value];
    for (const p of parts) {
      if (next.length >= max) break;
      if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p.slice(0, 60));
    }
    onChange(next);
    setDraft("");
  };

  return (
    <div
      className={cn(
        "flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-xl border border-line bg-elevated px-2 py-1.5",
        "focus-within:border-purple focus-within:ring-4 focus-within:ring-purple/15",
      )}
      onClick={() => document.getElementById(inputId)?.focus()}
    >
      {value.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-lg bg-brand-soft px-2 py-1 text-sm font-medium text-fg"
        >
          {t}
          <button
            type="button"
            onClick={() => onChange(value.filter((v) => v !== t))}
            className="rounded p-0.5 text-fg-subtle hover:text-danger"
            aria-label={`Remove ${t}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ))}
      <input
        id={inputId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === ",") && draft.trim()) {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft.trim() && add(draft)}
        placeholder={value.length ? "" : placeholder}
        className="min-w-[8rem] flex-1 bg-transparent px-1.5 py-1 text-[15px] text-fg outline-none placeholder:text-fg-subtle"
      />
    </div>
  );
}
