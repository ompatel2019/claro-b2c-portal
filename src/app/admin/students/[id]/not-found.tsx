import Link from "next/link";
import { SearchOff } from "@/components/icons";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";
export default function NotFound() {
  return (
    <EmptyState
      icon={SearchOff}
      title="Student not found"
      description="This student or selected item is unavailable."
      action={
        <Link href="/" className={buttonVariants()}>
          Back to home
        </Link>
      }
    />
  );
}
