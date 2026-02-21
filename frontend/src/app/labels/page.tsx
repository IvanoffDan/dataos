"use client";

import { AuthGuard } from "@/components/auth-guard";

function LabelRulesList() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4 text-[var(--primary)]">Label Rules</h1>
      <p className="text-[var(--muted-foreground)]">Label rule management — coming soon.</p>
    </div>
  );
}

export default function LabelsPage() {
  return (
    <AuthGuard>
      <LabelRulesList />
    </AuthGuard>
  );
}
