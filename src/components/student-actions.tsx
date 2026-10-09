"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { More } from "@/components/icons";
import { openSpotCheck, setBlocked } from "@/app/admin/students/actions";
import { Button } from "./ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

/** §4.3 ⋯ menu: Block sign-in / Unblock behind an AlertDialog. */
export function StudentMenu({
  userId,
  blocked,
}: {
  userId: string;
  blocked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="icon" />}
          aria-label="More actions"
        >
          <More />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            variant={blocked ? "default" : "destructive"}
            onClick={() => {
              setError(null);
              setOpen(true);
            }}
          >
            {blocked ? "Unblock" : "Block sign-in"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogTitle className="text-base font-semibold">
            {blocked ? "Unblock this student?" : "Block sign-in?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {blocked
              ? "They will be able to sign in again."
              : "They won’t be able to sign in. No data is deleted."}
          </AlertDialogDescription>
          {error && <p role="alert">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button
              variant={blocked ? "default" : "destructive"}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  try {
                    await setBlocked(userId, !blocked);
                    setOpen(false);
                    toast.success(blocked ? "Unblocked" : "Sign-in blocked", {
                      duration: 4000,
                      action: {
                        label: "Undo",
                        onClick: () => {
                          start(async () => {
                            try {
                              await setBlocked(userId, blocked);
                              toast.success("Sign-in change undone", {
                                duration: 4000,
                              });
                            } catch {
                              toast.error("Couldn't undo this. Try again.");
                            }
                          });
                        },
                      },
                    });
                  } catch {
                    setError("Couldn’t update sign-in. Try again.");
                  }
                })
              }
            >
              {blocked ? "Unblock" : "Block sign-in"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** "Open in review" on a written attempt: creates a spot_check review. */
export function SpotCheck({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await openSpotCheck(attemptId).catch(() => ({
              error: "Couldn’t open a review. Try again.",
            }));
            if ("error" in r) setError(r.error);
            else router.push(`/admin/marking/review/${r.id}`);
          })
        }
      >
        {pending ? "Opening…" : "Open in review"}
      </Button>
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
