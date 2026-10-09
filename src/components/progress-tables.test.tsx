import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  ProgressScore,
  TopicProgressTable,
  VerbProgressTable,
} from "./progress-tables";
import { SessionScoreTrend } from "./score-trend";
import type { TopicProgress } from "@/lib/progress";
const navigation = vi.hoisted(() => ({ query: "range=90", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.query),
  usePathname: () => "/student/progress",
  useRouter: () => ({ replace: navigation.replace }),
}));
beforeEach(() => {
  navigation.query = "range=90";
  navigation.replace.mockImplementation((url: string) => {
    navigation.query = url.split("?")[1] ?? "";
  });
});
afterEach(cleanup);
const rows: TopicProgress[] = [
  {
    id: "t3",
    parent_id: null,
    name: "Economic Issues",
    sort: 3,
    answered: 3,
    earned: 4,
    possible: 10,
    pct: 40,
    last_answered: "2026-10-09",
  },
  {
    id: "t3-inflation",
    parent_id: "t3",
    name: "Inflation",
    sort: 1,
    answered: 3,
    earned: 4,
    possible: 10,
    pct: 40,
    last_answered: "2026-10-09",
  },
  {
    id: "t3-unemployment",
    parent_id: "t3",
    name: "Unemployment",
    sort: 2,
    answered: 0,
    earned: 0,
    possible: 0,
    pct: null,
    last_answered: null,
  },
];
it("expands a parent, shows untouched topics and sorts children locally", () => {
  const view = render(<TopicProgressTable rows={rows} />);
  expect(screen.queryByText("Inflation")).toBeNull();
  expect(
    screen.getByText(/3 answered · 4 \/ 10 marks · Last practised/),
  ).toHaveTextContent("Fri 9 Oct");
  fireEvent.click(screen.getByRole("button", { name: "Economic Issues" }));
  expect(
    screen.getByRole("button", { name: "Economic Issues" }),
  ).toHaveAttribute("aria-expanded", "true");
  const table = screen.getByRole("table", {
    name: "Economic Issues subtopics",
  });
  expect(
    within(table).getByRole("link", { name: "Start Unemployment" }),
  ).toHaveAttribute("href", "/student/sprint?topics=t3&sub=t3-unemployment");
  expect(
    within(table).getByRole("link", { name: "Practise Inflation" }),
  ).toHaveAttribute("href", "/student/sprint?topics=t3&sub=t3-inflation");
  expect(
    within(table).getByText(/3 answered · 4 \/ 10 marks · Last practised/),
  ).toHaveTextContent("Fri 9 Oct");
  expect(
    within(table).getByText(/0 answered · 0 \/ 0 marks · Last practised/),
  ).toHaveTextContent("Not started");
  fireEvent.click(within(table).getByRole("button", { name: "Topic" }));
  view.rerender(<TopicProgressTable rows={rows} />);
  fireEvent.click(within(table).getByRole("button", { name: "Topic" }));
  view.rerender(<TopicProgressTable rows={rows} />);
  expect(navigation.query).toBe("range=90&topicsSort=name%3Adesc");
  expect(within(table).getAllByRole("row")[1]).toHaveTextContent(
    "Unemployment",
  );
  fireEvent.click(screen.getByRole("button", { name: "Economic Issues" }));
  expect(
    screen.queryByRole("table", { name: "Economic Issues subtopics" }),
  ).toBeNull();
});
it("gives the weakest eligible verb a working setup link", () => {
  render(
    <VerbProgressTable
      rows={[
        { id: "Discuss", answered: 4, pct: 70 },
        { id: "Analyse", answered: 3, pct: 30 },
        { id: "Explain", answered: 2, pct: 0 },
      ]}
    />,
  );
  expect(screen.queryByText("Explain")).toBeNull();
  expect(screen.getByRole("link", { name: "Practise" })).toHaveAttribute(
    "href",
    "/student/sprint?type=short&verb=Analyse",
  );
});
it.each([
  [49, "Needs practice"],
  [50, "Building"],
  [75, "Strong"],
] as const)("prints %s percent with an icon and word", (pct, word) => {
  const { container } = render(<ProgressScore pct={pct} bar />);
  expect(screen.getByText(`${pct}%`)).toHaveTextContent(word);
  expect(container.querySelector("svg")).not.toBeNull();
});
it("reuses the score plot and links single-answer reports", () => {
  render(
    <SessionScoreTrend
      points={[
        {
          id: "s",
          day: "2026-10-08",
          pct: 80,
          label: "MC sprint · Thu 8 Oct · 80%",
          href: "/student/sprint/s/results",
        },
        {
          id: "a",
          day: "2026-10-09",
          pct: 50,
          label: "Mark my answer · Fri 9 Oct · 50%",
          href: "/student/activity/a",
        },
      ]}
      from="2026-07-12"
      today="2026-10-09"
      range="90"
    />,
  );
  expect(
    screen.getByRole("link", { name: "MC sprint · Thu 8 Oct · 80%" }),
  ).toHaveAttribute("href", "/student/sprint/s/results");
  expect(screen.getAllByRole("link")).toHaveLength(2);
  expect(
    screen.getByRole("link", { name: "Mark my answer · Fri 9 Oct · 50%" }),
  ).toHaveAttribute("href", "/student/activity/a");
});

it("positions sessions by finish time, including distinct sessions on one Sydney day", () => {
  const { container } = render(
    <SessionScoreTrend
      points={[
        {
          id: "a",
          day: "2026-10-09",
          at: "2026-10-09T00:00:00Z",
          pct: 50,
          label: "First",
          href: null,
        },
        {
          id: "b",
          day: "2026-10-09",
          at: "2026-10-09T01:00:00Z",
          pct: 60,
          label: "Second",
          href: null,
        },
        {
          id: "c",
          day: "2026-10-09",
          at: "2026-10-09T10:00:00Z",
          pct: 70,
          label: "Third",
          href: null,
        },
      ]}
      from="2026-07-12"
      today="2026-10-09"
      range="90"
    />,
  );
  const positions = Array.from(
    container.querySelectorAll('circle[r="4"]'),
    (c) => Number(c.getAttribute("cx")),
  );
  expect(
    (positions[1] - positions[0]) / (positions[2] - positions[0]),
  ).toBeCloseTo(0.1);
});
