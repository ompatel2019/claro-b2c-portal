import Link from "next/link";
import { loadStudents } from "@/lib/admin-data";
import { dateLabel } from "@/lib/practice";

export default async function StudentsPage() {
  const students = await loadStudents();
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-5 py-8">
      <h1>Students</h1>
      <p>{students.length} students</p>
      {!students.length ? (
        <p className="panel p-6">No students yet.</p>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-line border-b">
                <th className="p-3">Name</th>
                <th className="p-3">Email</th>
                <th className="p-3">Joined</th>
                <th className="p-3">Sessions</th>
                <th className="p-3">Avg</th>
                <th className="p-3">Last active</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="border-line border-t">
                  <td className="p-3">
                    <Link
                      className="underline"
                      href={`/admin/students/${s.id}`}
                    >
                      {s.full_name || "Unnamed"}
                    </Link>
                  </td>
                  <td className="p-3 break-all">{s.email || "—"}</td>
                  <td className="p-3">{dateLabel(s.joined)}</td>
                  <td className="p-3">{s.sessions}</td>
                  <td className="p-3">
                    {s.average_pct == null ? "—" : `${s.average_pct}%`}
                  </td>
                  <td className="p-3">
                    {s.last_active ? dateLabel(s.last_active) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
