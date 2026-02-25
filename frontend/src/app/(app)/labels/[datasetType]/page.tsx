"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useColumnStats, useAutoLabelAll, useUndoAutoLabelAll } from "@/hooks/use-labels";
import type { AutoLabelAllResponse } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorBanner } from "@/components/shared/error-banner";

const ColumnOverview = () => {
  const params = useParams();
  const datasetType = params.datasetType as string;
  const { data, isLoading, error } = useColumnStats(datasetType);
  const autoFillAll = useAutoLabelAll(datasetType);
  const undoAll = useUndoAutoLabelAll(datasetType);
  const [autoFillResult, setAutoFillResult] = useState<AutoLabelAllResponse | null>(null);

  if (error) return <ErrorBanner message={error.message} />;
  if (isLoading) return <p className="text-[var(--muted-foreground)]">Loading...</p>;
  if (!data) return <ErrorBanner message="Failed to load dataset type." />;

  const hasAiRules = data.columns.some((c) => c.ai_rule_count > 0);
  const hasBqData = data.total_rows !== null;

  const handleAutoFillAll = () => {
    setAutoFillResult(null);
    autoFillAll.mutate(undefined, {
      onSuccess: (result) => setAutoFillResult(result),
    });
  };

  const handleUndoAll = () => {
    setAutoFillResult(null);
    undoAll.mutate();
  };

  return (
    <div>
      <div className="mb-4">
        <Link href="/labels" className="text-[var(--primary)] hover:underline text-sm">
          &larr; Back to Label Rules
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-2xl font-bold text-[var(--primary)]">{data.dataset_type_name}</h1>
        <Badge variant="secondary">{data.dataset_type}</Badge>
      </div>

      {hasBqData ? (
        <p className="text-sm text-[var(--muted-foreground)] mb-6">
          {data.total_rows?.toLocaleString()} total rows in output table
        </p>
      ) : (
        <p className="text-sm text-[var(--muted-foreground)] mb-6">
          Run the pipeline to see data statistics.
        </p>
      )}

      {data.columns.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <Button
            onClick={handleAutoFillAll}
            disabled={autoFillAll.isPending || undoAll.isPending}
            size="sm"
          >
            {autoFillAll.isPending ? "Auto-filling..." : "Auto-fill All with AI"}
          </Button>
          {hasAiRules && (
            <Button
              variant="outline"
              onClick={handleUndoAll}
              disabled={autoFillAll.isPending || undoAll.isPending}
              size="sm"
            >
              {undoAll.isPending ? "Undoing..." : "Undo All AI"}
            </Button>
          )}
        </div>
      )}

      {autoFillResult && (
        <div className="mb-4 rounded-md border border-[var(--border)] bg-[var(--muted)] p-3 text-sm">
          <p>
            AI suggested{" "}
            <strong>{autoFillResult.total_suggestions}</strong> rules across{" "}
            <strong>
              {autoFillResult.columns.filter((c) => c.suggestion_count > 0).length}
            </strong>{" "}
            columns
            {autoFillResult.total_skipped > 0 && (
              <> ({autoFillResult.total_skipped} values already mapped)</>
            )}
          </p>
          {autoFillResult.columns.some((c) => c.error) && (
            <ul className="mt-2 space-y-1 text-red-600">
              {autoFillResult.columns
                .filter((c) => c.error)
                .map((c) => (
                  <li key={c.column_name}>
                    {c.column_name}: {c.error}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {data.columns.length === 0 ? (
        <p className="text-[var(--muted-foreground)]">
          No string columns found in this dataset type.
        </p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">String Columns</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Column</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Distinct</TableHead>
                  <TableHead>Rules</TableHead>
                  <TableHead>Coverage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.columns.map((col) => {
                  const pct =
                    col.distinct_count && col.distinct_count > 0
                      ? Math.min(100, Math.round((col.rule_count / col.distinct_count) * 100))
                      : 0;
                  return (
                    <TableRow key={col.column_name}>
                      <TableCell>
                        <Link
                          href={`/labels/${datasetType}/${col.column_name}`}
                          className="text-[var(--primary)] hover:underline font-medium font-mono text-sm"
                        >
                          {col.column_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-[var(--muted-foreground)] text-sm">
                        {col.description}
                      </TableCell>
                      <TableCell>
                        {col.distinct_count !== null ? col.distinct_count : "\u2014"}
                      </TableCell>
                      <TableCell>{col.rule_count}</TableCell>
                      <TableCell>
                        {col.distinct_count !== null ? (
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 rounded-full bg-[var(--border)] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-[var(--primary)]"
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-[var(--muted-foreground)]">{pct}%</span>
                          </div>
                        ) : (
                          "\u2014"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const ColumnOverviewPage = () => <ColumnOverview />;
export default ColumnOverviewPage;
