import { loadSpend } from "@/lib/admin-data";

export default async function SpendPage() {
  const spend = await loadSpend();
  const pct = Math.min(100, Math.round((spend.all / spend.cap) * 100));
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-8">
      <h1>AI spend</h1>
      <p>
        Cap ${spend.cap.toFixed(0)}. Stop work near $90; hard stop at the cap.
      </p>
      <dl className="grid gap-4 sm:grid-cols-3">
        {[
          ["Today (Sydney)", `$${spend.today.toFixed(2)}`],
          ["All time", `$${spend.all.toFixed(2)}`],
          ["Of cap", `${pct}%`],
        ].map(([label, value]) => (
          <div key={label} className="panel p-6">
            <dt className="text-sm">{label}</dt>
            <dd className="mt-2 font-serif text-4xl">{value}</dd>
          </div>
        ))}
      </dl>
      <div
        role="progressbar"
        aria-label="Spend against cap"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="bg-paper h-3 overflow-hidden rounded-full"
      >
        <div className="bg-brand h-full" style={{ width: `${pct}%` }} />
      </div>
      <section className="panel space-y-3 p-6">
        <h2>By model</h2>
        <ul className="space-y-2">
          {spend.byModel.map(([model, usd]) => (
            <li key={model} className="flex justify-between gap-4 text-sm">
              <span className="break-all">{model}</span>
              <span>${usd.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel space-y-3 p-6">
        <h2>By feature</h2>
        <ul className="space-y-2">
          {spend.byTask.map(([task, usd]) => (
            <li key={task} className="flex justify-between gap-4 text-sm">
              <span className="break-all">{task}</span>
              <span>${usd.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
