import clsx, { type ClassValue } from "clsx";

export const cn = (...v: ClassValue[]) => clsx(v);

export function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  return new Date(iso).toLocaleDateString(undefined, opts);
}

export function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(iso, { day: "numeric", month: "short" });
}

export function scoreTone(score: number | null | undefined) {
  if (score == null) return { label: "No data yet", color: "var(--fg-subtle)" };
  if (score >= 85) return { label: "Excellent", color: "#059669" };
  if (score >= 70) return { label: "Strong", color: "#2563EB" };
  if (score >= 55) return { label: "Developing", color: "#D97706" };
  return { label: "Needs work", color: "#F97373" };
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Minutes east of UTC for the browser's time zone (e.g. 330 for IST). */
export const tzOffset = () => -new Date().getTimezoneOffset();
