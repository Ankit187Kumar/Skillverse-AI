"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  Code2,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  Settings,
  Telescope,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Logo, ThemeToggle } from "./brand";
import { AIStatusBanner } from "./ai-status";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/interview", label: "AI Interview", icon: MessagesSquare },
  { href: "/learn", label: "Learn Skills", icon: GraduationCap },
  { href: "/research", label: "Research Agent", icon: Telescope },
  { href: "/coding", label: "Coding Lab", icon: Code2 },
  { href: "/progress", label: "Progress", icon: BarChart3 },
];
const ACCOUNT = [
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/settings", label: "Settings", icon: Settings },
];
const MOBILE_TABS = [NAV[0], NAV[1], NAV[2]];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLink({
  item,
  pathname,
  onClick,
}: {
  item: { href: string; label: string; icon: typeof LayoutDashboard; soon?: string };
  pathname: string;
  onClick?: () => void;
}) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] font-semibold transition-colors",
        active ? "text-fg" : "text-fg-muted hover:bg-muted hover:text-fg",
      )}
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute inset-0 rounded-xl bg-brand-soft ring-1 ring-purple/20"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      )}
      <Icon
        className={cn(
          "relative h-[19px] w-[19px] transition-transform duration-200 group-hover:-rotate-6 group-hover:scale-110",
          active && "text-purple dark:text-[#c4b5fd]",
        )}
        aria-hidden
      />
      <span className="relative flex-1">{item.label}</span>
      {item.soon && (
        <span className="relative rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-fg-subtle">
          {item.soon}
        </span>
      )}
    </Link>
  );
}

function UserChip({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth();
  if (!user) return null;
  const initials = user.full_name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-muted/60 p-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-gradient text-sm font-bold text-white">
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-fg">{user.full_name}</p>
        <p className="truncate text-xs text-fg-subtle">{user.email}</p>
      </div>
      <button
        onClick={onLogout}
        className="grid h-9 w-9 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-elevated hover:text-danger"
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const nav = (onClick?: () => void) => (
    <>
      <nav aria-label="Main" className="space-y-1">
        {NAV.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} onClick={onClick} />
        ))}
      </nav>
      <div className="mt-6 border-t border-line pt-4">
        <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-fg-subtle">Account</p>
        <nav aria-label="Account" className="space-y-1">
          {ACCOUNT.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} onClick={onClick} />
          ))}
        </nav>
      </div>
    </>
  );

  return (
    <div className="min-h-dvh lg:pl-72">
      <a
        href="#main"
        className="sr-only z-[200] rounded-lg bg-elevated px-3 py-2 focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col border-r border-line bg-elevated/80 px-4 py-5 backdrop-blur-xl lg:flex">
        <div className="px-2 pb-6">
          <Logo href="/dashboard" />
        </div>
        <div className="flex-1 overflow-y-auto">{nav()}</div>
        <div className="space-y-3 pt-4">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-fg-subtle">Theme</span>
            <ThemeToggle />
          </div>
          <UserChip onLogout={handleLogout} />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-line bg-bg/85 px-4 backdrop-blur-xl lg:hidden">
        <Logo href="/dashboard" compact />
        <span className="font-display text-[15px] font-bold tracking-tight text-fg">
          SkillVerse <span className="text-gradient">AI</span>
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => setOpen(true)}
            className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-elevated text-fg"
            aria-label="Open menu"
            aria-expanded={open}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-[#0B1020]/50 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              className="fixed inset-y-0 right-0 z-50 flex w-[min(20rem,86vw)] flex-col bg-elevated p-4 shadow-2xl lg:hidden"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
            >
              <div className="mb-5 flex items-center justify-between">
                <Logo href="/dashboard" />
                <button
                  onClick={() => setOpen(false)}
                  className="grid h-10 w-10 place-items-center rounded-xl text-fg-muted hover:bg-muted"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">{nav(() => setOpen(false))}</div>
              <UserChip onLogout={handleLogout} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main id="main" className="mx-auto w-full max-w-7xl px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">
        <AIStatusBanner />
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile bottom tabs */}
      <nav
        aria-label="Quick"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-elevated/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        {MOBILE_TABS.map((t) => {
          const active = isActive(pathname, t.href);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold",
                active ? "text-purple dark:text-[#c4b5fd]" : "text-fg-subtle",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {t.label.replace("AI ", "").replace(" Skills", "")}
            </Link>
          );
        })}
        <button
          onClick={() => setOpen(true)}
          className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-fg-subtle"
        >
          <Menu className="h-5 w-5" aria-hidden />
          More
        </button>
      </nav>
    </div>
  );
}
