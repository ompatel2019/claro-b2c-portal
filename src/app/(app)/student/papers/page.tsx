import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { pages } from "@/lib/flashcard-data";
import { scoreTone } from "@/lib/practice";
import { createClient } from "@/utils/supabase/server";
import {
  paperRows,
  paperSourceOptions,
  paperStatusOptions,
  studentPaperFilter,
  type Paper,
  type PaperSit,
} from "@/lib/papers";
import { PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/filter-bar";
import { EmptyState } from "@/components/empty-state";
import { QuestionFile } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/status-pill";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";

async function loadPapers(userId: string) {
  const db = await createClient();
  // Page through reads so Supabase's row cap cannot silently drop older sits/best marks.
  const [papers, sits] = await Promise.all([
    pages<Paper>((from, to) =>
      db
        .from("papers")
        .select("id,title,year,origin,time_limit_min,total_marks")
        // Live papers, plus drafts an admin listed this account on (QA previews).
        .or(studentPaperFilter(userId))
        .order("year", { ascending: false, nullsFirst: false })
        .order("title")
        .order("id")
        .range(from, to),
    ),
    pages<PaperSit>((from, to) =>
      db
        .from("sessions")
        .select("id,paper_id,started_at,finished_at,config,score,max_score")
        .eq("kind", "paper")
        .eq("user_id", userId)
        .order("started_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
  ]);
  return { papers, sits, now: Date.now() };
}

export const metadata = pageMetadata("Papers");

export default async function Papers({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireProfile();
  const params = await searchParams;
  const filters = {
    source: paperSourceOptions.find((o) => o.value === params.source)?.value,
    status: paperStatusOptions.find((o) => o.value === params.status)?.value,
  };
  const { papers, sits, now } = await loadPapers(profile.id);
  const rows = paperRows(papers, sits, filters, now);
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title="Mock papers"
        description="Sit a full HSC paper under exam conditions. Marked as soon as you finish."
      />
      <FilterBar
        values={filters}
        filters={[
          {
            name: "source",
            label: "Source",
            all: "All",
            options: paperSourceOptions,
          },
          {
            name: "status",
            label: "Status",
            all: "All",
            options: paperStatusOptions,
          },
        ]}
      />
      {!papers.length ? (
        <EmptyState
          icon={QuestionFile}
          title="Mock papers are on their way."
          description="Topic Sprints cover the same questions in the meantime."
          action={
            <Link href="/student/sprint" className={buttonVariants()}>
              Start sprint
            </Link>
          }
        />
      ) : !rows.length ? (
        <EmptyState
          icon={QuestionFile}
          title="No papers match these filters"
          description="Try another source or status to find a paper."
        />
      ) : (
        <Card className="gap-0 py-0">
          <Table aria-label="Mock papers">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Paper</TableHead>
                <TableHead scope="col">Year</TableHead>
                <TableHead scope="col">Time</TableHead>
                <TableHead scope="col">Marks</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((paper) => (
                <TableRow key={paper.id} className="h-14">
                  <TableCell>
                    <Link
                      href={paper.actions[0].href}
                      className="font-semibold hover:underline"
                    >
                      {paper.title}
                    </Link>
                  </TableCell>
                  <TableCell>{paper.year ?? "Year not listed"}</TableCell>
                  <TableCell>{paper.time_limit_min} min</TableCell>
                  <TableCell>{paper.total_marks}</TableCell>
                  <TableCell className="tabular-nums">
                    <div className="flex items-center gap-2">
                      {paper.status === "in-progress" && (
                        <StatusPill pill="In progress" />
                      )}
                      <span>{paper.statusLabel}</span>
                      {paper.scorePercentage !== null && (
                        <Badge variant={scoreTone(paper.scorePercentage)}>
                          {Math.round(paper.scorePercentage)}%
                        </Badge>
                      )}
                    </div>
                    {paper.best && (
                      <p className="text-muted-foreground text-xs">
                        {paper.best}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {paper.actions.map((action, index) => (
                        <Link
                          key={action.label}
                          href={action.href}
                          aria-label={`${action.label}: ${paper.title}`}
                          className={buttonVariants({
                            variant: index ? "outline" : "default",
                          })}
                        >
                          {action.label}
                        </Link>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
