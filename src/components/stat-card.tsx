import { ArrowDown, ArrowUp, Minus } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Delta badge for a StatCard caption: "+3 vs last week". */
export function Delta({
  d,
  children,
}: {
  d: number;
  children: React.ReactNode;
}) {
  const Icon = d > 0 ? ArrowUp : d < 0 ? ArrowDown : Minus;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge variant={d > 0 ? "success" : d < 0 ? "destructive" : "secondary"}>
        <Icon className="size-3" />
        {d > 0 ? "+" : d < 0 ? "−" : "±"}
        {Math.abs(d)}
      </Badge>
      <span>{children}</span>
    </span>
  );
}

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
