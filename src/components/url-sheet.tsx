"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";

/** A server-rendered detail sheet whose selection and close state live in the URL. */
export function UrlSheet({
  parameter,
  title,
  children,
}: {
  parameter: string;
  title: string;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (open) return;
        const next = new URLSearchParams(params.toString());
        next.delete(parameter);
        router.push(`${path}?${next}`, { scroll: false });
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="min-w-0 space-y-4 px-4 pb-6 break-words">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
