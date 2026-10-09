import { requireAdmin } from "@/lib/auth";
import { PageStatus } from "@/components/page-status";
export default async function FeedbackLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  return (
    <PageStatus shortcutsCopy="⌘K: Search. ⌘B: Toggle sidebar. ?: Show shortcuts. Esc: Close overlays.">
      {children}
    </PageStatus>
  );
}
