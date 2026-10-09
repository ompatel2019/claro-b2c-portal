// @vitest-environment node
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
}));
import { readdir, readFile } from "node:fs/promises";
import { loadLatestEval } from "./eval";

it("reads only the JSON results in the bundled folder", async () => {
  vi.mocked(readdir).mockResolvedValue([
    "2026-10-09-1159.json",
    "README.md",
    "2026-10-09-1440.json",
  ] as never);
  vi.mocked(readFile).mockImplementation(async (file) =>
    JSON.stringify(
      String(file).endsWith("1440.json")
        ? {
            meta: {
              stamp: "2026-10-09-1440",
              label: "subset",
              items: [1],
              marker: { model: "x" },
            },
            heldOut: { n: 1, within1: 1, exact: 1 },
          }
        : {
            meta: {
              stamp: "2026-10-09-1159",
              label: "full",
              marker: { model: "gpt-6.1-sol" },
            },
            heldOut: { n: 196, within1: 0.6, exact: 0.3 },
            items: [
              {
                section: "Held-out",
                marks: 6,
                expected: 3,
                mark: 4,
                score: { band: true },
                answer: "never shown",
              },
            ],
          },
    ),
  );
  expect(await loadLatestEval()).toEqual({
    stamp: "2026-10-09-1159",
    label: "full",
    model: "gpt-6.1-sol",
    n: 1,
    agreement: 1,
    exact: 0,
  });
  expect(vi.mocked(readdir).mock.calls[0][0]).toMatch(
    /src\/lib\/ai\/eval\/results$/,
  );
  expect(readFile).toHaveBeenCalledTimes(2);
});
