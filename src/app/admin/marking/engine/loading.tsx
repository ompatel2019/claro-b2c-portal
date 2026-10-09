import { Card, CardContent } from "@/components/ui/card";
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading marking engine"
      className="min-w-0 space-y-4"
    >
      <div
        aria-hidden="true"
        className="bg-muted h-20 w-full animate-pulse rounded-lg"
      />
      <div
        aria-hidden="true"
        className="bg-muted h-9 w-48 animate-pulse rounded-lg"
      />
      <Card>
        <CardContent>
          <div
            aria-hidden="true"
            className="bg-muted h-96 w-full animate-pulse rounded-lg"
          />
        </CardContent>
      </Card>
    </div>
  );
}
