import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
const out = (k, ok, msg) => console.log(`${ok ? "PASS" : "FAIL"} ${k}: ${msg}`);
// Supabase REST/auth
try {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const r = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: key },
  });
  const sb = createClient(url, key);
  const { error } = await sb.auth.getSession();
  out(
    "supabase",
    r.ok && !error,
    `auth settings HTTP ${r.status}${error ? " / " + error.message : ""}, host ${new URL(url).host.split(".")[0].slice(0, 4)}…`,
  );
} catch (e) {
  out("supabase", false, e.message);
}
// Postgres
try {
  const sql = postgres(process.env.DATABASE_URL, {
    prepare: false,
    max: 1,
    connect_timeout: 10,
  });
  const [r] =
    await sql`select current_database() db, split_part(version(), ' ', 2) v, (select count(*) from information_schema.tables where table_schema='public')::int public_tables`;
  out(
    "postgres",
    true,
    `db=${r.db} pg=${r.v} public_tables=${r.public_tables}`,
  );
  await sql.end();
} catch (e) {
  out("postgres", false, e.message);
}
// OpenAI
try {
  const ai = new OpenAI();
  const m = await ai.models.list();
  const ids = m.data.map((x) => x.id);
  const r = await ai.chat.completions.create({
    model: ids.includes("gpt-4o-mini")
      ? "gpt-4o-mini"
      : ids.find((i) => i.startsWith("gpt")),
    messages: [{ role: "user", content: "Reply with the single word: pong" }],
    max_tokens: 5,
  });
  out(
    "openai",
    true,
    `${ids.length} models visible; reply "${r.choices[0].message.content.trim()}" from ${r.model}`,
  );
} catch (e) {
  out("openai", false, `${e.status ?? ""} ${e.message}`);
}
