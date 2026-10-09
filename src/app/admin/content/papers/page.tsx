import { pageMetadata } from "@/lib/page-metadata";
import { requireAdmin } from "@/lib/auth";
import { paperListPage } from "@/lib/paper-list";
import { Paper } from "@/components/icons";
import { loadPaperList } from "@/lib/admin-papers";
import { singleParams } from "@/lib/admin";
import { createPaper } from "./actions";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PapersTable } from "@/components/papers-table";
import { FilterBar } from "@/components/filter-bar";
import { Button } from "@/components/ui/button";

export const metadata = pageMetadata("Papers");

export default async function PapersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const f = singleParams(await searchParams);
  const all = await loadPaperList();
  const { rows, pager } = paperListPage(all, f);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Papers"
        description="Mock papers built from bank questions. A1 trials arrive as drafts."
        actions={
          <form action={createPaper}>
            <Button type="submit">New paper</Button>
          </form>
        }
      />
      <FilterBar
        filters={[
          { name: "q", label: "Search", placeholder: "Search papers or IDs" },
          {
            name: "status",
            label: "Status",
            all: "All statuses",
            options: [
              { value: "draft", label: "Draft" },
              { value: "live", label: "Live" },
              { value: "retired", label: "Retired" },
            ],
          },
        ]}
        values={f}
        hidden={{ sort: f.sort, dir: f.dir }}
      />
      {pager.total ? (
        <PapersTable rows={rows} pager={pager} />
      ) : (
        <EmptyState
          icon={Paper}
          title={all.length ? "No papers match" : "No papers yet"}
          description={
            all.length
              ? "Try different filters or clear them."
              : "Start a new paper and add questions from the bank."
          }
        />
      )}
    </div>
  );
}
