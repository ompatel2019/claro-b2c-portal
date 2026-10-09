import { blocks, imageParts } from "@/lib/markdown-table";

/** Renders question stems/stimuli, turning GFM pipe tables into real HTML tables. */
export function RichText({
  text,
  className,
  renderImages = false,
}: {
  text: string;
  className?: string;
  renderImages?: boolean;
}) {
  return (
    <div className={className}>
      {blocks(text).map((block, i) =>
        block.type === "text" ? (
          renderImages ? (
            <div key={i} className="min-w-0 break-words whitespace-pre-wrap">
              {imageParts(block.text).map((part, j) =>
                part.url ? (
                  // Public stimulus assets may be hosted outside the app's image domains.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={j}
                    src={part.url}
                    alt={part.text}
                    loading="lazy"
                    className="my-3 h-auto max-w-full rounded-lg"
                  />
                ) : (
                  <span key={j}>{part.text}</span>
                ),
              )}
            </div>
          ) : (
            <p key={i} className="whitespace-pre-wrap">
              {block.text}
            </p>
          )
        ) : (
          <div key={i} className="my-4 overflow-x-auto">
            <table className="border-line w-full min-w-[20rem] border-collapse text-left text-sm">
              <thead>
                <tr className="bg-paper">
                  {block.headers.map((h, j) => (
                    <th
                      key={j}
                      className="border-line border px-3 py-2 font-semibold"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) => (
                      <td key={c} className="border-line border px-3 py-2">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      )}
    </div>
  );
}
