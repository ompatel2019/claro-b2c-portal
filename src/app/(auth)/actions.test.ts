import { expect, it, vi } from "vitest";

const signOutMock = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { signOut: signOutMock } }),
}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

import { signOut } from "./actions";

it("signs out this device only, never the student's other sessions", async () => {
  await expect(signOut()).rejects.toThrow("NEXT_REDIRECT");
  expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });
});
