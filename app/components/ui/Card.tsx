import type { ComponentProps, ReactNode } from "react";

type CardProps = {
  glow?: boolean;
  hover?: boolean;
  variant?: "default" | "cyan";
  className?: string;
  children: ReactNode;
} & Omit<ComponentProps<"div">, "className" | "children">;

export function Card({
  glow = false,
  hover = false,
  variant = "default",
  className = "",
  children,
  ...rest
}: CardProps) {
  const base =
    variant === "cyan"
      ? "border-cyan-400/30 bg-cyan-500/5"
      : "border-white/10 bg-white/5";
  const glowCls = glow
    ? "shadow-[0_0_60px_-30px_rgba(34,211,238,0.6)]"
    : "";
  const hoverCls = hover
    ? "transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-400/30 hover:bg-white/[0.07]"
    : "";

  return (
    <div
      {...rest}
      className={`rounded-2xl border backdrop-blur ${base} ${glowCls} ${hoverCls} ${className}`}
    >
      {children}
    </div>
  );
}
