import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Target } from "@/components/icons";
vi.mock("next/navigation", () => ({ usePathname: () => "/activity" }));
vi.mock("next/form", () => ({
  default: (props: React.ComponentProps<"form">) => <form {...props} />,
}));
vi.mock("@/app/(auth)/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/utils/supabase/client", () => ({ createClient: vi.fn() }));
import { activeItem, AppShell, nav } from "./app-shell";
import { DataTable, sortRows, type Column } from "./data-table";
import { EmptyState } from "./empty-state";
import { FilterBar } from "./filter-bar";
import { PageHeader } from "./page-header";
import { StatCard } from "./stat-card";
afterEach(cleanup);

it("groups student and admin navigation without homework", () => {
  expect(nav.student.map((g) => g.label)).toEqual(["Practise", "Track"]);
  expect(nav.admin.map((g) => g.label)).toEqual([
    "Overview",
    "Students",
    "Content",
    "Marking",
    "Spend & settings",
  ]);
  const hrefs = Object.values(nav).flatMap((groups) =>
    groups.flatMap((g) => g.items.map((i) => i.href)),
  );
  expect(hrefs.some((h) => h.includes("homework"))).toBe(false);
});

it("marks the section root only on an exact match", () => {
  expect(activeItem("student", "/student")?.label).toBe("Home");
  expect(activeItem("student", "/student/sprint/abc/results")?.label).toBe(
    "Topic Sprint",
  );
  expect(activeItem("student", "/student/sprint")?.label).toBe("Topic Sprint");
  expect(activeItem("student", "/student/flashcards")?.label).toBe(
    "Flashcards",
  );
  expect(
    nav.student.flatMap((g) => g.items).find((i) => i.label === "Flashcards")
      ?.href,
  ).toBe("/student/flashcards");
  expect(activeItem("student", "/profile")).toBeUndefined();
  expect(activeItem("admin", "/admin")?.label).toBe("Dashboard");
  expect(activeItem("admin", "/admin/students/x")?.label).toBe("All students");
  expect(activeItem("admin", "/admin/marking/review/x")?.label).toBe(
    "Review queue",
  );
});

it.each([
  ["admin", "/admin/marking/review", "open"],
  ["student", "/student/flashcards", "due"],
] as const)("labels %s badges as %s", (kind, href, label) => {
  window.matchMedia = () =>
    ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as MediaQueryList;
  render(
    <AppShell kind={kind} name="Test" defaultOpen badges={{ [href]: 3 }}>
      Content
    </AppShell>,
  );
  expect(screen.getByLabelText(`3 ${label}`)).toHaveTextContent("3");
});

it("renders the page header, stat card and empty state", () => {
  render(
    <>
      <PageHeader
        eyebrow="Eyebrow"
        title="Title"
        description="One line"
        actions={<button>Go</button>}
      />
      <StatCard label="Average" value="74%" caption="Last 7 days" />
      <EmptyState
        icon={Target}
        title="Nothing yet"
        description="Finish a sprint first."
        action={<button>Start</button>}
      />
    </>,
  );
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Title");
  expect(screen.getByText("One line")).toBeInTheDocument();
  expect(screen.getByText("74%")).toBeInTheDocument();
  expect(screen.getByText("Last 7 days")).toBeInTheDocument();
  expect(screen.getByText("Nothing yet")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
});

it("sorts with missing values last in both directions", () => {
  const rows = [{ v: 2 }, { v: null }, { v: 1 }];
  expect(sortRows(rows, (r) => r.v, "asc").map((r) => r.v)).toEqual([
    1,
    2,
    null,
  ]);
  expect(sortRows(rows, (r) => r.v, "desc").map((r) => r.v)).toEqual([
    2,
    1,
    null,
  ]);
});

it("cycles a sortable header through ascending, descending and off", () => {
  type Row = { id: string; name: string };
  const columns: Column<Row>[] = [
    { id: "name", header: "Name", cell: (r) => r.name, sort: (r) => r.name },
  ];
  const rows = [
    { id: "1", name: "Bea" },
    { id: "2", name: "Al" },
    { id: "3", name: "Cy" },
  ];
  render(<DataTable label="People" columns={columns} rows={rows} />);
  const names = () =>
    screen
      .getAllByRole("row")
      .slice(1)
      .map((r) => r.textContent);
  const header = screen.getByRole("button", { name: "Name" });
  fireEvent.click(header);
  expect(names()).toEqual(["Al", "Bea", "Cy"]);
  expect(screen.getByRole("columnheader")).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  fireEvent.click(header);
  expect(names()).toEqual(["Cy", "Bea", "Al"]);
  fireEvent.click(header);
  expect(names()).toEqual(["Bea", "Al", "Cy"]);
});

it("counts active filters on Clear and hides it when none are set", () => {
  const filters = [
    {
      name: "mode",
      label: "Mode",
      all: "All modes",
      options: [{ value: "mcq", label: "Multiple choice" }],
    },
    { name: "q", label: "Search", placeholder: "Stem" },
  ];
  const { rerender } = render(<FilterBar filters={filters} values={{}} />);
  expect(screen.queryByRole("link", { name: /Clear/ })).toBeNull();
  rerender(<FilterBar filters={filters} values={{ mode: "mcq", q: "gdp" }} />);
  expect(screen.getByRole("link", { name: "Clear (2)" })).toHaveAttribute(
    "href",
    "/activity",
  );
  expect(screen.getByLabelText("Mode")).toHaveValue("mcq");
  expect(screen.getByLabelText("Search")).toHaveValue("gdp");
});
