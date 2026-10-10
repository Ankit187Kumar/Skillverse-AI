"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, FileText, Mic, Sparkles, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Segmented, Select, TagInput, Textarea } from "@/components/ui/field";
import { AIThinking, ErrorState } from "@/components/ui/feedback";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Difficulty, ExperienceLevel, Interview, InterviewConfig, InterviewType, Resume } from "@/lib/types";
import { useVoiceConfig } from "@/lib/use-voice";

const TYPES: { value: InterviewType; label: string; text: string }[] = [
  { value: "Technical", label: "Technical", text: "Concepts, design and trade-offs" },
  { value: "HR", label: "HR", text: "Motivation, goals and fit" },
  { value: "Behavioral", label: "Behavioral", text: "Real situations, STAR answers" },
  { value: "Personality", label: "Personality", text: "Work style and values" },
  { value: "Domain-Specific", label: "Domain", text: "Day-to-day role knowledge" },
  { value: "Custom", label: "Custom", text: "Your own topics" },
];
const DURATIONS = [5, 10, 15, 20, 30, 45, 60];
const LANGUAGES = ["English", "Hindi", "Hinglish", "Spanish", "French", "German", "Portuguese", "Arabic", "Japanese", "Bengali", "Tamil", "Telugu", "Marathi"];

const questionsFor = (m: number) => Math.max(3, Math.min(12, Math.round(m / 3)));

export default function NewInterviewPage() {
  return (
    <Suspense>
      <NewInterview />
    </Suspense>
  );
}

function NewInterview() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const voice = useVoiceConfig();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cfg, setCfg] = useState<InterviewConfig>({
    interview_type: "Technical",
    role: params.get("role") ?? user?.target_roles[0] ?? "",
    skills: user?.skills.slice(0, 10) ?? [],
    experience_level: user?.experience_level ?? "Intermediate",
    difficulty: "Medium",
    duration_minutes: 15,
    language: user?.preferred_language ?? "English",
    mode: "text",
    topics: params.get("topics") ?? "",
    goals: params.get("goals") ?? "",
    resume_id: null,
  });
  const set = <K extends keyof InterviewConfig>(k: K, v: InterviewConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));

  useEffect(() => {
    api<Resume[]>("/resumes")
      .then(setResumes)
      .catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cfg.role.trim().length < 2) return setError("Enter the job role you're preparing for.");
    if (cfg.interview_type === "Custom" && !cfg.topics.trim()) return setError("Add the topics you'd like to be asked about.");
    setError("");
    setBusy(true);
    try {
      const iv = await api<Interview>("/interviews", { method: "POST", body: { ...cfg, role: cfg.role.trim() } });
      router.push(`/interview/${iv.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError && err.isAIUnavailable
          ? `The AI model couldn't start the interview. ${err.message}`
          : errorMessage(err),
      );
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/interview" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Interviews
      </Link>
      <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">Set up your mock interview</h1>
      <p className="mt-1 text-fg-muted">Tell the AI interviewer what you&apos;re preparing for. Everything can be changed next time.</p>

      <form onSubmit={submit} className="mt-6 space-y-5">
        <Card>
          <CardHeader title="Interview type" />
          <CardBody>
            <div role="radiogroup" aria-label="Interview type" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {TYPES.map((t) => {
                const active = cfg.interview_type === t.value;
                return (
                  <motion.button
                    key={t.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => set("interview_type", t.value)}
                    className={
                      "rounded-2xl border p-4 text-left transition-all " +
                      (active
                        ? "border-purple bg-brand-soft ring-4 ring-purple/10"
                        : "border-line bg-elevated hover:border-purple/40")
                    }
                  >
                    <span className="block text-sm font-bold text-fg">{t.label}</span>
                    <span className="mt-0.5 block text-xs text-fg-muted">{t.text}</span>
                  </motion.button>
                );
              })}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Role and skills" />
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <Field label="Target job role" htmlFor="role" className="sm:col-span-2">
              <Input id="role" value={cfg.role} onChange={(e) => set("role", e.target.value)} placeholder="e.g. Frontend Developer, Data Analyst, Product Manager" maxLength={100} required />
            </Field>
            <Field label="Skills you know" htmlFor="skills" hint="Press Enter or comma after each skill." className="sm:col-span-2">
              <TagInput id="skills" value={cfg.skills} onChange={(v) => set("skills", v)} placeholder="React, SQL, Communication…" />
            </Field>
            <Field label="Experience level">
              <Segmented<ExperienceLevel>
                label="Experience level"
                value={cfg.experience_level}
                onChange={(v) => set("experience_level", v)}
                options={["Beginner", "Intermediate", "Advanced"].map((v) => ({ value: v as ExperienceLevel, label: v }))}
              />
            </Field>
            <Field label="Difficulty">
              <Segmented<Difficulty>
                label="Difficulty"
                value={cfg.difficulty}
                onChange={(v) => set("difficulty", v)}
                options={["Easy", "Medium", "Hard"].map((v) => ({ value: v as Difficulty, label: v }))}
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Format" />
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <Field label="Duration" htmlFor="duration" hint={`About ${questionsFor(cfg.duration_minutes)} questions, including follow-ups.`}>
              <Select id="duration" value={cfg.duration_minutes} onChange={(e) => set("duration_minutes", Number(e.target.value))}>
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} minutes
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Language" htmlFor="language">
              <Select id="language" value={cfg.language} onChange={(e) => set("language", e.target.value)}>
                {[...new Set([cfg.language, ...LANGUAGES])].map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </Select>
            </Field>
            <Field
              label="Answer mode"
              className="sm:col-span-2"
              hint={
                cfg.mode === "voice"
                  ? `Speak your answers and review the transcript before sending. Questions are read aloud. ${voice.config?.stt_note ?? ""}`
                  : voice.sttAvailable
                    ? "Type your answers, or switch to voice to speak them."
                    : "Voice answers aren't available in this browser or on this server, so answers are typed."
              }
            >
              <Segmented<"text" | "voice">
                label="Answer mode"
                value={cfg.mode}
                onChange={(v) => set("mode", v)}
                options={[
                  { value: "text", label: "✍️ Text answers" },
                  { value: "voice", label: "🎙️ Voice answers", disabled: !voice.sttAvailable },
                ]}
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Personalise (optional)" icon={<Sparkles className="h-4 w-4" />} />
          <CardBody className="grid gap-5">
            <Field label="Use a resume" htmlFor="resume" hint="Questions will reference your real projects and experience.">
              {resumes.length ? (
                <Select id="resume" value={cfg.resume_id ?? ""} onChange={(e) => set("resume_id", e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Don&apos;t use a resume</option>
                  {resumes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.filename}
                      {r.parsed ? "" : " (not analysed)"}
                    </option>
                  ))}
                </Select>
              ) : (
                <Link href="/profile#resume" className="flex items-center gap-2 rounded-xl border border-dashed border-line px-4 py-3 text-sm font-semibold text-purple hover:border-purple dark:text-[#c4b5fd]">
                  <FileText className="h-4 w-4" /> Upload a resume in your profile
                </Link>
              )}
            </Field>
            <Field label={cfg.interview_type === "Custom" ? "Topics to cover (required)" : "Topics to focus on"} htmlFor="topics">
              <Textarea id="topics" value={cfg.topics} onChange={(e) => set("topics", e.target.value)} maxLength={500} placeholder="e.g. React performance, REST API design, conflict with a teammate" />
            </Field>
            <Field label="Your goal for this practice" htmlFor="goals">
              <Textarea id="goals" value={cfg.goals} onChange={(e) => set("goals", e.target.value)} maxLength={500} placeholder="e.g. Be more concise, prepare for my Infosys interview on Monday" />
            </Field>
          </CardBody>
        </Card>

        {error && <ErrorState message={error} />}

        <div className="sticky bottom-20 z-10 flex flex-col items-stretch gap-3 rounded-2xl border border-line bg-elevated/90 p-4 shadow-lift backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between lg:bottom-4">
          {busy ? (
            <AIThinking label="Preparing your first question" />
          ) : (
            <p className="flex items-center gap-2 text-sm text-fg-muted">
              {cfg.mode === "text" ? <Type className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {cfg.interview_type} · {cfg.difficulty} · {cfg.duration_minutes} min
            </p>
          )}
          <Button type="submit" size="lg" loading={busy}>
            Continue to interview room
          </Button>
        </div>
      </form>
    </div>
  );
}
