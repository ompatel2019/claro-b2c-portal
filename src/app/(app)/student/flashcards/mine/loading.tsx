export default function Loading() {
  return (
    <div role="status" aria-label="Loading my cards" className="space-y-4">
      <div className="bg-muted h-16 animate-pulse rounded-2xl" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-muted h-24 animate-pulse rounded-2xl" />
        ))}
      </div>
      <div className="bg-muted h-96 animate-pulse rounded-2xl" />
    </div>
  );
}
