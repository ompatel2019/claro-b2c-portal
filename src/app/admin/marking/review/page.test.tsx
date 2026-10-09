import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/marking/review",
}));
vi.mock("next/form", () => ({
  default: (props: React.ComponentProps<"form">) => <form {...props} />,
}));
vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn() }));
vi.mock("./actions", () => ({
  addSpotChecks: vi.fn(),
  retryMarking: vi.fn(),
  markManually: vi.fn(),
}));
vi.mock("./data", () => ({ loadQueue: vi.fn() }));
import { loadQueue, type QueueRow } from "./data";
import ReviewQueue from "./page";
afterEach(cleanup);

const now = Date.parse("2026-10-09T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();
const base: QueueRow = {
  id: "r1",
  attemptId: "a1",
  userId: "u1",
  name: "Priya Sharma",
  created: hoursAgo(2),
  reason: "check_disagreed",
  source: "2023 HSC Q24",
  stem: "A".repeat(70),
  type: "short",
  topic: "t3-inflation",
  marks: 4,
  ai: 3,
  check: 4,
  note: null,
  photos: [],
};
const rows: QueueRow[] = [
  base,
  {
    ...base,
    id: "r2",
    name: "Sam Lee",
    created: hoursAgo(30),
    reason: "student_dispute",
    type: "extended",
    topic: "t2-growth",
    marks: 8,
    check: null,
    note: "Please look again at my second paragraph.",
  },
  {
    ...base,
    id: "r3",
    name: "Alex Kim",
    created: hoursAgo(100),
    reason: "spot_check",
    topic: null,
    marks: 6,
  },
];
const topics = [
  { id: "t3", parent_id: null, name: "Inflation" },
  { id: "t3-inflation", parent_id: "t3", name: "Causes" },
  { id: "t2", parent_id: null, name: "Growth" },
  { id: "t2-growth", parent_id: "t2", name: "Measuring" },
];
async function show(params: Record<string, string>, failed = false) {
  vi.mocked(loadQueue).mockResolvedValue({
    rows: failed
      ? rows.map((r) => ({ ...r, reason: "failed" as const }))
      : rows,
    topics,
    counts: [3, 1, 2],
    now,
  });
  render(await ReviewQueue({ searchParams: Promise.resolve(params) }));
  return screen
    .queryAllByRole("row")
    .slice(1)
    .map((r) => within(r).getAllByRole("cell")[2].textContent);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now, toFake: ["Date"] });
});
afterEach(() => vi.useRealTimers());

it("shows the open queue with counts, reason pills and a 60-char stem", async () => {
  const names = await show({});
  expect(names).toEqual(["Priya Sharma", "Sam Lee", "Alex Kim"]);
  expect(loadQueue).toHaveBeenCalledWith("open");
  const tabs = screen.getByRole("navigation", { name: "Review queues" });
  expect(tabs.querySelector("[aria-current=page]")?.textContent).toBe(
    "Open (3)",
  );
  expect(
    within(tabs).getByRole("link", { name: "Failed & unreadable (1)" }),
  ).toHaveAttribute("href", "?tab=failed");
  const first = screen.getAllByRole("row")[1];
  expect(within(first).getByText("Checker disagreed")).toBeTruthy();
  expect(within(first).getByText(`${"A".repeat(60)}…`)).toBeTruthy();
  expect(
    within(first).getByRole("link", { name: "Priya Sharma" }),
  ).toHaveAttribute("href", "/admin/students/u1");
  expect(
    within(first)
      .getAllByRole("cell")
      .map((c) => c.textContent),
  ).toEqual([
    "2 h",
    "Checker disagreed",
    "Priya Sharma",
    `2023 HSC Q24${"A".repeat(60)}…`,
    "3",
    "4",
    "1",
    "—",
  ]);
  expect(screen.getByText("1 days")).toBeTruthy();
  expect(screen.getByText(/^Please look again at my second/)).toBeTruthy();
});

it.each([
  [{ reason: "spot_check" }, ["Alex Kim"]],
  [{ type: "extended" }, ["Sam Lee"]],
  [{ topic: "t3" }, ["Priya Sharma"]],
  [{ topic: "t2-growth" }, ["Sam Lee"]],
  [{ marks: "6" }, ["Alex Kim"]],
  [{ age: "24h" }, ["Sam Lee", "Alex Kim"]],
  [{ age: "3d" }, ["Alex Kim"]],
  [{ reason: "spot_check", type: "extended" }, []],
])("filters the queue by %j", async (params, expected) => {
  expect(await show(params)).toEqual(expected);
  if (!expected.length) {
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("No matching reviews")).toBeTruthy();
  }
});

it("failed tab ignores the reason filter, keeps the tab on apply/clear, and offers manual marking actions", async () => {
  const names = await show(
    { tab: "failed", reason: "spot_check", type: "short" },
    true,
  );
  expect(loadQueue).toHaveBeenCalledWith("failed");
  expect(names).toEqual(["Priya Sharma", "Alex Kim"]);
  expect(screen.queryByLabelText("Reason")).toBeNull();
  // No "View" select: the tab travels as a hidden field and survives Clear.
  expect(screen.queryByLabelText("View")).toBeNull();
  expect(
    (document.querySelector('input[name="tab"]') as HTMLInputElement).value,
  ).toBe("failed");
  expect(screen.getByRole("link", { name: "Clear (1)" })).toHaveAttribute(
    "href",
    "/admin/marking/review?tab=failed",
  );
  expect(screen.getAllByText("Couldn't mark")).toHaveLength(2);
  expect(screen.getAllByRole("button", { name: "Retry marking" })).toHaveLength(
    2,
  );
  expect(screen.getAllByRole("button", { name: "Mark manually" })).toHaveLength(
    2,
  );
  expect(screen.queryByRole("link", { name: "2 h" })).toBeNull();
});
