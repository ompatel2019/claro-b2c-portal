"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { calculate } from "@/lib/calc";
import { cn } from "@/lib/utils";

const KEYS = [
  "C",
  "⌫",
  "(",
  ")",
  "%",
  "±",
  "√",
  "÷",
  "7",
  "8",
  "9",
  "×",
  "4",
  "5",
  "6",
  "−",
  "1",
  "2",
  "3",
  "+",
  "0",
  ".",
  "Ans",
  "=",
];
const KEY_MAP: Record<string, string> = {
  "*": "×",
  "/": "÷",
  "-": "−",
  Enter: "=",
  Backspace: "⌫",
  Delete: "C",
};
const SPOT = "claro-calculator-position";

/** §2.2: floating, draggable calculator with a safe parser. Esc closes. */
export function Calculator({ onClose }: { onClose: () => void }) {
  const [expr, setExpr] = useState("");
  const [last, setLast] = useState<{ expr: string; result: string } | null>(
    null,
  );
  const [ans, setAns] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = panel.current!;
    const saved = JSON.parse(localStorage.getItem(SPOT) ?? "null");
    if (saved)
      Object.assign(el.style, { left: `${saved.x}px`, top: `${saved.y}px` });
    el.focus();
  }, []);

  function press(key: string) {
    if (key === "C") return setExpr("");
    if (key === "⌫") return setExpr((e) => e.replace(/(Ans|.)$/, ""));
    if (key === "±")
      return setExpr((e) => (e.startsWith("−") ? e.slice(1) : `−${e}`));
    if (key === "=") {
      try {
        const v = calculate(expr, ans);
        setLast({ expr, result: String(v) });
        setAns(v);
        setExpr(String(v));
      } catch (e) {
        setLast({ expr, result: (e as Error).message });
      }
      return;
    }
    setExpr((e) => e + key);
  }

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label="Calculator"
      tabIndex={-1}
      className="bg-card fixed top-20 right-6 z-50 w-[260px] rounded-xl border p-3 shadow-lg outline-none"
      onKeyDown={(e) => {
        if (e.key === "Escape") return onClose();
        const key = KEY_MAP[e.key] ?? e.key;
        if (
          KEYS.includes(key) &&
          !(e.target instanceof HTMLButtonElement && e.key === "Enter")
        ) {
          e.preventDefault();
          e.stopPropagation();
          press(key);
        }
      }}
    >
      <div
        className="mb-2 flex cursor-move items-center justify-between text-sm font-semibold select-none"
        onPointerDown={(e) => {
          const r = panel.current!.getBoundingClientRect();
          drag.current = { x: e.clientX - r.left, y: e.clientY - r.top };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const x = Math.max(0, e.clientX - drag.current.x);
          const y = Math.max(0, e.clientY - drag.current.y);
          Object.assign(panel.current!.style, {
            left: `${x}px`,
            top: `${y}px`,
            right: "auto",
          });
        }}
        onPointerUp={() => {
          drag.current = null;
          const r = panel.current!.getBoundingClientRect();
          localStorage.setItem(SPOT, JSON.stringify({ x: r.left, y: r.top }));
        }}
      >
        Calculator
        <button type="button" aria-label="Close calculator" onClick={onClose}>
          <X className="size-4" />
        </button>
      </div>
      <div className="bg-muted mb-2 rounded-lg px-3 py-2 text-right tabular-nums">
        <p className="text-muted-foreground h-4 truncate text-xs">
          {last && `${last.expr} = ${last.result}`}
        </p>
        <p
          aria-live="polite"
          aria-label="Calculator display"
          className="truncate text-lg font-semibold"
        >
          {expr || "0"}
        </p>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className={cn(
              "hover:bg-muted h-9 rounded-lg border text-sm font-medium",
              k === "=" && "bg-ink border-ink hover:bg-ink/90 text-white",
            )}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}
