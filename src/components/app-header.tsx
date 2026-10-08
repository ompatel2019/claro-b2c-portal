import { signOut } from "@/app/(auth)/actions";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export function AppHeader({ name }: { name: string | null }) {
  return (
    <header className="border-line flex items-center justify-between border-b px-6 py-4">
      <Logo />
      <div className="flex items-center gap-4 text-sm">
        <span className="text-muted-foreground">{name}</span>
        <form action={signOut}>
          <Button type="submit" variant="outline" className="rounded-full px-4">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
