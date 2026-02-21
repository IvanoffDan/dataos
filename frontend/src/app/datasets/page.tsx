"use client";

import { AuthGuard } from "@/components/auth-guard";

function DatasetList() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4 text-[var(--primary)]">Datasets</h1>
      <p className="text-[var(--muted-foreground)]">Dataset management — coming soon.</p>
    </div>
  );
}

export default function DatasetsPage() {
  return (
    <AuthGuard>
      <DatasetList />
    </AuthGuard>
  );
}
