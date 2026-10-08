// Run with Node 22: node --env-file=.env.local scripts/seed-homework.mts
// Uses only existing flashcards and NESA questions. No AI calls.
import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key)
  throw new Error(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY before running the seed.",
  );
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const title = "Topic 3 · Lesson 1: Economic growth";
const { data: existing } = await db
  .from("homework_sets")
  .select("id,published_at")
  .eq("title", title)
  .throwOnError();
if (existing?.some((s) => s.published_at)) {
  console.log(
    "Published economic growth homework already exists. Nothing changed.",
  );
} else {
  const [cards, growthQs, topic3Qs] = await Promise.all([
    db
      .from("flashcards")
      .select("id,topic_id,front")
      .like("topic_id", "t3-growth%")
      .order("id")
      .throwOnError(),
    db
      .from("questions")
      .select("id,type,marks,source,topic_id")
      .like("topic_id", "t3-growth%")
      .order("year", { ascending: false })
      .order("id")
      .throwOnError(),
    db
      .from("questions")
      .select("id,type,marks,source,topic_id")
      .like("topic_id", "t3-%")
      .order("year", { ascending: false })
      .order("id")
      .throwOnError(),
  ]);
  const chosenCards = (cards.data ?? []).slice(0, 14);
  const nesa = (rows: typeof growthQs.data) =>
    (rows ?? []).filter((q) => /nesa|hsc/i.test(q.source));
  const growth = nesa(growthQs.data);
  const topic3 = nesa(topic3Qs.data);
  const mc = growth.filter((q) => q.type === "mcq").slice(0, 2);
  // Prefer growth shorts; fill from other Topic 3 NESA shorts if the bank is thin.
  const shortGrowth = growth.filter((q) => q.type === "short");
  const shortExtra = topic3.filter(
    (q) => q.type === "short" && !shortGrowth.some((g) => g.id === q.id),
  );
  const short = [...shortGrowth, ...shortExtra].slice(0, 3);
  if (chosenCards.length < 8 || mc.length < 2 || short.length < 3)
    throw new Error(
      "Not enough real growth flashcards or NESA questions. Nothing published.",
    );
  // Monday of next calendar week, 5 pm Sydney. Find the offset for that date.
  const now = new Date();
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const p = (key: string) => dateParts.find((part) => part.type === key)!.value;
  const date = new Date(`${p("year")}-${p("month")}-${p("day")}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + ((8 - date.getUTCDay()) % 7 || 7));
  const wall = new Date(`${date.toISOString().slice(0, 10)}T17:00:00Z`);
  const sydneyHour = Number(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Sydney",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(wall),
  );
  const offset = (sydneyHour - 17 + 24) % 24;
  const due_at = new Date(wall.getTime() - offset * 3600000).toISOString();
  const draft = existing?.[0];
  const { data: set } = draft
    ? { data: draft }
    : await db
        .from("homework_sets")
        .insert({ title, topic_id: "t3-growth", due_at })
        .select("id")
        .single()
        .throwOnError();
  const { count: started } = await db
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("homework_set_id", set!.id)
    .throwOnError();
  if (started)
    throw new Error(
      "A student has already started this draft. Its items were not changed.",
    );
  await db.from("homework_items").delete().eq("set_id", set!.id).throwOnError();
  const items = [
    ...chosenCards.map((c) => ({ flashcard_id: c.id, question_id: null })),
    ...mc.concat(short).map((q) => ({ question_id: q.id, flashcard_id: null })),
  ].map((item, i) => ({ ...item, set_id: set!.id, position: i + 1 }));
  await db.from("homework_items").insert(items).throwOnError();
  await db
    .from("homework_sets")
    .update({ due_at, published_at: new Date().toISOString() })
    .eq("id", set!.id)
    .throwOnError();
  console.log(
    `Published "${title}": ${chosenCards.length} flashcards, 2 MCQs, 3 short answers, ${mc.concat(short).reduce((n, q) => n + q.marks, 0)} marks. Due ${due_at}.`,
  );
}
