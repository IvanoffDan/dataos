"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
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

interface ColumnStats {
  column_name: string;
  description: string;
  distinct_count: number | null;
  rule_count: number;
  ai_rule_count: number;
  non_null_count: number | null;
  total_rows: number | null;
}

interface ColumnStatsResponse {
  dataset_id: number;
  dataset_name: string;
  dataset_type: string;
  total_rows: number | null;
  columns: ColumnStats[];
}

interface AutoLabelColumnResult {
  column_name: string;
  suggestion_count: number;
  skipped_count: number;
  error: string | null;
}

interface AutoLabelAllResponse {
  columns: AutoLabelColumnResult[];
  total_suggestions: number;
  total_skipped: number;
}

function ColumnOverview() {
  const params = useParams();
  const datasetId = params.datasetId as string;
  const [data, setData] = useState<ColumnStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoFilling, setAutoFilling] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [autoFillResult, setAutoFillResult] =
    useState<AutoLabelAllResponse | null>(null);

  const loadColumns = () =>
    api(`/api/labels/datasets/${datasetId}/columns`)
      .then((r) => r.json())
      .then(setData);

  useEffect(() => {
    loadColumns().finally(() => setLoading(false));
  }, [datasetId]);

  const hasAiRules =
    data?.columns.some((c) => c.ai_rule_count > 0) ?? false;

  const handleAutoFillAll = async () => {
    setAutoFilling(true);
    setAutoFillResult(null);
    try {
      const res = await api(
        `/api/labels/datasets/${datasetId}/auto-label`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error("Auto-label failed");
      const result: AutoLabelAllResponse = await res.json();
      setAutoFillResult(result);
      await loadColumns();
    } catch {
      // error state handled by lack of result
    } finally {
      setAutoFilling(false);
    }
  };

  const handleUndoAll = async () => {
    setUndoing(true);
    setAutoFillResult(null);
    try {
      await api(`/api/labels/datasets/${datasetId}/auto-label`, {
        method: "DELETE",
      });
      await loadColumns();
    } finally {
      setUndoing(false);
    }
  };

  if (loading) {
    return <p className="text-[var(--muted-foreground)]">Loading...</p>;
  }

  if (!data) {
    return <p className="text-red-600">Failed to load data source.</p>;
  }

  const hasBqData = data.total_rows !== null;

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/labels"
          className="text-[var(--primary)] hover:underline text-sm"
        >
          &larr; Back to Label Rules
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-2xl font-bold text-[var(--primary)]">
          {data.dataset_name}
        </h1>
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
            disabled={autoFilling || undoing}
            size="sm"
          >
            {autoFilling ? "Auto-filling..." : "Auto-fill All with AI"}
          </Button>
          {hasAiRules && (
            <Button
              variant="outline"
              onClick={handleUndoAll}
              disabled={autoFilling || undoing}
              size="sm"
            >
              {undoing ? "Undoing..." : "Undo All AI"}
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
          No string columns found in this data source type.
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
                      ? Math.min(
                          100,
                          Math.round(
                            (col.rule_count / col.distinct_count) * 100
                          )
                        )
                      : 0;
                  return (
                    <TableRow key={col.column_name}>
                      <TableCell>
                        <Link
                          href={`/labels/${datasetId}/${col.column_name}`}
                          className="text-[var(--primary)] hover:underline font-medium font-mono text-sm"
                        >
                          {col.column_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-[var(--muted-foreground)] text-sm">
                        {col.description}
                      </TableCell>
                      <TableCell>
                        {col.distinct_count !== null
                          ? col.distinct_count
                          : "\u2014"}
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
                            <span className="text-xs text-[var(--muted-foreground)]">
                              {pct}%
                            </span>
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
}

export default function ColumnOverviewPage() {
  return <ColumnOverview />;
}
