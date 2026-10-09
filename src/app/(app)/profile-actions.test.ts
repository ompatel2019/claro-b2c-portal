import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  const single = vi.fn();
  const select = vi.fn(() => ({ single }));
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  return {
    single,
    select,
    eq,
    update,
    from: vi.fn(() => ({ update })),
    getUser: vi.fn(),
    updateUser: vi.fn(),
    verify: vi.fn(),
    signOut: vi.fn(),
    revalidate: vi.fn(),
  };
});
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    from: mocks.from,
    auth: { getUser: mocks.getUser, updateUser: mocks.updateUser },
  }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { signInWithPassword: mocks.verify, signOut: mocks.signOut },
  }),
}));
vi.mock("@/lib/auth", () => ({ requireProfile: vi.fn() }));
vi.mock("@/env/client", () => ({
  clientEnv: {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public",
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { saveProfile, changePassword } from "./actions";
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
const password = {
  current_password: "old-password",
  password: "new-password",
  confirm: "new-password",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "own", email: "own@example.com" } },
    error: null,
  });
  mocks.single.mockResolvedValue({ data: { id: "own" }, error: null });
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});
it("returns a recoverable session error and makes no writes when signed out", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  expect(
    await saveProfile(
      {},
      form({ full_name: "Om", year_level: "11", school: "" }),
    ),
  ).toMatchObject({ sessionExpired: true });
  expect(await changePassword({}, form(password))).toMatchObject({
    sessionExpired: true,
  });
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.verify).not.toHaveBeenCalled();
  expect(mocks.updateUser).not.toHaveBeenCalled();
});
it("updates only the authenticated user's allowed columns and confirms a row was saved", async () => {
  expect(
    await saveProfile(
      {},
      form({
        id: "other",
        role: "admin",
        email: "other@example.com",
        full_name: " Om ",
        year_level: "12",
        school: " School ",
      }),
    ),
  ).toEqual({ message: "Saved" });
  expect(mocks.eq).toHaveBeenCalledWith("id", "own");
  expect(mocks.update).toHaveBeenCalledWith({
    full_name: "Om",
    year_level: 12,
    school: "School",
  });
  mocks.single.mockResolvedValue({ data: null, error: { message: "no row" } });
  expect(
    await saveProfile(
      {},
      form({ full_name: "Om", year_level: "11", school: "" }),
    ),
  ).toHaveProperty("error");
});
it("never changes a password after failed verification or a different verified user", async () => {
  for (const result of [
    { data: { user: null }, error: { code: "invalid_credentials" } },
    { data: { user: { id: "other" } }, error: null },
  ]) {
    mocks.verify.mockResolvedValue(result);
    expect(await changePassword({}, form(password))).toHaveProperty("error");
  }
  expect(mocks.verify).toHaveBeenCalledWith({
    email: "own@example.com",
    password: "old-password",
  });
  expect(mocks.updateUser).not.toHaveBeenCalled();
});
it("rejects invalid passwords before any authentication request", async () => {
  expect(
    await changePassword({}, form({ ...password, confirm: "different" })),
  ).toMatchObject({
    error: "Passwords don't match",
    fieldErrors: { confirm: ["Passwords don't match"] },
  });
  expect(mocks.getUser).not.toHaveBeenCalled();
  expect(mocks.updateUser).not.toHaveBeenCalled();
});
