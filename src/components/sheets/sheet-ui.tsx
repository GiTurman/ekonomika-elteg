// Shared UI utilities for the 5 sheet views (matches Excel color coding)

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

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
  const [text, setText] = useState(() => (Number.isFinite(value) ? String(value) : "0"));
  const focused = useRef(false);

  // Only resync display from the external value while the field isn't being typed in,
  // so a re-render mid-keystroke can't fight the user's cursor position.
  useEffect(() => {
    if (!focused.current) setText(Number.isFinite(value) ? String(value) : "0");
  }, [value]);

  return (
    <Input
      {...rest}
      type="number"
      inputMode="decimal"
      step={step}
      value={text}
      onFocus={(e) => {
        focused.current = true;
        e.target.select(); // clicking into a "0" field selects it, so typing replaces it entirely
      }}
      onChange={(e) => {
        const v = e.target.value;
        setText(v);
        if (v === "" || v === "-" || v === ".") return; // let the user keep typing
        const n = Number(v);
        if (Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => {
        focused.current = false;
        setText(Number.isFinite(value) ? String(value) : "0");
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
  const [text, setText] = useState(() => (value * 100).toFixed(2));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText((value * 100).toFixed(2));
  }, [value]);

  return (
    <Input
      type="number"
      inputMode="decimal"
      step="0.01"
      value={text}
      onFocus={(e) => {
        focused.current = true;
        e.target.select();
      }}
      onChange={(e) => {
        const v = e.target.value;
        setText(v);
        if (v === "" || v === "-" || v === ".") return;
        const n = Number(v);
        if (Number.isFinite(n)) onChange(n / 100);
      }}
      onBlur={() => {
        focused.current = false;
        setText((value * 100).toFixed(2));
      }}
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
