"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Pager } from "@/lib/admin";
import { Button } from "./ui/button";

/** URL pager shared by DataTable and the import comparison cards. */
export function TablePagination({
  pager,
  label,
}: {
  pager: Pager;
  label: string;
}) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const go = (page: number) => {
    const next = new URLSearchParams(params.toString());
    next.set("page", String(page));
    router.push(`${path}?${next}`, { scroll: false });
  };
  return (
    <nav
      aria-label={`${label} pagination`}
      className="flex flex-wrap items-center justify-between gap-2 text-sm"
    >
      <span aria-live="polite">
        Page {pager.page} of {pager.pages} · {pager.total} rows
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={pager.page <= 1}
          onClick={() => go(pager.page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          disabled={pager.page >= pager.pages}
          onClick={() => go(pager.page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
