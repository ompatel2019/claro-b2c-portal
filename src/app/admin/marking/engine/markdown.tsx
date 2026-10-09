import { Fragment, type ReactNode } from "react";
import { blocks } from "@/lib/markdown-table";

/** Raw HTML stays text. Only http(s), mailto and local links become anchors. */
function safeHref(href: string) {
  return /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(href) ? href : undefined;
}
function inline(text: string): ReactNode[] {
  const pattern =
    /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^\s)]+\))/g;
  const output: ReactNode[] = [];
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    output.push(text.slice(start, match.index));
    const token = match[0];
    const key = match.index;
    if (token.startsWith("`"))
      output.push(
        <code key={key} className="bg-muted rounded px-1 text-[0.9em]">
          {token.slice(1, -1)}
        </code>,
      );
    else if (token.startsWith("**") || token.startsWith("__"))
      output.push(<strong key={key}>{inline(token.slice(2, -2))}</strong>);
    else if (token.startsWith("[")) {
      const link = /^\[([^\]]+)\]\((.+)\)$/.exec(token)!;
      const href = safeHref(link[2]);
      output.push(
        href ? (
          <a key={key} href={href} className="underline">
            {inline(link[1])}
          </a>
        ) : (
          <Fragment key={key}>{link[1]}</Fragment>
        ),
      );
    } else output.push(<em key={key}>{inline(token.slice(1, -1))}</em>);
    start = match.index! + token.length;
  }
  output.push(text.slice(start));
  return output;
}
function prose(text: string): ReactNode[] {
  const lines = text.split("\n");
  const nodes: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const Heading = `h${Math.min(heading[1].length + 1, 6)}` as
        "h2" | "h3" | "h4" | "h5" | "h6";
      nodes.push(
        <Heading key={i} className="mt-6 text-lg font-semibold first:mt-0">
          {inline(heading[2])}
        </Heading>,
      );
      i++;
      continue;
    }
    const list = /^\s*(?:[-*+] |\d+\. )/.exec(line);
    if (list) {
      const ordered = /^\s*\d+\./.test(line);
      const List = ordered ? "ol" : "ul";
      const entries: ReactNode[] = [];
      while (
        i < lines.length &&
        /^\s*(?:[-*+] |\d+\. )/.test(lines[i]) &&
        /^\s*\d+\./.test(lines[i]) === ordered
      ) {
        entries.push(
          <li key={i}>
            {inline(lines[i].replace(/^\s*(?:[-*+] |\d+\. )/, ""))}
          </li>,
        );
        i++;
      }
      nodes.push(
        <List
          key={`list-${i}`}
          className={
            ordered ? "list-decimal space-y-1 pl-6" : "list-disc space-y-1 pl-6"
          }
        >
          {entries}
        </List>,
      );
      continue;
    }
    const paragraph: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6})\s|^\s*(?:[-*+] |\d+\. )/.test(lines[i])
    ) {
      paragraph.push(lines[i]);
      i++;
    }
    nodes.push(
      <p key={`p-${i}`} className="whitespace-pre-wrap">
        {inline(paragraph.join("\n"))}
      </p>,
    );
  }
  return nodes;
}
function content(text: string) {
  return blocks(text).map((block, i) =>
    block.type === "text" ? (
      <Fragment key={`text-${i}`}>{prose(block.text)}</Fragment>
    ) : (
      <div key={`table-${i}`} className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-80 border-collapse text-left text-sm">
          <thead>
            <tr>
              {block.headers.map((cell, c) => (
                <th
                  key={c}
                  className="min-w-32 border px-3 py-2 break-normal wrap-normal"
                >
                  {inline(cell)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className="min-w-32 border px-3 py-2 break-normal wrap-normal"
                  >
                    {inline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  );
}
export function Markdown({ text }: { text: string }) {
  // Split fences first so table/list syntax inside code is never interpreted.
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let proseLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const fence = /^\s*(`{3,}|~{3,})/.exec(lines[i]);
    if (!fence) {
      proseLines.push(lines[i]);
      continue;
    }
    nodes.push(
      <Fragment key={`prose-${i}`}>{content(proseLines.join("\n"))}</Fragment>,
    );
    proseLines = [];
    const code: string[] = [];
    const closing = new RegExp(`^\\s*${fence[1][0]}{${fence[1].length},}\\s*$`);
    while (++i < lines.length && !closing.test(lines[i])) code.push(lines[i]);
    nodes.push(
      <pre
        key={`code-${i}`}
        className="bg-muted min-w-0 overflow-x-auto rounded-lg p-3 text-sm"
      >
        <code>{code.join("\n")}</code>
      </pre>,
    );
  }
  nodes.push(<Fragment key="last">{content(proseLines.join("\n"))}</Fragment>);
  return (
    <div className="min-w-0 space-y-4 text-sm leading-relaxed wrap-anywhere">
      {nodes}
    </div>
  );
}
