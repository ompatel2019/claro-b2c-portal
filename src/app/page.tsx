import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("health_check")
    .select("id, message, created_at")
    .order("id");

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 p-8 font-sans">
      <h1 className="text-2xl font-semibold">Claro portal: e2e check</h1>
      {error ? (
        <p className="text-red-600">Supabase error: {error.message}</p>
      ) : (
        <ul className="space-y-2">
          {data?.map((row) => (
            <li key={row.id} className="rounded-lg border p-3">
              <p>{row.message}</p>
              <p className="text-sm opacity-60">
                row {row.id} · {new Date(row.created_at).toISOString()}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm opacity-60">
        Fetched live from the <code>health_check</code> table at{" "}
        {new Date().toISOString()}.
      </p>
    </main>
  );
}
