"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { Logo, ThemeToggle } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ErrorState } from "@/components/ui/feedback";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";

function safeNext(next: string | null) {
  // Only allow internal paths to prevent open redirects.
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { login, register, user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitted = useRef(false);

  useEffect(() => {
    // Already signed in (e.g. opened /login in a new tab): go straight in.
    if (!loading && user && !submitted.current) router.replace(next);
  }, [loading, user, next, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (mode === "register" && (password.length < 8 || /^[A-Za-z]+$/.test(password) || /^\d+$/.test(password))) {
      setError("Use at least 8 characters, mixing letters with numbers or symbols.");
      return;
    }
    setBusy(true);
    submitted.current = true;
    try {
      if (mode === "login") await login(email, password);
      else await register(name, email, password);
      router.replace(mode === "register" ? "/profile?welcome=1" : next);
    } catch (err) {
      submitted.current = false;
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const isLogin = mode === "login";
  return (
    <div className="mesh-bg flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-4 py-5 sm:px-8">
        <Logo />
        <ThemeToggle />
      </header>
      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-md rounded-3xl border border-line bg-elevated/90 p-6 shadow-lift backdrop-blur-xl sm:p-8"
        >
          <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
            {isLogin ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1.5 text-sm text-fg-muted">
            {isLogin ? "Sign in to continue your practice." : "Start practising interviews in under a minute."}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            {!isLogin && (
              <Field label="Full name" htmlFor="name">
                <Input id="name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
              </Field>
            )}
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field
              label="Password"
              htmlFor="password"
              hint={isLogin ? undefined : "At least 8 characters with letters and numbers or symbols."}
            >
              <div className="relative">
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  maxLength={72}
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-fg-subtle hover:text-fg"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            {error && <ErrorState message={error} />}
            <Button type="submit" size="lg" loading={busy} className="w-full">
              {isLogin ? "Sign in" : "Create account"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-fg-muted">
            {isLogin ? "New to SkillVerse AI? " : "Already have an account? "}
            <Link
              href={isLogin ? "/register" : "/login"}
              className="font-semibold text-purple hover:underline dark:text-[#c4b5fd]"
            >
              {isLogin ? "Create an account" : "Sign in"}
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
