"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

/** Shared Select with labelled options and trigger accessibility props. */
export function FormSelect({
  options,
  value,
  defaultValue,
  name,
  disabled,
  required,
  onValueChange,
  ...triggerProps
}: Omit<
  ComponentProps<typeof SelectTrigger>,
  "value" | "defaultValue" | "onChange"
> & {
  options: { value: string; label: string }[];
  value?: string;
  defaultValue?: string;
  name?: string;
  required?: boolean;
  onValueChange?: (value: string) => void;
}) {
  return (
    <Select
      items={options}
      value={value}
      defaultValue={defaultValue}
      name={name}
      disabled={disabled}
      required={required}
      onValueChange={(next) => onValueChange?.(next ?? "")}
    >
      <SelectTrigger
        {...triggerProps}
        className={cn("w-full min-w-0", triggerProps.className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className="h-auto [&>[data-slot=select-item-text]]:min-w-0 [&>[data-slot=select-item-text]]:shrink [&>[data-slot=select-item-text]]:break-words [&>[data-slot=select-item-text]]:whitespace-normal"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
