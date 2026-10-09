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

/** Markdown image links for QuestionView; unsafe protocols stay literal text. */
export function imageParts(text: string): { text: string; url?: string }[] {
  const parts: { text: string; url?: string }[] = [];
  const pattern = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
  let from = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > from) parts.push({ text: text.slice(from, match.index) });
    parts.push({ text: match[1], url: match[2] });
    from = match.index + match[0].length;
  }
  if (from < text.length) parts.push({ text: text.slice(from) });
  return parts;
}
