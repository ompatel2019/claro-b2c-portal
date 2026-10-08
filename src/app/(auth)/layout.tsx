import { Logo } from "@/components/logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-5 py-12">
      <Logo />
      <div className="rounded-panel border-line w-full max-w-md border bg-white p-8 shadow-[0_18px_50px_-30px_#1e223d55] sm:p-10">
        {children}
      </div>
      <p className="font-hand text-muted-foreground text-xl">
        HSC Economics, marked in seconds.
      </p>
    </main>
  );
}
