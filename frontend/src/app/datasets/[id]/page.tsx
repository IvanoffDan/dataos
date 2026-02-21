"use client";

import { AuthGuard } from "@/components/auth-guard";
import { useParams } from "next/navigation";

function DatasetDetail() {
  const params = useParams();
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4 text-[var(--primary)]">Dataset #{params.id}</h1>
      <p className="text-[var(--muted-foreground)]">
        Dataset detail with mappings — coming soon.
      </p>
    </div>
  );
}

export default function DatasetDetailPage() {
  return (
    <AuthGuard>
      <DatasetDetail />
    </AuthGuard>
  );
}
