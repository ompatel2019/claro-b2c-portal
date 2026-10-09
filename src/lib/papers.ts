import { timer } from "./practice";

export type Paper = {
  id: string;
  title: string;
  year: number | null;
  origin: "nesa" | "a1" | "claro";
  time_limit_min: number;
  total_marks: number;
};

export type PaperSit = {
  id: string;
  paper_id: string;
  started_at: string;
  finished_at: string | null;
  config: { time_limit_min?: number; reading_min?: number };
  score: number | null;
  max_score: number | null;
};

export type PaperFilters = { source?: string; status?: string };

/** Derive list state on the server from persisted sits, never from elapsed_s.
 * An unfinished sit takes priority, even after its deadline: the runner submits it.
 */
export function paperRows(
  papers: Paper[],
  sits: PaperSit[],
  filters: PaperFilters,
  now: number,
) {
  return papers
    .map((paper) => {
      const history = sits
        .filter((sit) => sit.paper_id === paper.id)
        .sort((a, b) => b.started_at.localeCompare(a.started_at));
      const finished = history.filter((sit) => sit.finished_at !== null);
      const open = history.find((sit) => sit.finished_at === null);
      const latest = finished[0];
      const status = open ? "in-progress" : latest ? "finished" : "not-started";
      const scorePercentage =
        latest?.score != null &&
        latest.max_score != null &&
        latest.max_score > 0
          ? (latest.score / latest.max_score) * 100
          : null;
      const href = `/student/papers/${paper.id}`;
      let statusLabel = "Not started";
      if (open) {
        const deadline =
          Date.parse(open.started_at) +
          ((open.config.time_limit_min ?? paper.time_limit_min) +
            (open.config.reading_min ?? 0)) *
            60_000;
        const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
        statusLabel = `${timer(seconds)} left`;
      } else if (latest) {
        statusLabel =
          scorePercentage !== null
            ? `Finished · ${latest.score} / ${latest.max_score}`
            : "Finished · Marking";
      }
      const percentages = finished.flatMap((sit) =>
        sit.score !== null && sit.max_score !== null && sit.max_score > 0
          ? [(sit.score / sit.max_score) * 100]
          : [],
      );
      return {
        ...paper,
        status,
        statusLabel,
        scorePercentage: open ? null : scorePercentage,
        best:
          finished.length > 1 && percentages.length
            ? `Best ${Math.round(Math.max(...percentages))}%`
            : null,
        actions: open
          ? [{ label: "Continue", href }]
          : latest
            ? [
                {
                  label: "View results",
                  href: `${href}/results?sit=${latest.id}`,
                },
                { label: "Sit again", href },
              ]
            : [{ label: "Start", href }],
      };
    })
    .filter((paper) => {
      const category =
        paper.origin === "nesa"
          ? "hsc"
          : paper.origin === "a1"
            ? "trial"
            : null;
      return (
        (!filters.source || category === filters.source) &&
        (!filters.status || paper.status === filters.status)
      );
    });
}

export const paperSourceOptions = [
  { value: "hsc", label: "HSC" },
  { value: "trial", label: "Trial" },
];
export const paperStatusOptions = [
  { value: "not-started", label: "Not started" },
  { value: "in-progress", label: "In progress" },
  { value: "finished", label: "Finished" },
];
