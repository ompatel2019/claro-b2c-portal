import { requireAdmin } from "@/lib/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadQuestion, loadTopics } from "@/lib/admin-questions";
import { PageHeader } from "@/components/page-header";
import { QuestionEditor } from "@/components/question-editor";

/** §4.4 editor; /new creates a Claro-origin draft. */
export default async function QuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const [loaded, topics] = await Promise.all([
    id === "new" ? null : loadQuestion(id),
    loadTopics(),
  ]);
  if (id !== "new" && !loaded) notFound();
  return (
    <div className="space-y-4">
      <Link href="/admin/content/questions" className="text-sm underline">
        Back to questions
      </Link>
      <PageHeader
        eyebrow={loaded ? loaded.question.source : "New question"}
        title={loaded ? loaded.question.id : "New question"}
      />
      <QuestionEditor
        key={loaded?.question.updated_at ?? "new"}
        loaded={loaded}
        topics={topics}
      />
    </div>
  );
}
