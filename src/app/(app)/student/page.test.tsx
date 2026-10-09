import { beforeEach, expect, it, vi } from "vitest";
import { Children, type ReactElement } from "react";

const mocks = vi.hoisted(() => ({
  requireProfile: vi.fn(),
  createClient: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireProfile: mocks.requireProfile }));
vi.mock("@/utils/supabase/server", () => ({
  createClient: mocks.createClient,
}));
import Home from "./page";
import { WelcomeDialog } from "@/components/welcome-dialog";
import { Shortcut } from "@/components/shortcut";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireProfile.mockResolvedValue({
    id: "own-student",
    role: "student",
    year_level: null,
    full_name: "Student",
    school: null,
  });
  mocks.createClient.mockResolvedValue({ from: mocks.from });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
});

it.each([0, 1, 50, null])(
  "checks only own sessions and welcomes only at zero (%s)",
  async (count) => {
    mocks.eq.mockResolvedValue({ count, error: null });
    const page = await Home();
    const children = Children.toArray(page.props.children) as ReactElement[];
    expect(mocks.from).toHaveBeenCalledWith("sessions");
    expect(mocks.select).toHaveBeenCalledWith("id", {
      count: "exact",
      head: true,
    });
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "own-student");
    expect(children.some((child) => child.type === WelcomeDialog)).toBe(
      count === 0,
    );
    expect(children.some((child) => child.type === Shortcut)).toBe(count !== 0);
  },
);

it.each([
  { role: "admin", year_level: null },
  { role: "student", year_level: 11 },
])("skips the session query for %o", async (profile) => {
  mocks.requireProfile.mockResolvedValue({ id: "own-user", ...profile });
  await Home();
  expect(mocks.createClient).not.toHaveBeenCalled();
});

it("does not treat a failed session lookup as a first visit", async () => {
  mocks.eq.mockResolvedValue({
    count: null,
    error: { message: "Unavailable" },
  });
  await expect(Home()).rejects.toThrow("Couldn't check first visit.");
});
