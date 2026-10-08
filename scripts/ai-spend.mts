// Export ai_usage to /workspace/claro/api-spend.csv with a running total.
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/ai-spend.mts
import { writeFileSync } from "node:fs";

import { admin } from "@/utils/supabase/admin";

const { data, error } = await admin()
  .from("ai_usage")
  .select("created_at, task, model, input_tokens, output_tokens, usd")
  .order("id");
if (error) throw error;
let total = 0;
const lines = [
  "time,task,model,input_tokens,output_tokens,usd,running_total_usd",
];
for (const r of data) {
  total += Number(r.usd);
  const time = new Date(r.created_at).toLocaleString("sv-SE", {
    timeZone: "Australia/Sydney",
  });
  lines.push(
    [
      time,
      r.task,
      r.model,
      r.input_tokens,
      r.output_tokens,
      Number(r.usd).toFixed(6),
      total.toFixed(4),
    ].join(","),
  );
}
writeFileSync(
  process.env.SPEND_CSV ?? "/workspace/claro/api-spend.csv",
  lines.join("\n") + "\n",
);
console.log(`${data.length} calls, total $${total.toFixed(4)}`);
