import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** KPI card: muted label, large tabular value and an optional caption. */
export function StatCard({
  label,
  value,
  caption,
  className,
  empty = false,
}: {
  label: React.ReactNode;
  value: string | number;
  caption?: React.ReactNode;
  className?: string;
  empty?: boolean;
}) {
  return (
    <Card size="sm" className={cn("gap-0", className)}>
      <dl className="px-4">
        <dt className="text-muted-foreground text-[13px] font-medium">
          {label}
        </dt>
        <dd
          className={cn(
            "mt-2 leading-9",
            empty
              ? "text-muted-foreground text-sm"
              : "text-2xl font-semibold tracking-[-0.01em] tabular-nums sm:text-3xl",
          )}
        >
          {value}
        </dd>
        {caption && (
          <dd className="text-muted-foreground mt-1 text-xs">{caption}</dd>
        )}
      </dl>
    </Card>
  );
}
