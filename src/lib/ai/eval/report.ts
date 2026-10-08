import { mkdirSync, writeFileSync } from "node:fs";
import type { z } from "zod";
import type { MARKER } from "@/lib/marking/engine";
import type { JUDGE, JudgeSchema } from "./judge";
import { type scoreItem, summarise } from "./metrics";

export type Row = {
  id: string;
  section: string;
  label: string;
  marks: number | null;
  expected: number | number[];
  mark: number | null;
  band: string | null;
  delta: number | null;
  flags: {
    excluded?: string;
    validated?: boolean;
    inRange?: boolean;
    lowConfidence?: boolean;
  };
  usd: number;
  judgeUsd: number;
  seconds: number;
  verdict: z.infer<typeof JudgeSchema> | null;
  feedback: string | null;
  error: string | null;
  score?: ReturnType<typeof scoreItem>;
};
export function writeResults(
  meta: {
    stamp: string;
    git: string;
    dirty: boolean;
    label: string;
    limit: number | null;
    marker: typeof MARKER;
    judge: typeof JUDGE;
    spentBefore: number;
    spentAfter: number;
    blocked: boolean;
  },
  rows: Row[],
) {
  const out = "/workspace/claro/eval-runs";
  const headline = summarise(
    rows.flatMap((r) =>
      r.section === "A1" && !r.flags.excluded && !r.error && r.score
        ? [{ ...r, score: r.score }]
        : [],
    ),
  );
  const claroRows = rows.filter((r) => r.section === "Claro");
  const successfulChecks = claroRows.filter((r) => !r.error && r.mark !== null);
  const results = new URL("./results/", import.meta.url);
  mkdirSync(results, { recursive: true });
  writeFileSync(
    new URL(`${meta.stamp}.json`, results),
    JSON.stringify({ meta, headline, items: rows }, null, 2) + "\n",
  );
  const fmt = (n: number | null, digits = 2) =>
    n === null ? "—" : n.toFixed(digits);
  const pct = (n: number | null) =>
    n === null ? "—" : `${(n * 100).toFixed(1)}%`;
  const table = (headers: string[], data: (string | number | null)[][]) =>
    [headers, headers.map(() => "---"), ...data]
      .map(
        (cells) =>
          `| ${cells
            .map((c) =>
              String(c ?? "—")
                .replace(/\|/g, "\\|")
                .replace(/\r?\n/g, "<br>"),
            )
            .join(" | ")} |`,
      )
      .join("\n");
  const judgeUsd = rows.reduce((sum, r) => sum + r.judgeUsd, 0);
  const head = table(
    [
      "n",
      "Exact",
      "Within-1",
      "Band",
      "Mean signed (+ = lenient)",
      "Mean |Δ|",
      "Pros kept",
      "Cons fixed",
      "Judge mean",
      "Marking $/answer",
      "Judge $ total",
      "s/answer",
    ],
    [
      [
        headline.n,
        pct(headline.exact),
        pct(headline.within1),
        pct(headline.band),
        fmt(headline.meanSigned),
        fmt(headline.meanAbs),
        pct(headline.prosKept),
        pct(headline.consFixed),
        fmt(headline.judgeMean),
        fmt(headline.usdPerAnswer, 4),
        fmt(judgeUsd, 4),
        fmt(headline.secondsPerAnswer),
      ],
    ],
  );
  const checksSummary = `${successfulChecks.filter((r) => r.flags.inRange).length}/${successfulChecks.length} in range; ${claroRows.filter((r) => r.error).length} errors. $/answer: ${fmt(successfulChecks.length ? successfulChecks.reduce((s, r) => s + r.usd, 0) / successfulChecks.length : null, 4)}; s/answer: ${fmt(successfulChecks.length ? successfulChecks.reduce((s, r) => s + r.seconds, 0) / successfulChecks.length : null)}.`;
  const ratio = (values: boolean[] | undefined) =>
    values ? `${values.filter(Boolean).length}/${values.length}` : "—";
  const markdown =
    [
      `# Marking eval ${meta.stamp} (Sydney)`,
      `Label: ${meta.label || "—"}. Git: ${meta.git}${meta.dirty ? " (dirty)" : ""}. Marker: ${meta.marker.model}/${meta.marker.effort} (priority). Judge: ${meta.judge.model}/${meta.judge.effort}.`,
      "## A1 headline",
      head,
      "## Excluded",
      table(
        ["Question", "Reason", "Karan", "Mark", "Δ", "Band", "Judge", "Error"],
        rows
          .filter((r) => r.flags.excluded)
          .map((r) => [
            r.id,
            r.flags.excluded!,
            String(r.expected),
            r.mark,
            r.delta,
            r.score?.band ? "✓" : "—",
            r.verdict?.score ?? null,
            r.error,
          ]),
      ),
      "## A1 items",
      table(
        [
          "Question",
          "Marks",
          "Karan",
          "Mark",
          "Δ",
          "Band ✓",
          "Pros x/y",
          "Cons x/y",
          "Judge",
          "$",
          "s",
        ],
        rows
          .filter((r) => r.section === "A1")
          .map((r) => [
            r.id,
            r.marks,
            String(r.expected),
            r.mark,
            r.delta,
            r.score?.band ? "✓" : "—",
            ratio(r.verdict?.pros.map((p) => p.delivered)),
            ratio(r.verdict?.cons.map((c) => c.fixed)),
            r.verdict?.score ?? null,
            fmt(r.usd, 4),
            fmt(r.seconds),
          ]),
      ),
      "## Claro check",
      table(
        ["Question", "Label", "Expected", "Mark", "In range", "$", "s"],
        claroRows.map((r) => [
          r.id,
          r.label,
          (r.expected as number[]).join("–"),
          r.mark,
          r.error ? "Error" : r.flags.inRange ? "✓" : "✗",
          fmt(r.usd, 4),
          fmt(r.seconds),
        ]),
      ),
      checksSummary,
      ...rows
        .filter((r) => r.error)
        .map((r) => `Error ${r.id} (${r.label}): ${r.error}`),
      `Total eval spend for the run: $${fmt(meta.spentAfter - meta.spentBefore, 4)} (marking $${fmt(
        rows.reduce((s, r) => s + r.usd, 0),
        4,
      )}, judge $${fmt(judgeUsd, 4)}).${meta.blocked ? " Stopped at the eval budget limit." : ""}`,
    ].join("\n\n") + "\n";
  writeFileSync(`${out}/${meta.stamp}.md`, markdown);
  console.log(
    `A1 headline\n${head}\n\nClaro: ${checksSummary}\n${out}/${meta.stamp}.md`,
  );
}
