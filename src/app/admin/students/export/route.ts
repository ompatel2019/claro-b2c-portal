import { loadStudentRows } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/auth";
import { sydneyDay } from "@/lib/admin";
import { filterStudents, studentsCsv } from "@/lib/students";

/** "Export CSV" with the list's current filters (§4.2). */
export async function GET(request: Request) {
  await requireAdmin();
  const params = new URL(request.url).searchParams;
  const f = Object.fromEntries(
    Array.from(params.keys(), (key) => [key, params.get(key)!]),
  );
  const rows = filterStudents(
    await loadStudentRows(),
    f,
    sydneyDay,
    sydneyDay(new Date()),
  );
  return new Response(studentsCsv(rows), {
    headers: {
      "cache-control": "private, no-store",
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="students.csv"',
    },
  });
}
