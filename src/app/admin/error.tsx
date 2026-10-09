"use client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <Card className="p-5">
      <p role="alert">{"Couldn't load this. Try again."}</p>
      <Button className="w-fit" onClick={reset}>
        Try again
      </Button>
    </Card>
  );
}
