import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Help } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button";
export default function NotFound() {
  return (
    <EmptyState
      icon={Help}
      title="Profile not found"
      description="We couldn't find your profile."
      action={
        <Link
          href="/student"
          className={buttonVariants({ variant: "outline" })}
        >
          Back to home
        </Link>
      }
    />
  );
}
