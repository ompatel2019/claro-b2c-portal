import { Logo } from "@/components/logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-10">
      <Logo />
      <div className="bg-card w-full max-w-md rounded-lg border p-6 sm:p-8">
        {children}
      </div>
      <p className="text-muted-foreground text-sm">
        HSC Economics, marked in seconds.
      </p>
    </main>
  );
}
