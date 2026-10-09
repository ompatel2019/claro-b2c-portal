import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Markdown } from "./markdown";

it("renders headings, paragraphs, lists, code, tables and inline formatting", () => {
  const { container } = render(
    <Markdown
      text={
        '# Engine\n\n## Rules\n\nA **bold** and *italic* paragraph with `code` and [guide](https://example.com).\n\n- First\n- Second\n\n1. Ordered\n2. Next\n\n| Pass | Effort |\n| --- | --- |\n| **Grade** | low |\n\n```ts\nconst x = "<tag>";\n| not | a table |\n```'
      }
    />,
  );
  expect(
    screen.getByRole("heading", { level: 2, name: "Engine" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { level: 3, name: "Rules" }),
  ).toBeInTheDocument();
  expect(container.querySelector("strong")).toHaveTextContent("bold");
  expect(container.querySelector("em")).toHaveTextContent("italic");
  expect(screen.getAllByRole("list")).toHaveLength(2);
  expect(screen.getAllByRole("listitem")).toHaveLength(4);
  expect(screen.getByRole("table")).toHaveTextContent("Grade");
  expect(screen.getByRole("link", { name: "guide" })).toHaveAttribute(
    "href",
    "https://example.com",
  );
  expect(container.querySelector("pre code")).toHaveTextContent(
    'const x = "<tag>";',
  );
});
it("escapes raw HTML everywhere and refuses executable links", () => {
  const text =
    "# <script>alert(1)</script>\n\n<img src=x onerror=alert(1)> **<b>raw</b>** [bad](javascript:alert) [bad2](data:text/html,x) [bad3](//evil.test)\n\n| X | Y |\n| --- | --- |\n| <iframe> | <svg/onload=x> |\n\n```\n</code><script>alert(1)</script>\n```";
  const { container } = render(<Markdown text={text} />);
  expect(container.querySelector("script,img,iframe,svg,b")).toBeNull();
  expect(container.querySelectorAll("a")).toHaveLength(0);
  expect(container).toHaveTextContent("<img src=x onerror=alert(1)>");
  const html = renderToStaticMarkup(<Markdown text={text} />);
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
});
it("accepts safe local links and renders unclosed fences as code", () => {
  const { container } = render(
    <Markdown
      text={"[local](/admin) [anchor](#rules)\n\n~~~\n# not a heading\n"}
    />,
  );
  expect(screen.getByRole("link", { name: "local" })).toHaveAttribute(
    "href",
    "/admin",
  );
  expect(container.querySelector("pre")).toHaveTextContent("# not a heading");
  expect(container.querySelector("h1")).toBeNull();
});
it("caps demoted headings at h6 and gives tables their own scrolling space", () => {
  const { container } = render(
    <Markdown
      text={
        "# Page\n\n##### Five\n\n###### Six\n\n| Thinking | Result |\n| --- | --- |\n| medium | same band |"
      }
    />,
  );
  expect(container.querySelector("h1")).toBeNull();
  expect(
    screen.getByRole("heading", { level: 6, name: "Five" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { level: 6, name: "Six" }),
  ).toBeInTheDocument();
  const table = container.querySelector("table")!;
  expect(table.parentElement).toHaveClass("overflow-x-auto");
  expect(table.querySelector("th")).toHaveClass(
    "min-w-32",
    "wrap-normal",
    "break-normal",
  );
});
it("labels every body cell with its column header for the mobile layout", () => {
  const { container } = render(
    <Markdown
      text={
        "| **Pass** | Sees | Writes | Thinking |\n| --- | --- | --- | --- |\n| Grade | Answer | Feedback | low |\n| Check | Answer | Review | medium |"
      }
    />,
  );
  const table = container.querySelector("table")!;
  const headers = Array.from(table.querySelectorAll("th"));
  const rows = table.querySelectorAll("tbody tr");
  expect(rows).toHaveLength(2);
  for (const row of rows) {
    const cells = row.querySelectorAll("td");
    expect(cells).toHaveLength(headers.length);
    cells.forEach((cell, c) => {
      const label = cell.querySelector("span")!;
      expect(label).toHaveTextContent(headers[c].textContent!);
      expect(label).toHaveClass("sm:hidden");
      expect(label).toHaveAttribute("aria-hidden", "true");
    });
  }
});
