import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { z } from "zod";
import { Message, SearchOff } from "@/components/icons";
import {
  loadFeedbackCounts,
  loadFeedbackItem,
  loadFeedbackList,
} from "@/lib/admin-feedback";
import { FEEDBACK_KIND, singleParams, sydneyDay } from "@/lib/admin";
import { EmptyState } from "@/components/empty-state";
import { FeedbackTable } from "@/components/feedback-table";
import { FilterBar } from "@/components/filter-bar";
import { LinkTabs } from "@/components/link-tabs";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";

const BASE = "/admin/feedback";

export const metadata = pageMetadata("Feedback inbox");

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin();
  const f = singleParams(await searchParams);
  if (f.id && !z.uuid().safeParse(f.id).success) notFound();
  const [counts, list, item] = await Promise.all([
    loadFeedbackCounts(),
    loadFeedbackList(f),
    f.id ? loadFeedbackItem(f.id) : null,
  ]);
  if (f.id && !item) notFound();
  const filtered = ["kind", "q", "shots", "from", "to"].some((k) => f[k]);
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title="Feedback"
        description="One inbox for feedback, bugs, content errors and marking complaints."
      />
      <LinkTabs
        label="Feedback status"
        active={list.status}
        tabs={[
          {
            value: "new",
            label: "New",
            count: counts.new,
            href: `${BASE}?status=new`,
          },
          {
            value: "triaged",
            label: "Triaged",
            href: `${BASE}?status=triaged`,
          },
          {
            value: "resolved",
            label: "Resolved",
            href: `${BASE}?status=resolved`,
          },
        ]}
      />
      <FilterBar
        values={f}
        hidden={{ status: list.status }}
        filters={[
          {
            name: "kind",
            label: "Kind",
            all: "Any",
            chips: true,
            options: Object.entries(FEEDBACK_KIND).map(([value, label]) => ({
              value,
              label,
            })),
          },
          { name: "q", label: "Search", placeholder: "Message or student" },
          { name: "shots", label: "Has screenshots", checkbox: true },
          {
            name: "dates",
            label: "Date range",
            dateRange: { from: "from", to: "to", today: sydneyDay(new Date()) },
          },
        ]}
      />
      {list.rows.length || item ? (
        <FeedbackTable
          rows={list.rows}
          pager={list.pager}
          status={list.status}
          item={item}
          adminId={admin.id}
          now={new Date().toISOString()}
        />
      ) : (
        <EmptyState
          icon={filtered ? SearchOff : Message}
          title={filtered ? "Nothing matches" : `No ${list.status} feedback`}
          description={
            filtered
              ? "Try another search or clear the filters."
              : "Messages from students land here."
          }
          action={
            filtered ? (
              <Link
                href={`${BASE}?status=${list.status}`}
                className={buttonVariants({ variant: "outline" })}
              >
                Clear filters
              </Link>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
