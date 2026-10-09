"use client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Error({
  unstable_retry,
}: {
  unstable_retry: () => void;
}) {
  return (
    <Card className="p-5">
      <p role="alert">{"Couldn't load this. Try again."}</p>
      <Button onClick={unstable_retry}>Try again</Button>
    </Card>
  );
}
