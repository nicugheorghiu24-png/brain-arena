import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-cyan-400 text-black hover:bg-cyan-300 hover:shadow-[0_0_24px_-2px_rgba(34,211,238,0.9)]",
  outline:
    "border border-cyan-400/60 text-cyan-300 hover:border-cyan-300 hover:bg-cyan-400/10 hover:shadow-[0_0_18px_-2px_rgba(34,211,238,0.6)]",
  ghost: "text-gray-300 hover:bg-white/5 hover:text-cyan-200",
  danger:
    "border border-rose-400/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 hover:border-rose-300/60",
};

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm rounded-lg",
  md: "px-4 py-2 text-sm rounded-xl",
  lg: "px-6 py-3 text-base rounded-2xl",
};

const base =
  "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60";

function buildClass(variant: Variant, size: Size, extra?: string): string {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra ?? ""}`.trim();
}

type StyleProps = {
  variant?: Variant;
  size?: Size;
};

type ButtonProps = StyleProps & ComponentProps<"button">;

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button {...rest} className={buildClass(variant, size, className)}>
      {children}
    </button>
  );
}

type LinkButtonProps = StyleProps & ComponentProps<typeof Link>;

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link {...rest} className={buildClass(variant, size, className)}>
      {children}
    </Link>
  );
}

export type { Variant as ButtonVariant, Size as ButtonSize };
export type ButtonChildren = ReactNode;
