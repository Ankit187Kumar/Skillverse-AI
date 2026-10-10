"use client";

import Link from "next/link";
import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "icon";

const base =
  "group/btn relative inline-flex items-center justify-center gap-2 rounded-xl font-semibold whitespace-nowrap select-none " +
  "transition-[transform,box-shadow,background-color,background-position,color,border-color] duration-200 ease-out " +
  "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-55 touch-manipulation";

const variants: Record<Variant, string> = {
  primary:
    "text-white bg-[linear-gradient(110deg,#7C3AED,#2563EB_45%,#06B6D4_90%,#7C3AED)] bg-[length:220%_100%] bg-left " +
    "hover:bg-right shadow-[0_6px_20px_-6px_rgb(124_58_237/0.55)] hover:shadow-[0_10px_28px_-8px_rgb(37_99_235/0.6)] hover:scale-[1.02]",
  secondary: "bg-muted text-fg hover:bg-line border border-line",
  outline: "border border-line-strong text-fg hover:border-purple hover:text-purple dark:hover:text-[#c4b5fd] bg-elevated",
  ghost: "text-fg-muted hover:text-fg hover:bg-muted",
  danger: "bg-danger text-white hover:brightness-110 shadow-sm",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-7 text-base",
  icon: "h-10 w-10",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={cn(base, variants[variant], sizes[size], className)}>
      {children}
    </Link>
  );
}
