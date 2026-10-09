import Link from "next/link";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
export default function NotFound() {
  return (
    <Card className="space-y-3 p-5">
      <h1 className="font-semibold">Check not found</h1>
      <p>{"This check isn't available."}</p>
      <Link href="/student" className={buttonVariants()}>
        Back to home
      </Link>
    </Card>
  );
}
