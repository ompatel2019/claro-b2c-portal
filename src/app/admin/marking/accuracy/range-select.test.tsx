import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/admin/marking/accuracy",
  useSearchParams: () => new URLSearchParams("tab=x"),
}));
import { RangeSelect } from "./range-select";

afterEach(cleanup);

it("shows the current range and writes the chosen one to the URL", async () => {
  render(<RangeSelect range={30} />);
  const select = screen.getByRole("combobox", { name: "Date range" });
  expect(select).toHaveTextContent("30 days");
  fireEvent.click(select);
  const option = await screen.findByRole("option", { name: "7 days" });
  // Base UI only commits a mouse click that started on the item.
  fireEvent.pointerDown(option);
  fireEvent.click(option);
  expect(push).toHaveBeenCalledWith("/admin/marking/accuracy?tab=x&range=7");
});
