/**
 * (app) route group — auth-gated, client-heavy.
 *
 * Middleware (`lib/auth/middleware.ts`) ensures the access
 * token is valid before this layout renders. The shell is a
 * persistent sidebar + topbar; route content fills the
 * remaining space.
 */
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@cortex/ui";

import { ThemeToggle } from "@/components/theme-toggle";
import { useAuthStore } from "@/lib/auth/store";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const { user, signOut } = useAuthStore();

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const token = sessionStorage.getItem("cortex_access_token");
    if (!token) {
      router.replace("/login");
    }
  }, [hydrated, router]);

  if (!hydrated) {
    return <div className="flex min-h-screen items-center justify-center" />;
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-muted/30 md:flex md:flex-col">
        <div className="flex h-14 items-center px-4">
          <Link href="/app" className="font-display text-lg font-semibold">
            <span className="text-spark">Cortex</span>
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-2 py-4 text-sm">
          <SidebarLink href="/app">Dashboard</SidebarLink>
          <SidebarLink href="/app/documents">Documents</SidebarLink>
          <SidebarLink href="/app/conversations">Conversations</SidebarLink>
          <SidebarLink href="/app/graph">Knowledge graph</SidebarLink>
          <SidebarLink href="/app/agents">Agents</SidebarLink>
          <SidebarLink href="/app/mcp">MCP</SidebarLink>
          <SidebarLink href="/app/settings">Settings</SidebarLink>
        </nav>
        <div className="border-t border-border p-4 text-sm">
          <div className="font-medium">{user?.email ?? "—"}</div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-start"
            onClick={() => {
              signOut();
              router.push("/login");
            }}
          >
            Sign out
          </Button>
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-end border-b border-border bg-background px-6">
          <ThemeToggle />
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}

function SidebarLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="block rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </Link>
  );
}
