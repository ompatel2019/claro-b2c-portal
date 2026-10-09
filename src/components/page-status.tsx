"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Button, buttonVariants } from "./ui/button";

/** Opt-in page states, without changing the shipped shells. */
export function PageStatus({
  children,
  shortcutsCopy,
}: {
  children: React.ReactNode;
  shortcutsCopy?: string;
}) {
  const path = usePathname();
  const [offline, setOffline] = useState(false);
  const [expired, setExpired] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  useEffect(() => {
    const online = () => setOffline(!navigator.onLine);
    online();
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    const key = (e: KeyboardEvent) => {
      if (
        e.key === "?" &&
        !(e.target as HTMLElement).closest(
          "input, textarea, select, [contenteditable=true]",
        )
      ) {
        e.preventDefault();
        setShortcuts(true);
      }
    };
    window.addEventListener("keydown", key);
    const { data } = createClient().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setExpired(true);
    });
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      window.removeEventListener("keydown", key);
      data.subscription.unsubscribe();
    };
  }, []);
  return (
    <>
      {offline && (
        <p role="status" className="bg-muted mb-4 rounded-lg px-4 py-2 text-sm">
          {"You're offline. We'll save when you're back."}
        </p>
      )}
      {children}
      <Dialog open={shortcuts} onOpenChange={setShortcuts}>
        <DialogContent>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            {shortcutsCopy ??
              `${path !== "/admin/content/questions" ? "⌘S / Ctrl+S: Save. " : ""}?: Show shortcuts. Esc: Close overlays.`}
          </DialogDescription>
        </DialogContent>
      </Dialog>
      <Dialog open={expired} onOpenChange={setExpired}>
        <DialogContent>
          <DialogTitle>Session expired</DialogTitle>
          <DialogDescription>
            Sign in in a new tab, then return here. Your unsaved edits stay on
            this page.
          </DialogDescription>
          <Link
            href="/sign-in"
            target="_blank"
            rel="noopener"
            className={buttonVariants()}
          >
            Sign in
          </Link>
          <Button
            variant="outline"
            onClick={async () => {
              const { data } = await createClient().auth.getUser();
              if (data.user) setExpired(false);
            }}
          >
            Continue editing
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
