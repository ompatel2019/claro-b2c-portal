import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { loadSpend } from "@/lib/admin-data";

export default async function SpendPage() {
  const spend = await loadSpend();
  const pct = Math.min(100, Math.round((spend.all / spend.cap) * 100));
  return (
    <div className="space-y-4">
      <PageHeader
        title="AI spend"
        description={`Cap $${spend.cap.toFixed(0)}. Stop work near $90; hard stop at the cap.`}
      />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <StatCard label="Today (Sydney)" value={`$${spend.today.toFixed(2)}`} />
        <StatCard label="All time" value={`$${spend.all.toFixed(2)}`} />
        <StatCard label="Of cap" value={`${pct}%`} />
      </div>
      <div
        role="progressbar"
        aria-label="Spend against cap"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="bg-chart-5 h-1.5 overflow-hidden rounded-full"
      >
        <div className="bg-brand h-full" style={{ width: `${pct}%` }} />
      </div>
      <section className="panel space-y-3">
        <h2>By model</h2>
        <ul className="space-y-2">
          {spend.byModel.map(({ model, usd }) => (
            <li key={model} className="flex justify-between gap-4 text-sm">
              <span className="break-all">{model}</span>
              <span>${usd.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel space-y-3">
        <h2>By feature</h2>
        <ul className="space-y-2">
          {spend.byTask
            .flatMap((group) => group.tasks)
            .map(({ task, usd }) => (
              <li key={task} className="flex justify-between gap-4 text-sm">
                <span className="break-all">{task}</span>
                <span>${usd.toFixed(2)}</span>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
