// Shared UI utilities for the 5 sheet views (matches Excel color coding)

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import type { InputHTMLAttributes } from "react";

// Blue text = user input (per template legend)
export const inputCls =
  "h-8 text-sm text-blue-700 dark:text-blue-300 font-medium border-blue-200 focus-visible:ring-blue-400";

// Computed / formula (black)
export const computedCls = "font-mono text-sm tabular-nums";
// Cross-sheet reference (green)
export const linkedCls = "font-mono text-sm tabular-nums text-emerald-700 dark:text-emerald-400";

export function fmtNum(n: number, digits = 2) {
  if (!isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export function fmtUsd(n: number, digits = 2) {
  return "$ " + fmtNum(n, digits);
}
export function fmtGel(n: number, digits = 2) {
  return "₾ " + fmtNum(n, digits);
}
export function fmtPct(n: number, digits = 2) {
  return (n * 100).toFixed(digits) + "%";
}

interface NumInProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: number;
  onChange: (v: number) => void;
  step?: string | number;
}
export function NumberInput({ value, onChange, className, step = "any", ...rest }: NumInProps) {
  return (
    <Input
      {...rest}
      type="number"
      inputMode="decimal"
      step={step}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === "" ? 0 : Number(v));
      }}
      className={cn(inputCls, "text-right", className)}
    />
  );
}

interface PctInProps {
  value: number; // fraction 0..1
  onChange: (v: number) => void;
  className?: string;
}
export function PercentInput({ value, onChange, className }: PctInProps) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      step="0.01"
      value={(value * 100).toFixed(2)}
      onChange={(e) => onChange(Number(e.target.value) / 100)}
      className={cn(inputCls, "text-right", className)}
    />
  );
}

export function TextInput({
  value,
  onChange,
  className,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <Input
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(inputCls, className)}
    />
  );
}
