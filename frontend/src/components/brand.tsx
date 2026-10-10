"use client";

import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { motion } from "framer-motion";
import { useId } from "react";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  // Unique gradient id per instance: a shared id breaks when the first copy sits inside a hidden sidebar.
  const gid = `sv-g-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 40 40" className={cn("h-9 w-9", className)} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7C3AED" />
          <stop offset="0.55" stopColor="#2563EB" />
          <stop offset="1" stopColor="#06B6D4" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="12" fill={`url(#${gid})`} />
      {/* orbit + rising spark: "a universe of skills" */}
      <ellipse cx="20" cy="21" rx="12.5" ry="5.5" fill="none" stroke="white" strokeOpacity="0.55" strokeWidth="1.6" transform="rotate(-24 20 21)" />
      <path d="M20 9.5l2.6 6.4 6.4 2.6-6.4 2.6L20 27.5l-2.6-6.4-6.4-2.6 6.4-2.6z" fill="white" />
      <circle cx="30.5" cy="26.5" r="2" fill="#F97373" />
    </svg>
  );
}

export function Logo({ href = "/", compact }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="group flex items-center gap-2.5 rounded-xl" aria-label="SkillVerse AI home">
      <motion.span whileHover={{ rotate: -8, scale: 1.05 }} transition={{ type: "spring", stiffness: 400, damping: 15 }}>
        <LogoMark />
      </motion.span>
      {!compact && (
        <span className="leading-none">
          <span className="block font-display text-[17px] font-bold tracking-tight text-fg">
            SkillVerse <span className="text-gradient">AI</span>
          </span>
          <span className="mt-1 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
            Learn. Practice. Evolve.
          </span>
        </span>
      )}
    </Link>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      onClick={toggle}
      className={cn(
        "grid h-10 w-10 place-items-center rounded-xl border border-line bg-elevated text-fg-muted transition-colors hover:text-fg",
        className,
      )}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
    >
      <motion.span key={theme} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} transition={{ duration: 0.25 }}>
        {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
      </motion.span>
    </button>
  );
}
