"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DatasetLabelSummary {
  dataset_id: number;
  dataset_name: string;
  dataset_type: string;
  total_rules: number;
  columns_with_rules: number;
  total_string_columns: number;
}

function LabelsDashboard() {
  const [summaries, setSummaries] = useState<DatasetLabelSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/api/labels/summary")
      .then((r) => r.json())
      .then(setSummaries)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-[var(--muted-foreground)]">Loading...</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 text-[var(--primary)]">
        Label Rules
      </h1>

      {summaries.length === 0 ? (
        <p className="text-[var(--muted-foreground)]">
          No datasets found. Create a dataset first to start labelling.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dataset</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Rules</TableHead>
              <TableHead>Columns</TableHead>
              <TableHead>Coverage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summaries.map((s) => {
              const pct =
                s.total_string_columns > 0
                  ? Math.round(
                      (s.columns_with_rules / s.total_string_columns) * 100
                    )
                  : 0;
              return (
                <TableRow key={s.dataset_id}>
                  <TableCell>
                    <Link
                      href={`/labels/${s.dataset_id}`}
                      className="text-[var(--primary)] hover:underline font-medium"
                    >
                      {s.dataset_name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{s.dataset_type}</Badge>
                  </TableCell>
                  <TableCell>{s.total_rules}</TableCell>
                  <TableCell>
                    {s.columns_with_rules} / {s.total_string_columns}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 rounded-full bg-[var(--border)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--primary)]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {pct}%
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export default function LabelsPage() {
  return <LabelsDashboard />;
}
