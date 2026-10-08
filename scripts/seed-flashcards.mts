// Seed the flashcard deck: core HSC Economics terms per syllabus subtopic (cheap model, cost logged)
// plus key statistics from scripts/stats.json (figures checked against ABS/RBA/Treasury releases).
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/seed-flashcards.mts
import { readFileSync } from "node:fs";

import { z } from "zod";

import { callJson } from "@/lib/ai/openai";
import { MODELS } from "@/lib/ai/prices";
import { admin } from "@/utils/supabase/admin";

const { data: subtopics } = await admin()
  .from("topics")
  .select("id, name, parent:parent_id(name)")
  .not("parent_id", "is", null)
  .order("id");
const Terms = z.object({
  cards: z.array(z.object({ term: z.string(), definition: z.string() })),
});
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const generated = await Promise.all(
  subtopics!.map(async (t) => {
    const { cards } = await callJson({
      task: "seed-flashcards",
      model: MODELS.cheap,
      schema: Terms,
      effort: "medium",
      messages: [
        {
          role: "system",
          content:
            "You write flashcards for NSW HSC Economics (Stage 6 syllabus). Give the core terms a Band 6 student must define for the subtopic, each with an accurate, concise definition (one sentence, at most 30 words, Australian English, no examples of specific years or statistics, no em dashes). Use standard textbook definitions consistent with the RBA, ABS and NESA glossary.",
        },
        {
          role: "user",
          content: `Topic: ${(t.parent as unknown as { name: string }).name}\nSubtopic: ${t.name}\nGive 5 to 7 terms.`,
        },
      ],
    });
    return cards.map((c) => ({
      id: slug(c.term),
      topic_id: t.id,
      kind: "term",
      front: c.term,
      back: c.definition,
    }));
  }),
);
const stats = JSON.parse(
  readFileSync(new URL("./stats.json", import.meta.url), "utf8"),
) as { topic_id: string; front: string; back: string }[];
const rows = new Map<string, Record<string, string>>();
for (const r of generated.flat()) if (!rows.has(r.id)) rows.set(r.id, r);
for (const s of stats)
  rows.set(`stat-${slug(s.front)}`, {
    id: `stat-${slug(s.front)}`,
    kind: "stat",
    ...s,
  });
const { error } = await admin()
  .from("flashcards")
  .upsert([...rows.values()]);
if (error) throw error;
console.log(`${rows.size} flashcards upserted (${stats.length} stats)`);
