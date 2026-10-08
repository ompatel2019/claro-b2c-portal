import { blocks } from "@/lib/markdown-table";

/** Renders question stems/stimuli, turning GFM pipe tables into real HTML tables. */
export function RichText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <div className={className}>
      {blocks(text).map((block, i) =>
        block.type === "text" ? (
          <p key={i} className="whitespace-pre-wrap">
            {block.text}
          </p>
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
