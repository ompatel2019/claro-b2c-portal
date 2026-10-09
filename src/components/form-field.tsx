"use client";
import { cloneElement, isValidElement, useId } from "react";

/** K8: stable control name, hint and inline error linked to the input. */
export function FormField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <label className="grid min-w-0 gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {hint && (
        <span id={`${id}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </span>
      )}
      {isValidElement(children)
        ? cloneElement(
            children as React.ReactElement<React.HTMLAttributes<HTMLElement>>,
            {
              "aria-label": label,
              "aria-invalid": !!error,
              "aria-describedby":
                [hint && `${id}-hint`, error && `${id}-error`]
                  .filter(Boolean)
                  .join(" ") || undefined,
            },
          )
        : children}
      {error && (
        <span
          id={`${id}-error`}
          role="alert"
          className="text-destructive text-xs"
        >
          {error}
        </span>
      )}
    </label>
  );
}
