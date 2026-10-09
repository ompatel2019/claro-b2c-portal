import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
const nav = vi.hoisted(() => ({
  push: vi.fn(),
  router: vi.fn(),
  path: vi.fn(),
  search: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: nav.router,
  usePathname: nav.path,
  useSearchParams: nav.search,
}));
import { StaticTable } from "./static-table";
import { DataTable } from "./data-table";
import { StudentsTable } from "./students-table";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const columns = [
  {
    id: "value",
    header: "Value",
    cell: (r: { id: string; value: number }) => r.value,
    sort: (r: { value: number }) => r.value,
  },
];
const rows = [
  { id: "a", value: 2 },
  { id: "b", value: 1 },
];
it("local tables never call navigation hooks", () => {
  nav.router.mockImplementation(() => {
    throw new Error("No router mounted");
  });
  render(<DataTable label="Local" columns={columns} rows={rows} />);
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Value" }));
  expect(screen.getAllByRole("row")[1]).toHaveTextContent("1");
  expect(nav.router).not.toHaveBeenCalled();
  expect(nav.search).not.toHaveBeenCalled();
});
it("server sorting resets the page while preserving filters; pagination preserves sort", () => {
  nav.router.mockReturnValue({ push: nav.push });
  nav.path.mockReturnValue("/admin/students");
  nav.search.mockReturnValue(
    new URLSearchParams("q=ada&sort=value&dir=desc&page=2"),
  );
  render(
    <DataTable
      label="Server"
      columns={columns}
      rows={rows}
      pager={{
        page: 2,
        pages: 3,
        total: 101,
        sort: { id: "value", dir: "desc" },
      }}
      selectable
    />,
  );
  expect(screen.getAllByRole("row")[1]).toHaveTextContent("2");
  fireEvent.click(screen.getByRole("button", { name: "Value" }));
  expect(nav.push).toHaveBeenLastCalledWith(
    "/admin/students?q=ada&sort=value&dir=asc&page=1",
    { scroll: false },
  );
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(nav.push).toHaveBeenLastCalledWith(
    "/admin/students?q=ada&sort=value&dir=desc&page=3",
    { scroll: false },
  );
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Select all rows on this page" }),
  );
  expect(screen.getByRole("status")).toHaveTextContent("2 selected");
});

it("StaticTable expands child rows with an accessible control", () => {
  render(
    <StaticTable
      label="Topics"
      columns={[{ id: "name", header: "Topic" }]}
      rows={[
        {
          id: "a",
          cells: { name: "Economy" },
          children: [{ id: "a1", cells: { name: "Subtopic marks" } }],
        },
        { id: "b", cells: { name: "Markets" } },
      ]}
    />,
  );
  const expand = screen.getByRole("button", { name: "Economy subtopics" });
  expect(expand).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("Subtopic marks")).not.toBeInTheDocument();
  fireEvent.click(expand);
  expect(expand).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("Subtopic marks")).toBeVisible();
  fireEvent.click(expand);
  expect(screen.queryByText("Subtopic marks")).not.toBeInTheDocument();
});

it("bulk selection is opt-in, page-scoped and provides a clear callback", () => {
  nav.router.mockReturnValue({ push: nav.push });
  nav.path.mockReturnValue("/admin/content/questions");
  nav.search.mockReturnValue(new URLSearchParams("status=draft"));
  render(
    <DataTable
      label="Questions"
      columns={columns}
      rows={rows}
      pager={{ page: 1, pages: 1, total: 2, sort: { id: "value", dir: "asc" } }}
      bulk={(ids, clear) => (
        <button onClick={clear}>Publish {ids.join(",")}</button>
      )}
    />,
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Select a" }));
  expect(screen.getByRole("button", { name: "Publish a" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Publish a" }));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("bulk actions opt into selection and can clear the selected page", () => {
  const selected = vi.fn();
  render(
    <DataTable
      label="Bulk"
      columns={columns}
      rows={rows}
      bulk={(ids, clear) => (
        <button
          onClick={() => {
            selected(ids);
            clear();
          }}
        >
          Apply to selected
        </button>
      )}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "Apply to selected" }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Select all rows on this page" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Apply to selected" }));
  expect(selected).toHaveBeenCalledWith(["a", "b"]);
  expect(
    screen.getByRole("checkbox", { name: "Select all rows on this page" }),
  ).not.toBeChecked();
});

it("clears bulk selection when the server page or filters change", () => {
  nav.router.mockReturnValue({ push: nav.push });
  nav.path.mockReturnValue("/admin/content/questions");
  nav.search.mockReturnValue(new URLSearchParams("status=draft&page=1"));
  const bulk = (ids: string[]) => <button>Publish {ids.join(",")}</button>;
  const table = (page: number) => (
    <DataTable
      label="Questions"
      columns={columns}
      rows={rows}
      pager={{ page, pages: 2, total: 4, sort: { id: "value", dir: "asc" } }}
      bulk={bulk}
    />
  );
  const { rerender } = render(table(1));
  fireEvent.click(screen.getByRole("checkbox", { name: "Select a" }));
  expect(screen.getByRole("button", { name: "Publish a" })).toBeVisible();
  nav.search.mockReturnValue(new URLSearchParams("status=draft&page=2"));
  rerender(table(2));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Select a" })).not.toBeChecked();
  fireEvent.click(screen.getByRole("checkbox", { name: "Select b" }));
  nav.search.mockReturnValue(new URLSearchParams("status=live&page=2"));
  rerender(table(2));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Select b" })).not.toBeChecked();
});

it("keeps the other profile table's page when sorting or paging a namespaced table", () => {
  nav.router.mockReturnValue({ push: nav.push });
  nav.path.mockReturnValue("/student/profile");
  nav.search.mockReturnValue(
    new URLSearchParams(
      "reviews_page=3&feedback_page=2&feedback_sort=value&feedback_dir=desc",
    ),
  );
  render(
    <DataTable
      label="Feedback"
      columns={columns}
      rows={rows}
      paramPrefix="feedback_"
      pager={{
        page: 2,
        pages: 4,
        total: 70,
        sort: { id: "value", dir: "desc" },
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Value" }));
  expect(nav.push).toHaveBeenLastCalledWith(
    "/student/profile?reviews_page=3&feedback_page=1&feedback_sort=value&feedback_dir=asc",
    { scroll: false },
  );
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(nav.push).toHaveBeenLastCalledWith(
    "/student/profile?reviews_page=3&feedback_page=3&feedback_sort=value&feedback_dir=desc",
    { scroll: false },
  );
});

it.each([
  [0, "rows"],
  [1, "row"],
  [2, "rows"],
])("pluralises the shared pager for %s rows", (total, noun) => {
  nav.router.mockReturnValue({ push: nav.push });
  nav.path.mockReturnValue("/student/profile");
  nav.search.mockReturnValue(new URLSearchParams());
  render(
    <DataTable
      label="Feedback"
      columns={columns}
      rows={rows.slice(0, total)}
      pager={{ page: 1, pages: 1, total, sort: { id: "value", dir: "asc" } }}
    />,
  );
  expect(
    screen
      .getByRole("navigation", { name: "Feedback pagination" })
      .querySelector('[aria-live="polite"]'),
  ).toHaveTextContent(new RegExp(`^Page 1 of 1 · ${total} ${noun}$`));
});

it("student details preserve hidden metrics without triggering row navigation", () => {
  nav.router.mockReturnValue({ push: nav.push });
  nav.path.mockReturnValue("/admin/students");
  nav.search.mockReturnValue(new URLSearchParams());
  const { container } = render(
    <StudentsTable
      students={[
        {
          id: "ada",
          full_name: "Ada",
          email: "ada@example.com",
          year_level: 11,
          school: "School",
          joined: "2026-10-09",
          last_active: null,
          sessions_7d: 0,
          sessions_total: 0,
          answered: 0,
          avg_30: null,
          streak: 0,
          open_disputes: 0,
          ai_spend: 1.23,
          blocked: false,
        },
      ]}
      pager={{ page: 1, pages: 1, total: 1, sort: { id: "last", dir: "desc" } }}
    />,
  );
  fireEvent.click(screen.getByText("More details"));
  expect(nav.push).not.toHaveBeenCalled();
  const details = container.querySelector("details")!;
  const fields = Object.fromEntries(
    Array.from(details.querySelectorAll("dl > div"), (field) => [
      field.querySelector("dt")!.textContent,
      field.querySelector("dd")!.textContent,
    ]),
  );
  expect(fields).toMatchObject({
    Email: "ada@example.com",
    School: "School",
    "Sessions total": "0",
    "Questions answered": "0",
    "AI spend (all time)": "$1.23",
    Blocked: "No",
  });
  fireEvent.click(screen.getAllByRole("row")[1].querySelectorAll("td")[6]);
  expect(nav.push).toHaveBeenCalledWith("/admin/students/ada");
});
