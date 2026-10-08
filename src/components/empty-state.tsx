import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

/** Shown in place of empty content: icon tile, title, one sentence, ≤1 action. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="items-center gap-0 px-5 py-10 text-center">
      <span className="bg-muted flex size-10 items-center justify-center rounded-xl">
        <Icon className="text-muted-foreground size-5" strokeWidth={1.75} />
      </span>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="text-muted-foreground mt-1 max-w-sm text-[13px]">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}
