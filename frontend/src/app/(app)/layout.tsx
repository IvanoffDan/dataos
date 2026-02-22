"use client";

import { Nav } from "@/components/nav";
import { AuthGuard } from "@/components/auth-guard";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen">
        <Nav />
        <main className="flex-1 bg-[var(--background)] p-8 max-w-5xl mx-auto">
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}
