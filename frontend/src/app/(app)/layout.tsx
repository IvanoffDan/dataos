"use client";

import { Nav } from "@/components/nav";
import { AuthGuard } from "@/components/auth-guard";
import { Providers } from "@/components/providers";

const AppLayout = ({ children }: { children: React.ReactNode }) => (
  <Providers>
    <AuthGuard>
      <div className="flex min-h-screen">
        <Nav />
        <main className="flex-1 bg-[var(--background)] p-8 max-w-5xl mx-auto">
          {children}
        </main>
      </div>
    </AuthGuard>
  </Providers>
);

export default AppLayout;
