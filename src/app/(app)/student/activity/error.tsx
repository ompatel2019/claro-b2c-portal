"use client";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/icons";
export default function ActivityError({
  unstable_retry,
}: {
  unstable_retry: () => void;
}) {
  return (
    <div className="space-y-4">
      <PageHeader title="Your activity" />
      <Card className="p-5">
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <Alert aria-hidden className="text-destructive size-5" />
          <p>Couldn&apos;t load this. Try again.</p>
          <Button variant="outline" onClick={unstable_retry}>
            Try again
          </Button>
        </div>
      </Card>
    </div>
  );
}
