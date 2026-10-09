import Link from "next/link";
import { Paper } from "@/components/icons";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";
export default function NotFound() {
  return (
    <EmptyState
      icon={Paper}
      title="Paper not found"
      description="This paper doesn't exist or is no longer available."
      action={
        <Link href="/" className={buttonVariants()}>
          Back to home
        </Link>
      }
    />
  );
}
