"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { LogoMark } from "@/components/brand";
import { useAuth } from "@/lib/auth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, pathname, router]);

  if (loading || !user) {
    return (
      <div className="grid min-h-dvh place-items-center" role="status" aria-label="Loading">
        <LogoMark className="h-12 w-12 animate-pulse" />
      </div>
    );
  }
  return <AppShell>{children}</AppShell>;
}
