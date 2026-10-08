import { Users } from "lucide-react";
import { loadStudents } from "@/lib/admin-data";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StudentsTable } from "@/components/students-table";

export default async function StudentsPage() {
  const students = await loadStudents();
  return (
    <div className="space-y-4">
      <PageHeader
        title="Students"
        description={`${students.length} students`}
      />
      {students.length ? (
        <StudentsTable students={students} />
      ) : (
        <EmptyState
          icon={Users}
          title="No students yet"
          description="Students appear here after they sign up."
        />
      )}
    </div>
  );
}
