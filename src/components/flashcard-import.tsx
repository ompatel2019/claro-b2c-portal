"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  deleteCards,
  importCards,
  reviewCards,
} from "@/app/admin/content/flashcards/actions";
import type { Topic } from "@/lib/practice";
import { CardImportDialog } from "./card-import-dialog";
import { Button } from "./ui/button";

/** §4.5 uses the shared §3.7 importer with admin-guarded writes and shared-card dedupe. */
export function FlashcardImport({ topics }: { topics: Topic[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Import CSV
      </Button>
      {open && (
        <CardImportDialog
          topics={topics.filter((t) => t.parent_id)}
          ownFronts={[]}
          shared={{
            review: reviewCards,
            save: importCards,
            undo: async (ids, version) => {
              const result = await deleteCards(ids, version);
              router.refresh();
              return result;
            },
          }}
          onClose={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
