"use client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
export default function ErrorPage({
  unstable_retry,
}: {
  unstable_retry: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <p role="alert">Couldn&apos;t load this. Try again.</p>
        <Button onClick={unstable_retry}>Try again</Button>
      </CardContent>
    </Card>
  );
}
