import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
export default function ActivityLoading() {
  return (
    <div role="status" aria-label="Loading activity" className="space-y-4">
      <PageHeader
        title="Your activity"
        description="Everything you've done, all in one place."
      />
      <div aria-hidden className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="bg-muted h-28 animate-pulse" />
        ))}
      </div>
      <Card aria-hidden className="bg-muted h-48 animate-pulse" />
      <Card aria-hidden className="gap-0 overflow-hidden py-0">
        <div className="bg-muted h-10" />
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex h-14 items-center gap-5 border-b px-5">
            <span className="bg-muted h-4 flex-1 animate-pulse rounded" />
            <span className="bg-muted h-5 w-12 animate-pulse rounded-full" />
            <span className="bg-muted hidden h-4 w-24 animate-pulse rounded sm:block" />
          </div>
        ))}
      </Card>
      <span className="sr-only">Loading your sessions</span>
    </div>
  );
}
