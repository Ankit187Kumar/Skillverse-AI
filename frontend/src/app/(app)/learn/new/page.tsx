"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Segmented, Select, Textarea } from "@/components/ui/field";
import { ErrorState } from "@/components/ui/feedback";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { CourseDetail, ExperienceLevel, Job } from "@/lib/types";

const IDEAS = ["Python for data analysis", "System design basics", "SQL from scratch", "Public speaking", "Statistics for ML", "React with TypeScript"];

function NewCourseForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const [topic, setTopic] = useState(params.get("topic") ?? "");
  const [level, setLevel] = useState<ExperienceLevel>(user?.experience_level ?? "Beginner");
  const [goal, setGoal] = useState(params.get("goal") ?? "");
  const [hours, setHours] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (topic.trim().length < 2) return setError("Tell us what you'd like to learn.");
    setBusy(true);
    setError("");
    try {
      const r = await api<{ course: CourseDetail; job: Job }>("/learning/courses", {
        method: "POST",
        body: { topic: topic.trim(), level, goal: goal.trim(), hours_per_week: hours },
      });
      router.push(`/learn/${r.course.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-5">
      <Card>
        <CardBody className="grid gap-5">
          <Field label="What do you want to learn?" htmlFor="topic">
            <Input id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} placeholder="e.g. Machine learning fundamentals" autoFocus />
          </Field>
          <div className="flex flex-wrap gap-2">
            {IDEAS.map((i) => (
              <button
                type="button"
                key={i}
                onClick={() => setTopic(i)}
                className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-fg-muted transition-colors hover:border-purple hover:text-fg"
              >
                {i}
              </button>
            ))}
          </div>
          <Field label="Your current level">
            <Segmented<ExperienceLevel>
              label="Current level"
              value={level}
              onChange={setLevel}
              options={["Beginner", "Intermediate", "Advanced"].map((v) => ({ value: v as ExperienceLevel, label: v }))}
            />
          </Field>
          <Field label="Your goal (optional)" htmlFor="goal" hint="The curriculum and examples are tailored to this.">
            <Textarea id="goal" value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={500} placeholder="e.g. Analyse sales data at work and build dashboards" />
          </Field>
          <Field label="Time per week" htmlFor="hours">
            <Select id="hours" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              {[2, 3, 5, 8, 10, 15, 20].map((h) => (
                <option key={h} value={h}>
                  {h} hours
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>
      {error && <ErrorState message={error} />}
      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={busy}>
          <Sparkles className="h-5 w-5" /> Create my learning path
        </Button>
      </div>
    </form>
  );
}

export default function NewCoursePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/learn" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Courses
      </Link>
      <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">Create a learning path</h1>
      <p className="mt-1 text-fg-muted">Modules, lessons, exercises, quizzes and a capstone project — generated for you.</p>
      <Suspense>
        <NewCourseForm />
      </Suspense>
    </div>
  );
}
