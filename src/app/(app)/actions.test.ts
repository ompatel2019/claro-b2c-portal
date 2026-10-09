import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireProfile: vi.fn(),
  getUser: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  from: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireProfile: mocks.requireProfile }));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  }),
}));
vi.mock("@/env/client", () => ({
  clientEnv: {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-key",
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
import { saveProfile } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "own-user" } },
    error: null,
  });
  mocks.from.mockReturnValue({ update: mocks.update });
  mocks.update.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ single: mocks.single });
  mocks.single.mockResolvedValue({ data: { id: "own-user" }, error: null });
});
function form(year = "12") {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    welcome: "true",
    full_name: "  Student  ",
    year_level: year,
    school: "",
    id: "someone-else",
    role: "admin",
  }))
    form.set(key, value);
  return form;
}
it("saves only allowed fields for the authenticated owner and refreshes Home", async () => {
  await expect(saveProfile({}, form())).resolves.toEqual({
    message: "Saved",
  });
  expect(mocks.from).toHaveBeenCalledWith("profiles");
  expect(mocks.update).toHaveBeenCalledWith({
    full_name: "Student",
    year_level: 12,
    school: "",
  });
  expect(mocks.eq).toHaveBeenCalledWith("id", "own-user");
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
});
it("does not write welcome without a Year", async () => {
  await expect(saveProfile({}, form(""))).resolves.toEqual({
    error: "Choose your year.",
    fieldErrors: { year_level: ["Choose your year."] },
  });
  expect(mocks.from).not.toHaveBeenCalled();
});
it("keeps legacy profile edits working", async () => {
  const data = form("");
  data.delete("welcome");
  await saveProfile({}, data);
  expect(mocks.update).toHaveBeenCalledWith({
    full_name: "Student",
    year_level: null,
    school: "",
  });
});
it("returns a save error without revalidating", async () => {
  mocks.single.mockResolvedValue({ error: { message: "Save failed" } });
  await expect(saveProfile({}, form())).resolves.toEqual({
    error: "Couldn't save your details. Try again",
  });
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});
it("authenticates before writing", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  await expect(saveProfile({}, form())).resolves.toEqual({
    error: "Your session expired. Sign in again.",
    sessionExpired: true,
  });
  expect(mocks.from).not.toHaveBeenCalled();
});

it("preserves profile validation messages and array field errors", async () => {
  const data = form("");
  data.delete("welcome");
  data.set("full_name", "A");
  data.set("school", "S".repeat(121));
  await expect(saveProfile({}, data)).resolves.toEqual({
    error: "Use 2–80 characters for your name",
    fieldErrors: {
      full_name: ["Use 2–80 characters for your name"],
      school: ["Use no more than 120 characters"],
    },
  });
  expect(mocks.from).not.toHaveBeenCalled();
});

it("does not save when getUser reports an auth error even with a user", async () => {
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "own-user" } },
    error: { message: "Expired" },
  });
  const data = form();
  data.delete("welcome");
  await expect(saveProfile({}, data)).resolves.toEqual({
    error: "Your session expired. Sign in again.",
    sessionExpired: true,
  });
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});

it("does not report success when no profile row was updated", async () => {
  mocks.single.mockResolvedValue({
    data: null,
    error: { code: "PGRST116", message: "No rows returned" },
  });
  await expect(saveProfile({}, form())).resolves.toEqual({
    error: "Couldn't save your details. Try again",
  });
  expect(mocks.select).toHaveBeenCalledWith("id");
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});
