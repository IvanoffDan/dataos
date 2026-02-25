"use client";

import Link from "next/link";
import { useLabelSummary } from "@/hooks/use-labels";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorBanner } from "@/components/shared/error-banner";

const LabelsDashboard = () => {
  const { data: summaries = [], isLoading, error } = useLabelSummary();

  if (error) return <ErrorBanner message={error.message} />;

  if (isLoading) {
    return <p className="text-[var(--muted-foreground)]">Loading...</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 text-[var(--primary)]">Label Rules</h1>

      {summaries.length === 0 ? (
        <p className="text-[var(--muted-foreground)]">
          No dataset types found. Create a data source first to start labelling.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dataset Type</TableHead>
              <TableHead>Rules</TableHead>
              <TableHead>Columns</TableHead>
              <TableHead>Coverage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summaries.map((s) => {
              const pct =
                s.total_string_columns > 0
                  ? Math.round((s.columns_with_rules / s.total_string_columns) * 100)
                  : 0;
              return (
                <TableRow key={s.dataset_type}>
                  <TableCell>
                    <Link
                      href={`/labels/${s.dataset_type}`}
                      className="text-[var(--primary)] hover:underline font-medium"
                    >
                      {s.dataset_type_name}
                    </Link>
                    <Badge variant="secondary" className="ml-2">{s.dataset_type}</Badge>
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
                      <span className="text-xs text-[var(--muted-foreground)]">{pct}%</span>
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
};

const LabelsPage = () => <LabelsDashboard />;
export default LabelsPage;
