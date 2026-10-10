"use client";

import { motion } from "framer-motion";
import { ArrowRight, BarChart3, Camera, Code2, FileText, GraduationCap, MessagesSquare, Mic, ShieldCheck, Sparkles, Telescope } from "lucide-react";
import { Logo, ThemeToggle } from "@/components/brand";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { useAuth } from "@/lib/auth";

const FEATURES = [
  { icon: MessagesSquare, title: "AI Interviewer", text: "Realistic technical, HR and behavioural mock interviews with follow-up questions.", live: true },
  { icon: FileText, title: "Resume-aware", text: "Upload a PDF or DOCX and get questions grounded in your real projects.", live: true },
  { icon: BarChart3, title: "Detailed feedback", text: "Scores on five clear criteria, model answers and a plan for what to practise next.", live: true },
  { icon: GraduationCap, title: "Learning paths", text: "A personal tutor builds courses with lessons, hints-first exercises, quizzes and projects.", live: true },
  { icon: Telescope, title: "Research Agent", text: "Plans research, reads sources and writes reports where every fact is cited.", live: true },
  { icon: Code2, title: "Coding Lab", text: "Real editor, sandboxed test runs and AI feedback on complexity and mistakes.", live: true },
];

export default function Landing() {
  const { user } = useAuth();
  return (
    <div className="mesh-bg min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <ButtonLink href="/dashboard" size="sm">
              Dashboard <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
                Sign in
              </ButtonLink>
              <ButtonLink href="/register" size="sm">
                Get started
              </ButtonLink>
            </>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 text-center sm:px-6 sm:pt-16">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <Badge tone="brand" className="mb-5 px-3 py-1 text-[13px]">
            <Sparkles className="h-3.5 w-3.5" /> Runs on open-source models with Ollama
          </Badge>
          <h1 className="mx-auto max-w-3xl font-display text-4xl font-bold leading-[1.08] tracking-tight text-fg sm:text-6xl">
            Practise interviews. <span className="text-gradient">Grow every day.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-fg-muted">
            SkillVerse AI is your personal coach for interviews and skills. Learn. Practice. Evolve.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink href={user ? "/interview/new" : "/register"} size="lg" className="w-full sm:w-auto">
              Start a mock interview <ArrowRight className="h-5 w-5" />
            </ButtonLink>
            <ButtonLink href={user ? "/dashboard" : "/login"} size="lg" variant="outline" className="w-full sm:w-auto">
              {user ? "Open dashboard" : "I have an account"}
            </ButtonLink>
          </div>
        </motion.div>

        <div className="mt-16 grid gap-4 text-left sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Card
              key={f.title}
              interactive
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.06 }}
              className="p-6"
            >
              <div className="flex items-center justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-gradient text-white shadow-[0_8px_20px_-8px_rgb(124_58_237/0.7)]">
                  <f.icon className="h-5 w-5" />
                </span>
                <Badge tone="success">Available</Badge>
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold text-fg">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{f.text}</p>
            </Card>
          ))}
        </div>

        <div className="mx-auto mt-12 flex max-w-3xl flex-col items-center justify-center gap-x-8 gap-y-3 text-sm text-fg-muted sm:flex-row">
          <span className="inline-flex items-center gap-2">
            <Camera className="h-4 w-4 text-cyan" /> Camera only with your permission
          </span>
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-purple" /> No audio or video is stored
          </span>
          <span className="inline-flex items-center gap-2">
            <Mic className="h-4 w-4 text-blue" /> Voice or text answers · works on Android, Windows and macOS
          </span>
        </div>
      </section>
    </div>
  );
}
