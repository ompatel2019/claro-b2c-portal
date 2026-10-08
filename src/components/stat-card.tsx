import { Card } from "@/components/ui/card";

/** KPI card: muted label, large tabular value and an optional caption. */
export function StatCard({
  label,
  value,
  caption,
}: {
  label: React.ReactNode;
  value: string | number;
  caption?: React.ReactNode;
}) {
  return (
    <Card size="sm" className="gap-0">
      <dl className="px-4">
        <dt className="text-muted-foreground text-[13px] font-medium">
          {label}
        </dt>
        <dd className="mt-2 text-3xl leading-9 font-semibold tracking-[-0.01em] tabular-nums">
          {value}
        </dd>
        {caption && (
          <dd className="text-muted-foreground mt-1 text-xs">{caption}</dd>
        )}
      </dl>
    </Card>
  );
}
