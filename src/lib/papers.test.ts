import { describe, expect, it } from "vitest";
import {
  paperRows,
  studentPaperFilter,
  type Paper,
  type PaperSit,
} from "./papers";

it("limits student queries (including admins) to live papers or their listed drafts", () => {
  const userId = "12345678-1234-1234-1234-123456789abc";
  expect(studentPaperFilter(userId)).toBe(
    `status.eq.live,and(status.eq.draft,preview_user_ids.cs.{${userId}})`,
  );
});

const now = Date.parse("2026-10-09T02:00:00Z");
const paper: Paper = {
  id: "paper-1",
  title: "2025 HSC",
  year: 2025,
  origin: "nesa",
  time_limit_min: 180,
  total_marks: 100,
};
const sit: PaperSit = {
  id: "sit-1",
  paper_id: paper.id,
  started_at: "2026-10-09T00:00:00Z",
  finished_at: "2026-10-09T01:00:00Z",
  config: { time_limit_min: 180, reading_min: 5 },
  score: 72,
  max_score: 100,
};
const rows = (sits: PaperSit[] = []) => paperRows([paper], sits, {}, now);

describe("paper list state", () => {
  it("renders an empty list", () => {
    expect(paperRows([], [sit], {}, now)).toEqual([]);
  });
  it("offers Start when not started and ignores other papers' sits", () => {
    const [row] = rows([{ ...sit, paper_id: "other" }]);
    expect(row.status).toBe("not-started");
    expect(row.statusLabel).toBe("Not started");
    expect(row.best).toBeNull();
    expect(row.actions).toEqual([
      { label: "Start", href: "/student/papers/paper-1" },
    ]);
  });
  it("uses the snapshotted limit plus reading time for Continue", () => {
    const [row] = rows([
      {
        ...sit,
        finished_at: null,
        config: { time_limit_min: 177, reading_min: 5 },
        started_at: "2026-10-09T01:00:10Z",
      },
    ]);
    expect(row.status).toBe("in-progress");
    expect(row.statusLabel).toBe("2:02:10 left");
    expect(row.actions).toEqual([
      { label: "Continue", href: "/student/papers/paper-1" },
    ]);
  });
  it("formats the spec's countdown with reading disabled", () => {
    expect(
      rows([
        {
          ...sit,
          finished_at: null,
          config: { time_limit_min: 122, reading_min: 0 },
          started_at: "2026-10-09T01:00:10Z",
        },
      ])[0].statusLabel,
    ).toBe("1:02:10 left");
  });
  it("falls back for legacy config and clamps expired sits at zero", () => {
    expect(
      rows([{ ...sit, finished_at: null, config: {} }])[0].statusLabel,
    ).toBe("1:00:00 left");
    const expired = rows([
      { ...sit, finished_at: null, config: { time_limit_min: 60 } },
    ])[0];
    expect(expired.statusLabel).toBe("0:00 left");
    expect(expired.status).toBe("in-progress");
    expect(expired.actions[0].label).toBe("Continue");
  });
  it("uses the latest unfinished sit even if a later sit finished", () => {
    const [row] = rows([
      { ...sit, id: "open-old", finished_at: null },
      {
        ...sit,
        id: "open-new",
        finished_at: null,
        started_at: "2026-10-09T01:00:00Z",
      },
      { ...sit, id: "done", started_at: "2026-10-09T01:30:00Z" },
    ]);
    expect(row.statusLabel).toBe("2:05:00 left");
    expect(row.actions[0].label).toBe("Continue");
  });
  it("shows the finished score and links results to the latest sit plus Sit again", () => {
    const [row] = rows([sit]);
    expect(row.status).toBe("finished");
    expect(row.statusLabel).toBe("Finished · 72 / 100");
    expect(row.best).toBeNull();
    expect(row.scorePercentage).toBe(72);
    expect(row.actions).toEqual([
      {
        label: "View results",
        href: "/student/papers/paper-1/results?sit=sit-1",
      },
      { label: "Sit again", href: "/student/papers/paper-1" },
    ]);
  });
  it("shows latest score and best percentage across completed re-sits, regardless of order", () => {
    const [row] = rows([
      { ...sit, score: 39, max_score: 50 },
      { ...sit, id: "latest", started_at: "2026-10-09T01:00:00Z", score: 71.5 },
    ]);
    expect(row.statusLabel).toBe("Finished · 71.5 / 100");
    expect(row.best).toBe("Best 78%");
    expect(row.actions[0].href).toContain("sit=latest");
  });
  it("keeps best completed score while a third sit is open", () => {
    expect(
      rows([
        sit,
        { ...sit, id: "second", score: 78 },
        { ...sit, id: "third", finished_at: null, score: 99 },
      ])[0].best,
    ).toBe("Best 78%");
  });
  it("does not show Best for one finished sit and an unfinished re-sit", () => {
    expect(rows([sit, { ...sit, finished_at: null }])[0].best).toBeNull();
  });
  it.each([
    { score: null, max_score: 100 },
    { score: 72, max_score: null },
    { score: null, max_score: null },
    { score: 0, max_score: 0 },
  ])("handles marks not yet available: %j", (scores) => {
    const [row] = rows([{ ...sit, ...scores }]);
    expect(row.statusLabel).toBe("Finished · Marking");
    expect(row.best).toBeNull();
    expect(row.actions[0].label).toBe("View results");
  });
  it("treats zero as a score and excludes unmarked scores from best", () => {
    expect(rows([{ ...sit, score: 0 }])[0].statusLabel).toBe(
      "Finished · 0 / 100",
    );
    expect(rows([sit, { ...sit, score: null }])[0].best).toBe("Best 72%");
    expect(
      rows([
        { ...sit, score: null },
        { ...sit, max_score: 0 },
      ])[0].best,
    ).toBeNull();
  });
});

describe("paper filters", () => {
  const papers: Paper[] = [
    paper,
    {
      ...paper,
      id: "trial",
      title: "Trial",
      year: 2026,
      origin: "a1",
    },
    { ...paper, id: "unknown", title: "Claro", year: null, origin: "claro" },
  ];
  const sits = [sit, { ...sit, paper_id: "trial", finished_at: null }];
  it.each([
    [{ source: "hsc" }, [paper.id]],
    [{ source: "trial" }, ["trial"]],
    [{ status: "not-started" }, ["unknown"]],
    [{ status: "in-progress" }, ["trial"]],
    [{ status: "finished" }, [paper.id]],
    [{ source: "hsc", status: "finished" }, [paper.id]],
    [{ source: "trial", status: "finished" }, []],
    [{ source: "", status: "" }, [paper.id, "trial", "unknown"]],
  ])("applies URL filters %j", (filters, ids) => {
    expect(paperRows(papers, sits, filters, now).map((p) => p.id)).toEqual(ids);
  });
});
