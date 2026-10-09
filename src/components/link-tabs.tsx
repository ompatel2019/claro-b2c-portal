import Link from "next/link";

/** Tabs above admin content: links, synced through the URL. */
export function LinkTabs({
  tabs,
  active,
  label,
}: {
  tabs: { value: string; label: string; count?: number | null; href: string }[];
  active: string;
  label: string;
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1 border-b">
      {tabs.map((t) => (
        <Link
          key={t.value}
          href={t.href}
          aria-current={t.value === active ? "page" : undefined}
          aria-label={
            t.count === null ? `${t.label} (count unavailable)` : undefined
          }
          className="text-muted-foreground hover:text-ink aria-[current=page]:border-ink aria-[current=page]:text-ink -mb-px inline-flex h-9 items-center gap-1.5 border-b-2 border-transparent px-3 text-sm font-medium"
        >
          {t.label}
          {t.count === null ? (
            <span title="Count unavailable">(?)</span>
          ) : t.count !== undefined ? (
            ` (${t.count})`
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
