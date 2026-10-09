import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
const mocks = vi.hoisted(() => ({ save: vi.fn(), session: vi.fn() }));
vi.mock("@/app/(app)/actions", () => ({ saveProfile: mocks.save }));
vi.mock("@/lib/auth-client", () => ({ ensureSession: mocks.session }));
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  }),
}));
vi.mock("@/app/(auth)/auth-form", () => ({
  AuthForm: () => <p>Sign-in form</p>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
import { ProfileForm } from "./profile-form";
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
const mount = () =>
  render(
    <ProfileForm
      profile={{ full_name: "Om", year_level: 11, school: "" }}
      email="own@example.com"
      userId="own"
    />,
  );
it("preserves offline edits and saves them once on reconnect, while unchanged fields never submit", async () => {
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  mocks.session.mockResolvedValue(undefined);
  mocks.save.mockResolvedValue({ message: "Saved" });
  mount();
  fireEvent.change(screen.getByLabelText("Full name"), {
    target: { value: "New name" },
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled(),
  );
  online.mockReturnValue(false);
  fireEvent(window, new Event("offline"));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled(),
  );
  expect(mocks.save).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem("claro:profile:own")!).full_name).toBe(
    "New name",
  );
  online.mockReturnValue(true);
  fireEvent(window, new Event("online"));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(localStorage.getItem("claro:profile:own")).toBeNull(),
  );
  online.mockReturnValue(false);
  fireEvent(window, new Event("offline"));
  online.mockReturnValue(true);
  fireEvent(window, new Event("online"));
  expect(mocks.save).toHaveBeenCalledTimes(1);
});
it("keeps details and the draft after a failed request", async () => {
  mocks.session.mockResolvedValue(undefined);
  mocks.save.mockRejectedValue(new Error("Network unavailable"));
  mount();
  fireEvent.change(screen.getByLabelText("Full name"), {
    target: { value: "Unsaved name" },
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled(),
  );
  fireEvent.submit(screen.getByRole("form", { name: "Details" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Couldn't save your details. Try again",
  );
  expect(screen.getByLabelText("Full name")).toHaveValue("Unsaved name");
  expect(JSON.parse(localStorage.getItem("claro:profile:own")!).full_name).toBe(
    "Unsaved name",
  );
});
