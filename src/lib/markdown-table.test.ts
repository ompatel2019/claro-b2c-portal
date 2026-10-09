import { expect, it } from "vitest";
import { blocks } from "./markdown-table";

it("keeps plain text", () => {
  expect(blocks("Hello\n\nWorld")).toEqual([
    { type: "text", text: "Hello\n\nWorld" },
  ]);
});

it("parses a pipe table with surrounding text", () => {
  const source = `The table shows prices.\n\n| Year | CPI |\n| --- | --- |\n| 1 | 100 |\n| 2 | 110 |\n\nUse the table.`;
  expect(blocks(source)).toEqual([
    { type: "text", text: "The table shows prices." },
    {
      type: "table",
      headers: ["Year", "CPI"],
      rows: [
        ["1", "100"],
        ["2", "110"],
      ],
    },
    { type: "text", text: "Use the table." },
  ]);
});

it("keeps escaped pipes inside table cells", () => {
  expect(
    blocks(String.raw`| Mean \|Δ\| | Cost |
| --- | --- |
| 0.5 | $1 |`),
  ).toEqual([
    { type: "table", headers: ["Mean |Δ|", "Cost"], rows: [["0.5", "$1"]] },
  ]);
});
