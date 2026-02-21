"use client";

import { useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    api("/api/auth/me")
      .then((res) => {
        if (!res.ok) throw new Error("Not authenticated");
        setChecked(true);
      })
      .catch(() => {
        router.replace("/login");
      });
  }, [router]);

  if (!checked) return null;
  return <>{children}</>;
}
