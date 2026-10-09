import { Card } from "@/components/ui/card";
export default function Loading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading flashcards"
      className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6"
    >
      <div className="bg-muted h-14 animate-pulse rounded-lg" />
      <Card className="p-5">
        <div className="bg-muted h-4 w-20 animate-pulse rounded" />
        <div className="bg-muted h-8 w-2/3 animate-pulse rounded" />
        <div className="bg-muted h-40 animate-pulse rounded-lg" />
      </Card>
    </main>
  );
}
