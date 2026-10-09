"use client";
import { useEffect, useRef, useState } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Popover, PopoverContent } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { calendarDate } from "@/lib/students";
import { dateLabel } from "@/lib/practice";
import Form from "next/form";
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
      chips?: boolean;
    }
  | { name: string; label: string; checkbox: true }
  | {
      name: string;
      label: string;
      dateRange: { from: string; to: string; today: string };
    }
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
  const active =
    activeCount ??
    filters.reduce(
      (n, f) =>
        n +
        ("dateRange" in f
          ? Number(!!values[f.dateRange.from]) +
            Number(!!values[f.dateRange.to])
          : Number(!!values[f.name])),
      0,
    );
  return (
    <Form
      key={JSON.stringify(values)}
      action={path}
      className="flex flex-wrap items-end gap-3"
    >
      {kept.map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {filters.map((f) =>
        "dateRange" in f ? (
          <DateRangeFilter key={f.name} filter={f} values={values} />
        ) : "options" in f && f.chips ? (
          <KindChips key={f.name} filter={f} value={values[f.name]} />
        ) : (
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
        ),
      )}
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

/** Opt-in URL kind chips; existing select filters retain their behaviour. */
function KindChips({
  filter,
  value,
}: {
  filter: Extract<Filter, { options: unknown }>;
  value: string | undefined;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="grid min-w-0 gap-1 text-[13px]">
      <span className="text-muted-foreground font-medium">{filter.label}</span>
      <input
        ref={input}
        type="hidden"
        name={filter.name}
        defaultValue={value ?? ""}
      />
      <ToggleGroup
        aria-label={filter.label}
        value={[value || "all"]}
        className="max-w-full flex-wrap"
        onValueChange={(next) => {
          if (!next.length || !input.current) return;
          input.current.value = next[0] === "all" ? "" : String(next[0]);
          input.current.form?.requestSubmit();
        }}
      >
        {[{ value: "all", label: filter.all }, ...filter.options].map((o) => (
          <ToggleGroupItem key={o.value} value={o.value}>
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

/** Opt-in Calendar range; both endpoints are ordinary URL form fields. */
function DateRangeFilter({
  filter,
  values,
}: {
  filter: Extract<Filter, { dateRange: unknown }>;
  values: Record<string, string | undefined>;
}) {
  const { from: fromName, to: toName, today } = filter.dateRange;
  const [from, setFrom] = useState(calendarDate(values[fromName]) ?? "");
  const [to, setTo] = useState(calendarDate(values[toName]) ?? "");
  const [endpoint, setEndpoint] = useState<"from" | "to">("from");
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="grid gap-1 text-[13px]">
      <span className="text-muted-foreground font-medium">{filter.label}</span>
      <input ref={input} type="hidden" name={fromName} value={from} />
      <input type="hidden" name={toName} value={to} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger
          render={<Button type="button" variant="outline" />}
        >
          {from || to
            ? `${from ? dateLabel(from, true) : "Any date"} to ${to ? dateLabel(to, true) : "Any date"}`
            : filter.label}
        </PopoverPrimitive.Trigger>
        <PopoverContent>
          <ToggleGroup
            aria-label="Date endpoint"
            value={[endpoint]}
            onValueChange={(v) => {
              if (v[0]) setEndpoint(v[0] as "from" | "to");
            }}
          >
            <ToggleGroupItem value="from">From</ToggleGroupItem>
            <ToggleGroupItem value="to">To</ToggleGroupItem>
          </ToggleGroup>
          <Calendar
            label={endpoint === "from" ? "From date" : "To date"}
            today={today}
            value={endpoint === "from" ? from : to}
            onChange={(day) => {
              if (endpoint === "from") {
                setFrom(day);
                if (to && day > to) setTo(day);
              } else {
                setTo(day);
                if (from && day < from) setFrom(day);
              }
            }}
          />
          <Button
            type="button"
            onClick={() => {
              setOpen(false);
              input.current?.form?.requestSubmit();
            }}
          >
            Apply dates
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
