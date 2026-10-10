"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { FileText, PartyPopper, UserRound } from "lucide-react";
import { ResumeManager } from "@/components/resume-manager";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Segmented, Select, TagInput } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ExperienceLevel, User } from "@/lib/types";

const LANGUAGES = ["English", "Hindi", "Hinglish", "Spanish", "French", "German", "Portuguese", "Arabic", "Japanese", "Bengali", "Tamil", "Telugu", "Marathi"];

function Welcome() {
  const params = useSearchParams();
  if (!params.get("welcome")) return null;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-purple/30 bg-brand-soft p-4">
      <PartyPopper className="h-5 w-5 shrink-0 text-purple dark:text-[#c4b5fd]" />
      <p className="text-sm text-fg">
        <strong>Welcome to SkillVerse AI!</strong> Add your skills and target role so interviews are tailored to you, then start your first practice session.
      </p>
    </div>
  );
}

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    full_name: user!.full_name,
    headline: user!.headline,
    experience_level: user!.experience_level,
    skills: user!.skills,
    target_roles: user!.target_roles,
    learning_goals: user!.learning_goals,
    preferred_language: user!.preferred_language,
  }));
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) return toast("Name can't be empty.", "error");
    setSaving(true);
    try {
      setUser(await api<User>("/users/me", { method: "PATCH", body: form }));
      toast("Profile saved.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">Your profile</h1>
        <p className="mt-1 text-fg-muted">This shapes the questions you get and the recommendations you see.</p>
      </div>
      <Suspense>
        <Welcome />
      </Suspense>

      <form onSubmit={save}>
        <Card>
          <CardHeader title="About you" icon={<UserRound className="h-4 w-4" />} />
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <Field label="Full name" htmlFor="full_name">
              <Input id="full_name" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} maxLength={120} autoComplete="name" />
            </Field>
            <Field label="Headline" htmlFor="headline">
              <Input id="headline" value={form.headline} onChange={(e) => set("headline", e.target.value)} maxLength={200} placeholder="Final-year CS student" />
            </Field>
            <Field label="Experience level" className="sm:col-span-2">
              <Segmented<ExperienceLevel>
                label="Experience level"
                value={form.experience_level}
                onChange={(v) => set("experience_level", v)}
                options={["Beginner", "Intermediate", "Advanced"].map((v) => ({ value: v as ExperienceLevel, label: v }))}
              />
            </Field>
            <Field label="Target roles" htmlFor="roles" hint="The first one is pre-filled when you start an interview.">
              <TagInput id="roles" value={form.target_roles} onChange={(v) => set("target_roles", v)} placeholder="Frontend Developer" />
            </Field>
            <Field label="Preferred language" htmlFor="lang">
              <Select id="lang" value={form.preferred_language} onChange={(e) => set("preferred_language", e.target.value)}>
                {[...new Set([form.preferred_language, ...LANGUAGES])].map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </Select>
            </Field>
            <Field label="Skills" htmlFor="skills" className="sm:col-span-2">
              <TagInput id="skills" value={form.skills} onChange={(v) => set("skills", v)} placeholder="JavaScript, SQL, Public speaking" max={30} />
            </Field>
            <Field label="Learning goals" htmlFor="goals" hint="Shown on your dashboard. Press Enter after each goal." className="sm:col-span-2">
              <TagInput id="goals" value={form.learning_goals} onChange={(v) => set("learning_goals", v)} placeholder="Crack a product-company interview by March" max={10} />
            </Field>
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" loading={saving}>
                Save profile
              </Button>
            </div>
          </CardBody>
        </Card>
      </form>

      <Card id="resume" className="scroll-mt-24">
        <CardHeader
          title="Resumes"
          description="Upload a resume for personalised, project-based questions and skill-gap analysis."
          icon={<FileText className="h-4 w-4" />}
        />
        <CardBody>
          <ResumeManager />
        </CardBody>
      </Card>
    </div>
  );
}
