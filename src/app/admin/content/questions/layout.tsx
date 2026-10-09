import { requireAdmin } from "@/lib/auth";
import { PageStatus } from "@/components/page-status";
export default async function QuestionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  return <PageStatus>{children}</PageStatus>;
}
