import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/content/questions",
}));
vi.mock("next/form", () => ({
  default: (props: React.ComponentProps<"form">) => <form {...props} />,
}));
import { FilterBar } from "./filter-bar";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("submits the chosen custom option with other filters and clears dependent URL fields", async () => {
  const submissions: FormData[] = [];
  vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(
    function (this: HTMLFormElement) {
      submissions.push(new FormData(this));
    },
  );
  render(
    <FilterBar
      customSelect
      hidden={{ page: "3", status: "draft" }}
      values={{}}
      filters={[
        {
          name: "topic",
          label: "Topic",
          all: "All topics",
          options: [{ value: "child", label: "Inflation" }],
          clearOnChange: ["page"],
        },
        { name: "q", label: "Search", placeholder: "Search questions" },
      ]}
    />,
  );
  expect(submissions).toHaveLength(0);
  fireEvent.change(screen.getByPlaceholderText("Search questions"), {
    target: { value: "prices" },
  });
  fireEvent.click(screen.getByRole("combobox", { name: "Topic" }));
  {
    const option = await screen.findByRole("option", { name: "Inflation" });
    fireEvent.mouseMove(option);
    fireEvent.mouseUp(option);
    fireEvent.click(option);
  }
  await waitFor(() => expect(submissions).toHaveLength(1));
  expect(submissions[0].get("topic")).toBe("child");
  expect(submissions[0].get("q")).toBe("prices");
  expect(submissions[0].get("status")).toBe("draft");
  expect(submissions[0].has("page")).toBe(false);
  fireEvent.click(screen.getByRole("combobox", { name: "Topic" }));
  {
    const option = await screen.findByRole("option", { name: "All topics" });
    fireEvent.mouseMove(option);
    fireEvent.mouseUp(option);
    fireEvent.click(option);
  }
  await waitFor(() => expect(submissions).toHaveLength(2));
  expect(submissions[1].get("topic")).toBe("");
});

it("keeps keyboard selection, submission and navigation values in sync", async () => {
  const submissions: FormData[] = [];
  vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(
    function (this: HTMLFormElement) {
      submissions.push(new FormData(this));
    },
  );
  const filters = [
    {
      name: "topic",
      label: "Topic",
      all: "All topics",
      options: [{ value: "child", label: "Inflation" }],
    },
  ];
  const { rerender } = render(
    <FilterBar
      customSelect
      values={{}}
      filters={filters}
      hidden={{ status: "draft" }}
    />,
  );
  const trigger = screen.getByRole("combobox", { name: "Topic" });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  const option = await screen.findByRole("option", { name: "Inflation" });
  fireEvent.keyDown(option, { key: "Enter" });
  await waitFor(() => expect(submissions).toHaveLength(1));
  expect(submissions[0].get("topic")).toBe("child");
  expect(submissions[0].get("status")).toBe("draft");
  rerender(
    <FilterBar
      customSelect
      values={{ topic: "child" }}
      filters={filters}
      hidden={{ status: "draft" }}
    />,
  );
  expect(screen.getByRole("combobox", { name: "Topic" })).toHaveTextContent(
    "Inflation",
  );
  rerender(
    <FilterBar
      customSelect
      values={{}}
      filters={filters}
      hidden={{ status: "live" }}
    />,
  );
  expect(screen.getByRole("combobox", { name: "Topic" })).toHaveTextContent(
    "All topics",
  );
  expect(submissions).toHaveLength(1);
  const data = new FormData(
    screen.getByRole("button", { name: "Apply" }).closest("form")!,
  );
  expect(data.get("topic")).toBe("");
  expect(data.get("status")).toBe("live");
});
