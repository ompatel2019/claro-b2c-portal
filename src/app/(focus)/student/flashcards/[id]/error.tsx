"use client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <Card className="p-5">
        <p role="alert">{"Couldn't load this. Try again."}</p>
        <Button onClick={reset}>Try again</Button>
      </Card>
    </main>
  );
}
