import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireProfile: vi.fn(),
  admin: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireProfile: mocks.requireProfile }));
vi.mock("@/utils/supabase/admin", () => ({ admin: mocks.admin }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: vi.fn() }) }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/components/app-shell", () => ({ AppShell: vi.fn() }));
vi.mock("sonner", () => ({ Toaster: vi.fn() }));
import AdminLayout from "./layout";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireProfile.mockResolvedValue({ role: "admin", full_name: "Admin" });
  mocks.admin.mockReturnValue({ from: mocks.from });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
});

it.each([
  [{ count: 7, error: null }, 7],
  [{ count: null, error: null }, 0],
  [{ count: 7, error: { message: "Unavailable" } }, 0],
])(
  "passes the open review count with a zero fallback (%j)",
  async (result, expected) => {
    mocks.eq.mockResolvedValue(result);
    const shell = await AdminLayout({ children: "Content" });
    expect(mocks.from).toHaveBeenCalledWith("mark_reviews");
    expect(mocks.select).toHaveBeenCalledWith("*", {
      count: "exact",
      head: true,
    });
    expect(mocks.eq).toHaveBeenCalledWith("status", "open");
    expect(shell.props.badges).toEqual({ "/admin/marking/review": expected });
  },
);

it("redirects non-admins before accessing the service-role client", async () => {
  mocks.requireProfile.mockResolvedValue({ role: "student" });
  await expect(AdminLayout({ children: "Content" })).rejects.toThrow(
    "redirect:/student",
  );
  expect(mocks.admin).not.toHaveBeenCalled();
});
