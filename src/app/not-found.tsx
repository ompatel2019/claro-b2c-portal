import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 items-center px-4 py-16">
      <div className="w-full">
        <EmptyState
          icon={SearchX}
          title="Page not found"
          description="This page doesn’t exist or has moved."
          action={
            <Link className={buttonVariants()} href="/">
              Go home
            </Link>
          }
        />
      </div>
    </main>
  );
}
