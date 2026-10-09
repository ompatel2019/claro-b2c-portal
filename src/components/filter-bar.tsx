"use client";
import Form from "next/form";
import { useEffect, useRef, useState } from "react";
import { FormSelect } from "./ui/form-select";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";

export type Filter =
  | {
      name: string;
      label: string;
      options: { value: string; label: string }[];
      all: string;
      clearOnChange?: string[];
    }
  | { name: string; label: string; checkbox: true }
  | {
      name: string;
      label: string;
      placeholder: string;
      inputMode?: "numeric";
      type?: "date";
    };

/** URL-synced filters: selects apply on change, text applies on Enter. */
export function FilterBar({
  filters,
  values,
  hidden,
  activeCount,
  clearHref,
  customSelect = false,
}: {
  customSelect?: boolean;
  hidden?: Record<string, string | undefined>;
  /** Count external chips as well as the controls in this form. */
  activeCount?: number;
  /** Clear external filters too; by default hidden context is preserved. */
  clearHref?: string;
  filters: Filter[];
  values: Record<string, string | undefined>;
}) {
  const path = usePathname();
  const kept = Object.entries(hidden ?? {}).filter(
    (e): e is [string, string] => !!e[1],
  );
  const active = activeCount ?? filters.filter((f) => values[f.name]).length;
  return (
    <Form
      key={JSON.stringify(values)}
      action={path}
      className="flex flex-wrap items-end gap-3"
    >
      {kept.map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {filters.map((f) => (
        <label
          key={f.name}
          className="text-muted-foreground grid min-w-0 gap-1 text-[13px] font-medium"
        >
          {!("checkbox" in f) && f.label}
          {"checkbox" in f ? (
            <span className="flex h-9 items-center gap-2">
              <input
                type="checkbox"
                name={f.name}
                value="1"
                defaultChecked={values[f.name] === "1"}
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
                className="accent-primary size-4"
              />
              {f.label}
            </span>
          ) : "options" in f ? (
            customSelect ? (
              <SelectFilter filter={f} initialValue={values[f.name] ?? ""} />
            ) : (
              <select
                // The wrapping label's name would also include the selected option.
                aria-label={f.label}
                className="field h-9 w-full max-w-64 bg-white py-0"
                name={f.name}
                defaultValue={values[f.name] ?? ""}
                onChange={(e) => {
                  const form = e.currentTarget.form;
                  for (const name of f.clearOnChange ?? []) {
                    const input = form?.elements.namedItem(name);
                    if (input instanceof HTMLInputElement)
                      input.disabled = true;
                  }
                  form?.requestSubmit();
                }}
              >
                <option value="">{f.all}</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )
          ) : (
            <Input
              className="w-48 max-w-full"
              name={f.name}
              inputMode={f.inputMode}
              type={f.type}
              placeholder={f.placeholder}
              defaultValue={values[f.name] ?? ""}
            />
          )}
        </label>
      ))}
      <Button type="submit" variant="outline">
        Apply
      </Button>
      {active > 0 && (
        <Link
          href={
            clearHref ??
            (kept.length ? `${path}?${new URLSearchParams(kept)}` : path)
          }
          className={buttonVariants({ variant: "ghost" })}
        >
          Clear ({active})
        </Link>
      )}
    </Form>
  );
}

function SelectFilter({
  filter,
  initialValue,
}: {
  filter: Extract<Filter, { options: unknown }>;
  initialValue: string;
}) {
  const [value, setValue] = useState(initialValue);
  const previous = useRef(initialValue);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    const form = container.current?.closest("form");
    for (const name of filter.clearOnChange ?? []) {
      const input = form?.elements.namedItem(name);
      if (input instanceof HTMLInputElement) input.disabled = true;
    }
    form?.requestSubmit();
  }, [value, filter.clearOnChange]);
  return (
    <div ref={container} className="w-full max-w-64">
      <FormSelect
        aria-label={filter.label}
        name={filter.name}
        value={value}
        onValueChange={setValue}
        options={[{ value: "", label: filter.all }, ...filter.options]}
      />
    </div>
  );
}
