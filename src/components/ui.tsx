import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cn } from "../utils/cn";

export function Btn({
  children,
  onClick,
  variant = "default",
  size = "md",
  className,
  title,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "ok" | "warn" | "danger" | "ghost";
  size?: "sm" | "md";
  className?: string;
  title?: string;
  disabled?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-150 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none select-none";
  const sizes = { sm: "px-2.5 py-1.5 text-[12px]", md: "px-4 py-2 text-[13px]" };
  const variants = {
    default: "bg-ink-700 text-ink-100 hover:bg-ink-600 border border-white/[0.06]",
    primary:
      "bg-gradient-to-b from-amber-300 to-amber-500 text-ink-950 font-semibold shadow-[0_4px_16px_-4px_rgba(245,179,60,0.5)] hover:brightness-110",
    ok: "bg-gradient-to-b from-emerald-400 to-emerald-600 text-emerald-950 font-semibold hover:brightness-110 shadow-[0_4px_16px_-6px_rgba(52,211,153,0.5)]",
    warn: "bg-gradient-to-b from-orange-400 to-orange-600 text-orange-950 font-semibold hover:brightness-110",
    danger: "bg-ink-700 text-red-300 border border-red-500/30 hover:bg-red-500/15",
    ghost: "text-ink-300 hover:text-ink-100 hover:bg-white/5",
  };
  return (
    <button onClick={onClick} title={title} disabled={disabled} className={cn(base, sizes[size], variants[variant], className)}>
      {children}
    </button>
  );
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}

export function Num({
  value,
  onChange,
  min,
  max,
  step = 1,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  // no min/max clamping — any value can be typed freely
  void min;
  void max;
  void step;
  return (
    <input
      type="number"
      step="any"
      className={cn("inp", className)}
      value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        onChange(Number.isFinite(v) ? v : 0);
      }}
    />
  );
}

export function Chip({ children, tone = "slate", className }: { children: ReactNode; tone?: "slate" | "amber" | "green" | "red" | "cyan"; className?: string }) {
  const tones = {
    slate: "bg-white/[0.05] text-ink-200 border-white/[0.07]",
    amber: "bg-amber-400/10 text-amber-300 border-amber-400/25",
    green: "bg-emerald-400/10 text-emerald-300 border-emerald-400/25",
    red: "bg-red-400/10 text-red-300 border-red-400/25",
    cyan: "bg-cyan-400/10 text-cyan-300 border-cyan-400/25",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium font-mono", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Empty({ title, sub, icon }: { title: string; sub?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <div className="rounded-2xl border border-white/[0.07] bg-ink-800/70 p-4 text-ink-400">{icon ?? <Inbox size={26} />}</div>
      <div className="font-display text-sm font-semibold text-ink-200 mt-1">{title}</div>
      {sub && <div className="text-xs text-ink-400 max-w-[300px]">{sub}</div>}
    </div>
  );
}

export function Stat({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-ink-900/70 px-3.5 py-2.5 min-w-[110px]">
      <div className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-semibold">{label}</div>
      <div className="font-mono text-lg font-semibold mt-0.5" style={tone ? { color: tone } : undefined}>
        {value}
        {unit && <span className="text-[11px] text-ink-400 ml-1">{unit}</span>}
      </div>
    </div>
  );
}
