import { Card, CardContent } from "@/components/ui/card";

export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading marking accuracy"
      className="min-w-0 space-y-4"
    >
      <div
        aria-hidden="true"
        className="bg-muted h-20 w-full animate-pulse rounded-lg"
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="space-y-3">
              <div
                aria-hidden="true"
                className="bg-muted h-4 w-24 animate-pulse rounded-lg"
              />
              <div
                aria-hidden="true"
                className="bg-muted h-9 w-32 animate-pulse rounded-lg"
              />
              <div
                aria-hidden="true"
                className="bg-muted h-4 w-full animate-pulse rounded-lg"
              />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardContent>
              <div
                aria-hidden="true"
                className="bg-muted h-60 w-full animate-pulse rounded-lg"
              />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent>
          <div
            aria-hidden="true"
            className="bg-muted h-24 w-full animate-pulse rounded-lg"
          />
        </CardContent>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardContent>
              <div
                aria-hidden="true"
                className="bg-muted h-64 w-full animate-pulse rounded-lg"
              />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent>
          <div
            aria-hidden="true"
            className="bg-muted h-72 w-full animate-pulse rounded-lg"
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <div
            aria-hidden="true"
            className="bg-muted h-40 w-full animate-pulse rounded-lg"
          />
        </CardContent>
      </Card>
    </div>
  );
}
