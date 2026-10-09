import { pageMetadata } from "@/lib/page-metadata";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPaper } from "@/lib/admin-papers";
import { loadTopics } from "@/lib/admin-content";
import { PageHeader } from "@/components/page-header";
import { PaperBuilder } from "@/components/paper-builder";

export const metadata = pageMetadata("Paper builder");

export default async function PaperPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [loaded, topics] = await Promise.all([loadPaper(id), loadTopics()]);
  if (!loaded) notFound();
  return (
    <div className="min-w-0 space-y-4 [overflow-wrap:anywhere]">
      <Link href="/admin/content/papers" className="text-sm underline">
        Back to papers
      </Link>
      <PageHeader
        eyebrow={loaded.paper.source ?? "Paper"}
        title={loaded.paper.title}
      />
      <PaperBuilder
        key={loaded.paper.updated_at}
        loaded={loaded}
        topics={topics}
      />
    </div>
  );
}
