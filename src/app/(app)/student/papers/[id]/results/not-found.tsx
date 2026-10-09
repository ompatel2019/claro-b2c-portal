import Link from "next/link";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
export default function NotFound() {
  return (
    <Card className="p-5">
      <h1>Results not found</h1>
      <p>We couldn’t find this paper sit.</p>
      <Link href="/student" className={buttonVariants()}>
        Back to home
      </Link>
    </Card>
  );
}
