/** Split text into paragraphs and GFM pipe tables, for rendering stems/stimuli. */
export type Block =
  | { type: "text"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] };

function cells(line: string) {
  return line
    .replace(/^\||\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, "|"));
}

function isDivider(line: string) {
  return /^\|?[\s:|-]+\|[\s:|-]+\|?$/.test(line.trim()) && /-+/.test(line);
}

export function blocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.includes("|") && i + 1 < lines.length && isDivider(lines[i + 1])) {
      const headers = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(cells(lines[i]));
        i += 1;
      }
      out.push({ type: "table", headers, rows });
      continue;
    }
    const start = i;
    while (
      i < lines.length &&
      !(
        lines[i].includes("|") &&
        i + 1 < lines.length &&
        isDivider(lines[i + 1])
      )
    )
      i += 1;
    const text = lines
      .slice(start, i)
      .join("\n")
      .replace(/^\n+|\n+$/g, "");
    if (text.trim()) out.push({ type: "text", text });
  }
  return out;
}
