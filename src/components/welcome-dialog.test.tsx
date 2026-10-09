import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const save = vi.hoisted(() => vi.fn());
vi.mock("@/app/(app)/actions", () => ({ saveProfile: save }));
vi.mock("@/components/page-status", () => ({
  PageStatus: ({ children }: { children: React.ReactNode }) => children,
}));
import { WelcomeDialog } from "./welcome-dialog";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("keeps welcome open on Escape and preserves the draft after a failed save", async () => {
  save.mockRejectedValue(new Error("Network unavailable"));
  render(
    <WelcomeDialog profile={{ full_name: "Sign-up Name", school: null }} />,
  );
  const dialog = await screen.findByRole("dialog", { name: "Welcome" });
  expect(
    screen.queryByRole("button", { name: "Close" }),
  ).not.toBeInTheDocument();
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(dialog).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Full name", { exact: true }), {
    target: { value: "Edited Name" },
  });
  fireEvent.change(screen.getByLabelText("School", { exact: true }), {
    target: { value: "Draft School" },
  });
  // Submit directly to exercise the failed-action path independently of native validation.
  fireEvent.submit(
    screen.getByRole("button", { name: "Let's go" }).closest("form")!,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Couldn't save this. Try again.",
  );
  expect(screen.getByLabelText("Full name", { exact: true })).toHaveValue(
    "Edited Name",
  );
  expect(screen.getByLabelText("School", { exact: true })).toHaveValue(
    "Draft School",
  );
  expect(dialog).toBeInTheDocument();
});

it("focuses the dialog and links Year validation to its labelled control", async () => {
  save.mockResolvedValue({
    error: "Choose your year.",
    fieldErrors: { year_level: ["Choose your year."] },
  });
  render(
    <WelcomeDialog profile={{ full_name: "Student Name", school: null }} />,
  );
  const dialog = await screen.findByRole("dialog", { name: "Welcome" });
  await waitFor(() =>
    expect(dialog.contains(document.activeElement)).toBe(true),
  );
  const year = screen.getByRole("combobox", { name: "Year" });
  fireEvent.submit(
    screen.getByRole("button", { name: "Let's go" }).closest("form")!,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Choose your year.",
  );
  expect(year).toHaveAttribute("aria-invalid", "true");
  expect(year).toHaveAccessibleDescription("Choose your year.");
  expect(dialog).toBeInTheDocument();
});

it("offers sign-in when the session expires inside the mandatory dialog", async () => {
  save.mockResolvedValue({
    error: "Your session expired. Sign in again.",
    sessionExpired: true,
  });
  render(
    <WelcomeDialog profile={{ full_name: "Student Name", school: null }} />,
  );
  await screen.findByRole("dialog", { name: "Welcome" });
  fireEvent.submit(
    screen.getByRole("button", { name: "Let's go" }).closest("form")!,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Your session expired. Sign in again.",
  );
  expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute(
    "href",
    "/sign-in",
  );
  expect(
    screen.queryByRole("button", { name: "Let's go" }),
  ).not.toBeInTheDocument();
});
