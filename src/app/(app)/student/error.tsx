"use client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/icons";
export default function Error({
  unstable_retry,
}: {
  unstable_retry: () => void;
}) {
  return (
    <Card className="items-start p-5">
      <p role="alert" className="flex items-center gap-2 text-sm">
        <Alert className="size-4" />
        {"Couldn't load this. Try again."}
      </p>
      <Button variant="outline" onClick={unstable_retry}>
        Try again
      </Button>
    </Card>
  );
}
