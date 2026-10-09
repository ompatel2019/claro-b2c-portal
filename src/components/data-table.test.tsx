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
