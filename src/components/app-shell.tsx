"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import {
  History,
  Cards,
  Book,
  Dashboard,
  Message,
  Paper,
  SignOut,
  Pen,
  Target,
  User,
  Users,
  Wallet,
  Sprint,
  QuestionFile,
  type Icon,
} from "@/components/icons";
import { signOut } from "@/app/(auth)/actions";
import { Logo } from "@/components/logo";
import { HeaderFeedback } from "@/components/feedback-widget";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

type NavItem = { label: string; href: string; icon: Icon };
export const nav: Record<
  "student" | "admin",
  { label: string; items: NavItem[] }[]
> = {
  student: [
    {
      label: "Practise",
      items: [
        { label: "Home", href: "/student", icon: Dashboard },
        { label: "Topic Sprint", href: "/student/sprint", icon: Sprint },
        { label: "Flashcards", href: "/student/flashcards", icon: Cards },
        { label: "Mark my answer", href: "/student/mark", icon: Pen },
      ],
    },
    {
      label: "Track",
      items: [
        { label: "Activity", href: "/student/activity", icon: History },
        { label: "Progress", href: "/student/progress", icon: Target },
      ],
    },
  ],
  admin: [
    {
      label: "Overview",
      items: [{ label: "Dashboard", href: "/admin", icon: Dashboard }],
    },
    {
      label: "Students",
      items: [{ label: "All students", href: "/admin/students", icon: Users }],
    },
    {
      label: "Content",
      items: [
        {
          label: "Questions",
          href: "/admin/content/questions",
          icon: QuestionFile,
        },
        { label: "Flashcards", href: "/admin/content/flashcards", icon: Cards },
        { label: "Papers", href: "/admin/content/papers", icon: Paper },
      ],
    },
    {
      label: "Marking",
      items: [
        { label: "Review queue", href: "/admin/marking/review", icon: Pen },
        { label: "Accuracy", href: "/admin/marking/accuracy", icon: Target },
        { label: "Engine", href: "/admin/marking/engine", icon: Book },
      ],
    },
    {
      label: "Feedback",
      items: [{ label: "Inbox", href: "/admin/feedback", icon: Message }],
    },
    {
      label: "Spend",
      items: [{ label: "AI spend", href: "/admin/spend", icon: Wallet }],
    },
  ],
};

/** The nav item a path belongs to: exact for section roots, prefix otherwise. */
export function activeItem(kind: keyof typeof nav, path: string) {
  const items = nav[kind].flatMap((g) => g.items);
  const root = items[0].href;
  return items.find((i) =>
    i.href === root
      ? path === root
      : path === i.href || path.startsWith(`${i.href}/`),
  );
}

const initials = (name: string | null) =>
  (name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

export function AppShell({
  kind,
  name,
  badges = {},
  defaultOpen,
  children,
}: {
  kind: keyof typeof nav;
  name: string | null;
  badges?: Record<string, number>;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const active = activeItem(kind, path);
  const signOutForm = useRef<HTMLFormElement>(null);
  const home = nav[kind][0].items[0].href;
  const pageLabel =
    active?.label ?? (path.startsWith("/student/profile") ? "Profile" : "");
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <a
        className="sr-only z-50 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        href="#main"
      >
        Skip to content
      </a>
      <Sidebar collapsible="icon">
        <SidebarHeader className="border-sidebar-border h-16 justify-center border-b px-5 group-data-[collapsible=icon]:px-0">
          <Link
            href={home}
            aria-label={kind === "admin" ? "Claro admin" : "Claro home"}
            className="flex justify-start group-data-[collapsible=icon]:justify-center"
          >
            <Logo wordClassName="group-data-[collapsible=icon]:hidden" />
          </Link>
        </SidebarHeader>
        <SidebarContent className="py-2">
          <nav
            aria-label={
              kind === "admin" ? "Admin navigation" : "Main navigation"
            }
          >
            {nav[kind].map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const isActive = item === active;
                    const badge = badges[item.href];
                    return (
                      <SidebarMenuItem key={item.href}>
                        {isActive && (
                          <span
                            aria-hidden
                            className="bg-sidebar-primary absolute top-2 -left-3 h-6 w-[3px] rounded-full group-data-[collapsible=icon]:hidden"
                          />
                        )}
                        <SidebarMenuButton
                          isActive={isActive}
                          tooltip={item.label}
                          render={
                            <Link
                              href={item.href}
                              aria-label={item.label}
                              aria-current={isActive ? "page" : undefined}
                            />
                          }
                        >
                          <item.icon strokeWidth={1.75} />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                        {!!badge && (
                          <SidebarMenuBadge
                            aria-label={`${badge} ${kind === "admin" ? "open" : "due"}`}
                          >
                            {badge}
                          </SidebarMenuBadge>
                        )}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroup>
            ))}
          </nav>
        </SidebarContent>
        <SidebarFooter className="border-sidebar-border border-t px-3 py-3">
          {kind === "admin" && (
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Open student app"
                  render={
                    <Link href="/student" aria-label="Open student app" />
                  }
                >
                  <Sprint />
                  <span>Open student app</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          )}
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                tooltip={name ?? "Profile"}
                render={<Link href="/student/profile" aria-label="Profile" />}
              >
                <Avatar>
                  <AvatarFallback className="bg-accent text-ink font-semibold">
                    {initials(name)}
                  </AvatarFallback>
                </Avatar>
                <span className="grid min-w-0 leading-tight">
                  <span className="text-foreground truncate font-semibold">
                    {name ?? "Your account"}
                  </span>
                  <span className="text-muted-foreground truncate text-xs font-normal">
                    {kind === "admin" ? "Admin" : "Student"}
                  </span>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-white px-4 md:px-6">
          <SidebarTrigger className="-ml-1" />
          <p className="truncate text-sm font-semibold">{pageLabel}</p>
          {kind === "student" && <HeaderFeedback />}
          <form ref={signOutForm} action={signOut} className="hidden" />
          <DropdownMenu>
            <DropdownMenuTrigger
              className={`ml-auto rounded-full ${kind === "student" ? "max-lg:ml-0" : ""}`}
              aria-label="Account menu"
            >
              <Avatar className="size-9">
                <AvatarFallback className="bg-accent text-ink font-semibold">
                  {initials(name)}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem render={<Link href="/student/profile" />}>
                <User />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => signOutForm.current?.requestSubmit()}
              >
                <SignOut />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <div
          id="main"
          className="mx-auto w-full max-w-[1280px] min-w-0 flex-1 px-4 py-6 md:px-6"
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
