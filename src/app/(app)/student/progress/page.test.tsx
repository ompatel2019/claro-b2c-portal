import {
  Children,
  isValidElement,
  cloneElement,
  type ReactNode,
  type ReactElement,
} from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ProgressData } from "@/lib/progress";
import Progress from "./page";
import ErrorCard from "./error";
import Loading from "./loading";
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  activity: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  requireProfile: async () => ({ id: "student" }),
}));
vi.mock("@/lib/progress-data", () => ({
  loadProgress: mocks.load,
  loadProgressActivity: mocks.activity,
  progressToday: () => "2026-10-09",
}));
vi.mock("@/components/progress-controls", () => ({
  ProgressControls: () => null,
}));
vi.mock("@/components/activity-heatmap", () => ({
  ActivityHeatmap: ({
    error,
    errorContent,
  }: {
    error: boolean;
    errorContent: ReactNode;
  }) => (error ? errorContent : <p>Year heatmap</p>),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/student/progress",
}));
const empty: ProgressData = {
  stats: { answered: 0, earned: 0, possible: 0, pct: null, active: 0 },
  topics: [
    {
      id: "t1",
      parent_id: null,
      name: "Global economy",
      sort: 1,
      answered: 0,
      earned: 0,
      possible: 0,
      pct: null,
      last_answered: null,
    },
  ],
  types: [],
  verbs: [],
  history: [],
  mastery: [],
  missed: [],
  due: [],
};
// Resolve just async server components; normal client components render with React.
async function resolve(node: ReactNode): Promise<ReactNode> {
  if (!isValidElement(node)) return node;
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (
    typeof element.type === "function" &&
    element.type.constructor.name === "AsyncFunction"
  ) {
    const component = element.type as (props: unknown) => Promise<ReactNode>;
    return resolve(await component(element.props));
  }
  if (element.props.children !== undefined) {
    const children = await Promise.all(
      Children.toArray(element.props.children).map(resolve),
    );
    return cloneElement(element, undefined, ...children);
  }
  return element;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue(empty);
  mocks.activity.mockResolvedValue({
    days: [],
    current_streak: 0,
    longest_streak: 0,
  });
});
afterEach(cleanup);
it("renders range-scoped stats and per-card empty states while keeping untouched topics available", async () => {
  render(
    await resolve(
      await Progress({ searchParams: Promise.resolve({ range: "year" }) }),
    ),
  );
  expect(mocks.load).toHaveBeenCalledWith("year", "2026-10-09");
  expect(
    screen.getByText("Finish a sprint to see marks by topic."),
  ).toBeInTheDocument();
  expect(screen.getByText("No scores in this range")).toBeInTheDocument();
  expect(screen.getByText("By question type")).toBeInTheDocument();
  expect(screen.getByText("By directive verb")).toBeInTheDocument();
  expect(screen.getByText("Weak spots")).toBeInTheDocument();
  expect(screen.getByText("Flashcard mastery")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Start Global economy" }),
  ).toHaveAttribute("href", "/student/sprint?topics=t1");
  expect(screen.getByTestId("progress-stats")).toHaveAttribute(
    "data-range",
    "year",
  );
});
it("isolates load failures in cards and retries through the router", async () => {
  mocks.load.mockRejectedValue(new Error("unavailable"));
  mocks.activity.mockRejectedValue(new Error("unavailable"));
  render(await resolve(await Progress({ searchParams: Promise.resolve({}) })));
  expect(screen.getAllByRole("alert")).toHaveLength(8);
  fireEvent.click(screen.getAllByRole("button", { name: "Try again" })[0]);
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
it("provides a route retry and card-shaped loading skeletons", () => {
  const retry = vi.fn();
  const view = render(<ErrorCard unstable_retry={retry} />);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledOnce();
  view.unmount();
  const loading = render(<Loading />);
  expect(screen.getByLabelText("Loading progress")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  expect(
    loading.container.querySelectorAll('[data-slot="skeleton"]').length,
  ).toBeGreaterThan(10);
});

it("links each finished session to its correct report and scopes type chips to score history", async () => {
  const base = {
    config: { mode: "short" },
    finished_at: "2026-10-09T01:00:00Z",
    elapsed_s: 100,
    pct: 80,
    by_type: { short: 60 },
  };
  mocks.load.mockResolvedValue({
    ...empty,
    history: [
      { ...base, id: "sprint", kind: "sprint" },
      {
        ...base,
        id: "sit",
        kind: "paper",
      },
      { ...base, id: "cards", kind: "flashcards", by_type: {} },
      { ...base, id: "single", kind: "single" },
    ],
  });
  const view = render(
    await resolve(
      await Progress({ searchParams: Promise.resolve({ range: "all" }) }),
    ),
  );
  expect(
    screen.getAllByRole("link", { name: /Short answer sprint/ })[0],
  ).toHaveAttribute("href", "/student/sprint/sprint/results");
  expect(
    screen.getAllByRole("link", { name: /Flashcards/ })[0],
  ).toHaveAttribute("href", "/student/flashcards/cards");
  expect(
    screen.getAllByRole("link", { name: /Mark my answer/ })[0],
  ).toHaveAttribute("href", "/student/activity/single");
  view.unmount();
  render(
    await resolve(
      await Progress({
        searchParams: Promise.resolve({
          range: "all",
          type: "short",
          kind: "sprint",
        }),
      }),
    ),
  );
  expect(
    screen.getAllByRole("link", { name: /Short answer sprint/ })[0],
  ).toHaveAttribute("href", "/student/sprint/sprint/results");
  expect(
    screen.getAllByRole("link", { name: /Short answer sprint/ })[0],
  ).toHaveAccessibleName(/60%/);
  expect(screen.queryByRole("link", { name: /Flashcards/ })).toBeNull();
});
