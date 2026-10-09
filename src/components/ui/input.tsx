import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "border-input file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 disabled:bg-input/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 file:bg-secondary hover:file:bg-secondary/80 h-9 w-full min-w-0 rounded-[10px] border bg-white px-3 py-1 text-base transition-colors outline-none file:mr-3 file:inline-flex file:h-7 file:cursor-pointer file:rounded-md file:border-0 file:px-3 file:text-sm file:font-medium focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 md:text-sm",
        type === "file" && "py-0 file:my-0.5",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
