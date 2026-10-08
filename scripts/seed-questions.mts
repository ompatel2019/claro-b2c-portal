// Extract NESA HSC Economics past-paper questions + marking guidelines into `questions`.
// Input: pdftotext -layout output in $NESA_DIR/<year>.txt and <year>-mg.txt (papers from the NESA HSC exam papers page).
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/seed-questions.mts 2019 2020 ...
import { readFileSync } from "node:fs";

import { z } from "zod";

import { callJson } from "@/lib/ai/openai";
import { MODELS } from "@/lib/ai/prices";
import { admin } from "@/utils/supabase/admin";

const dir = process.env.NESA_DIR ?? "/workspace/claro/nesa";
const years = process.argv.slice(2).map(Number);

const { data: topics } = await admin()
  .from("topics")
  .select("id, name")
  .not("parent_id", "is", null);
const topicIds = topics!.map((t) => t.id) as [string, ...string[]];
const topicList = topics!.map((t) => `${t.id}: ${t.name}`).join("\n");

const Extracted = z.object({
  questions: z.array(
    z.object({
      number: z
        .string()
        .describe('Question number as printed, e.g. "7", "21(a)(i)", "25"'),
      figure_required: z.boolean(),
      topic_id: z.enum(topicIds),
      marks: z.number().int(),
      stem: z.string(),
      stimulus: z
        .string()
        .nullable()
        .describe(
          "Shared or question-specific source material, tables as markdown; null if none",
        ),
      options: z
        .array(z.string())
        .nullable()
        .describe("MCQ only: the four options A-D without the letter"),
      answer: z
        .enum(["A", "B", "C", "D"])
        .nullable()
        .describe("MCQ only: from the answer key"),
      criteria: z
        .array(
          z.object({
            min: z.number().int(),
            max: z.number().int(),
            descriptor: z.string(),
          }),
        )
        .nullable(),
      guideline_notes: z.string().nullable(),
      sample_answer: z.string().nullable(),
    }),
  ),
});

const rules = (
  section: string,
) => `You convert a NESA HSC Economics exam paper and its official marking guidelines into structured data. ${section}
Rules:
- Copy question wording, options, criteria and sample answers faithfully from the documents (fix only PDF line-wrap/spacing artefacts). Never invent content.
- Each separately marked part is its own item, e.g. 21(a)(i), 21(a)(ii), 21(b). Include any shared stimulus/introductory text (e.g. "Use the table to answer...") in every part's stimulus, rendering tables as markdown tables.
- criteria: one entry per mark band, highest first; single marks have min = max (e.g. 3-mark band: {min:3,max:3}); range bands like 17–20 have min 17, max 20. When the guideline lists alternatives for the same mark joined by OR, combine them into ONE descriptor joined with " OR ". Multiple bullet points in one band are joined with "; ".
- guideline_notes: "Answers could include" lists and any marker notes, else null. sample_answer: the guideline's sample answer if given, else null.
- figure_required: true ONLY when a correct answer depends on a visual that cannot be reproduced as text or a markdown table (e.g. reading values off a graph or diagram, a cartoon that is the whole stimulus). When a visual is supplementary (e.g. an extended response whose text stimulus and own knowledge suffice), set false and describe the visual briefly in stimulus as "[Figure: title, axes/what it shows, source]" using only what the document text shows.
- topic_id: the best-matching HSC syllabus subtopic from this list:\n${topicList}`;

async function extract(year: number, section: "mcq" | "written") {
  const paper = readFileSync(`${dir}/${year}.txt`, "utf8");
  const mg = readFileSync(`${dir}/${year}-mg.txt`, "utf8");
  const scope =
    section === "mcq"
      ? "Extract ONLY Section I (multiple-choice Questions 1–20). criteria, guideline_notes and sample_answer are null; answer comes from the answer key."
      : "Extract ONLY Sections II, III and IV (Question 21 onwards: short-answer parts and the extended responses Q25–Q28). options and answer are null.";
  const { questions } = await callJson({
    task: `seed-extract-${section}`,
    model: MODELS.strong,
    schema: Extracted,
    effort: "low",
    timeoutMs: 600_000,
    messages: [
      { role: "system", content: rules(scope) },
      {
        role: "user",
        content: `=== ${year} HSC ECONOMICS PAPER ===\n${paper}\n\n=== ${year} MARKING GUIDELINES ===\n${mg}`,
      },
    ],
  });
  return questions;
}

const slug = (n: string) =>
  n
    .toLowerCase()
    .replace(/\)\(/g, "-")
    .replace(/[()]/g, "")
    .replace(/^(\d)$/, "0$1");

for (const year of years) {
  const [mcq, written] = await Promise.all([
    extract(year, "mcq"),
    extract(year, "written"),
  ]);
  // Cross-check MCQ answers against the official key; multi-answer or unreadable keys are skipped.
  const mg = readFileSync(`${dir}/${year}-mg.txt`, "utf8");
  const key = new Map(
    [
      ...mg
        .slice(0, mg.indexOf("Section II"))
        .matchAll(/^\s*(\d{1,2})\s+([ABCD])\s*$/gm),
    ].map((m) => [m[1], m[2]]),
  );
  const rows = [];
  const skipped: string[] = [];
  for (const q of [...mcq, ...written]) {
    const isMcq = q.options !== null;
    const id = `${year}-q${slug(q.number.replace(/\s/g, ""))}`;
    const bad =
      q.stem.trim().length < 15 ||
      (isMcq
        ? q.options!.length !== 4 || key.get(q.number) !== q.answer
        : !q.criteria?.length);
    if (q.figure_required || bad) {
      skipped.push(
        `${q.number}${q.figure_required ? " (figure)" : " (incomplete)"}`,
      );
      continue;
    }
    const top = Number(q.number.match(/^\d+/)?.[0]);
    rows.push({
      id,
      type: isMcq ? "mcq" : top >= 25 ? "extended" : "short",
      topic_id: q.topic_id,
      marks: isMcq ? 1 : q.marks,
      stem: q.stem,
      stimulus: q.stimulus,
      options: q.options,
      correct_index: isMcq ? "ABCD".indexOf(q.answer!) : null,
      criteria: q.criteria,
      guideline_notes: q.guideline_notes,
      sample_answer: q.sample_answer,
      source: `${year} HSC Q${q.number.replace(/\s/g, "")}`,
      year,
    });
  }
  const { error } = await admin().from("questions").upsert(rows);
  if (error) throw new Error(`${year}: ${error.message}`);
  console.log(
    `${year}: ${rows.length} upserted (mcq ${rows.filter((r) => r.type === "mcq").length}, short ${rows.filter((r) => r.type === "short").length}, extended ${rows.filter((r) => r.type === "extended").length}); skipped: ${skipped.join(", ") || "none"}`,
  );
}
