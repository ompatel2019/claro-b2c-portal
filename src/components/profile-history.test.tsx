import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  ProfileHistory,
  type FeedbackRow,
  type ReviewRow,
} from "./profile-history";
import { dateLabel } from "@/lib/practice";

const nav = vi.hoisted(() => ({ push: vi.fn(), search: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push }),
  usePathname: () => "/student/profile",
  useSearchParams: () => nav.search() ?? new URLSearchParams(),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const pager = {
  page: 1,
  pages: 1,
  total: 1,
  sort: { id: "created_at", dir: "desc" as const },
};
const created_at = "2026-10-01T00:00:00Z";

function checkResponsiveColumns(
  table: HTMLElement,
  hidden: string[],
  label: string,
) {
  expect(table.closest('[data-slot="card"]')).toHaveClass("@container");
  const headers = within(table).getAllByRole("columnheader");
  const cells = within(table).getAllByRole("row")[1].querySelectorAll("td");
  for (const [index, header] of headers.entries()) {
    if (hidden.includes(header.textContent!)) {
      expect(header).toHaveClass("hidden", "@min-[640px]:table-cell");
      expect(cells[index]).toHaveClass("hidden", "@min-[640px]:table-cell");
    } else {
      expect(header).toHaveTextContent(label);
      expect(cells[index]).toHaveClass(
        "w-full",
        "max-w-0",
        "whitespace-normal",
        "wrap-anywhere",
      );
      expect(cells[index]).not.toHaveClass("min-w-40");
    }
  }
}

it.each(["Thanks for flagging this", null])(
  "keeps feedback metadata and reply (%s) under the message in narrow cards",
  (admin_note) => {
    const row: FeedbackRow = {
      id: "feedback-1",
      created_at,
      kind: "content",
      message: "A".repeat(200),
      status: "triaged",
      admin_note,
    };
    render(<ProfileHistory kind="feedback" rows={[row]} pager={pager} />);
    const table = screen.getByRole("table", { name: "Your feedback" });
    checkResponsiveColumns(
      table,
      ["Date", "Type", "Status", "Reply from the team"],
      "Message",
    );
    const cell = within(table)
      .getByText(`${"A".repeat(160)}…`)
      .closest("td")!;
    for (const detail of [
      `${dateLabel(created_at, true)} · Content error · Status: Triaged`,
      `Reply from the team: ${admin_note || "No reply yet"}`,
    ])
      expect(within(cell).getByText(detail)).toHaveClass(
        "text-muted-foreground",
        "text-xs",
        "@min-[640px]:hidden",
      );
    expect(within(cell).getByTitle(row.message)).toBeInTheDocument();
  },
);

it.each([
  ["open", null, "Being checked"],
  ["resolved", 2, "Unchanged"],
  ["resolved", 3, "Changed 2 → 3"],
] as const)(
  "keeps review notes and outcome (%s, %s) under the linked question",
  (status, final_mark, outcome) => {
    const row: ReviewRow = {
      id: "review-1",
      created_at,
      question: "Question 1",
      student_note: "Please check this mark",
      status,
      ai_mark: 2,
      final_mark,
      href: "/student/activity/session#q-1",
    };
    render(<ProfileHistory kind="reviews" rows={[row]} pager={pager} />);
    const table = screen.getByRole("table", { name: "Marks you questioned" });
    checkResponsiveColumns(table, ["Date", "Your note", "Status"], "Question");
    const link = within(table).getByRole("link", { name: row.question });
    expect(link).toHaveAttribute("href", row.href);
    const cell = link.closest("td")!;
    for (const detail of [
      `${dateLabel(created_at, true)} · Status: ${outcome}`,
      `Your note: ${row.student_note}`,
    ])
      expect(within(cell).getByText(detail)).toHaveClass(
        "text-muted-foreground",
        "text-xs",
        "@min-[640px]:hidden",
      );
  },
);

it.each(["feedback", "reviews"] as const)(
  "keeps %s sorting available in narrow cards and preserves the other table's URL state",
  (kind) => {
    nav.search.mockReturnValue(
      new URLSearchParams(
        "feedback_page=2&reviews_page=3&reviews_sort=status&reviews_dir=desc",
      ),
    );
    const title =
      kind === "feedback" ? "your feedback" : "marks you questioned";
    const { rerender } = render(
      <ProfileHistory kind={kind} rows={[]} pager={pager} />,
    );
    const select = screen.getByRole("combobox", { name: `Sort ${title}` });
    expect(select).toHaveValue("created_at:desc");
    expect(select.closest("label")).toHaveClass("@min-[640px]:hidden");
    expect(within(select).getAllByRole("option")).toHaveLength(
      kind === "feedback" ? 6 : 4,
    );
    fireEvent.change(select, { target: { value: "status:asc" } });
    const expected =
      kind === "feedback"
        ? "/student/profile?feedback_page=1&reviews_page=3&reviews_sort=status&reviews_dir=desc&feedback_sort=status&feedback_dir=asc"
        : "/student/profile?feedback_page=2&reviews_page=1&reviews_sort=status&reviews_dir=asc";
    expect(nav.push).toHaveBeenLastCalledWith(expected, { scroll: false });
    rerender(
      <ProfileHistory
        kind={kind}
        rows={[]}
        pager={{ ...pager, sort: { id: "status", dir: "asc" } }}
      />,
    );
    expect(select).toHaveValue("status:asc");
    fireEvent.change(select, { target: { value: "status:desc" } });
    expect(nav.push).toHaveBeenLastCalledWith(
      expected.replace(`${kind}_dir=asc`, `${kind}_dir=desc`),
      { scroll: false },
    );
  },
);
