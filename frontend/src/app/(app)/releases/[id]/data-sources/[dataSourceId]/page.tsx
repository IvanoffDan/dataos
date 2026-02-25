"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  fetchRelease,
  fetchReleaseSummary,
  fetchReleaseData,
  Release,
  KpiSummary,
  TableDataResponse,
} from "@/lib/releases-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { KpiCard } from "@/components/charts/kpi-card";

const PAGE_SIZE = 50;

function ReleaseDataSourceDetail() {
  const params = useParams();
  const releaseId = Number(params.id);
  const dataSourceId = Number(params.dataSourceId);

  const [release, setRelease] = useState<Release | null>(null);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [tableData, setTableData] = useState<TableDataResponse | null>(null);
  const [page, setPage] = useState(0);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [error, setError] = useState("");

  const entry = release?.entries.find((e) => e.data_source_id === dataSourceId);

  useEffect(() => {
    fetchRelease(releaseId)
      .then(setRelease)
      .catch((e) => setError(e.message));
    setSummaryLoading(true);
    fetchReleaseSummary(releaseId, dataSourceId)
      .then(setSummary)
      .catch(() => {})
      .finally(() => setSummaryLoading(false));
  }, [releaseId, dataSourceId]);

  const loadData = useCallback(() => {
    fetchReleaseData(releaseId, dataSourceId, {
      offset: page * PAGE_SIZE,
      limit: PAGE_SIZE,
      sort_column: sortColumn || undefined,
      sort_dir: sortDir,
    })
      .then(setTableData)
      .catch((e) => setError(e.message));
  }, [releaseId, dataSourceId, page, sortColumn, sortDir]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSort = (col: string) => {
    if (sortColumn === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDir("desc");
    }
    setPage(0);
  };

  if (error) {
    return <p className="text-red-600">{error}</p>;
  }

  const totalPages = tableData
    ? Math.ceil(tableData.total_count / PAGE_SIZE)
    : 0;

  return (
    <div>
      <div className="mb-4">
        <Link
          href={`/releases/${releaseId}`}
          className="text-[var(--primary)] hover:underline text-sm"
        >
          &larr; Back to Release
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-[var(--primary)]">
          {entry?.data_source_name || `Data Source ${dataSourceId}`}
        </h1>
        {entry && (
          <>
            <Badge variant="secondary">{entry.dataset_type}</Badge>
            <Badge variant="secondary">v{entry.pipeline_run_version}</Badge>
          </>
        )}
        {release && (
          <span className="text-[var(--muted-foreground)] text-sm">
            in {release.name}
          </span>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="Total Rows"
          value={summary ? summary.total_rows.toLocaleString() : "—"}
          loading={summaryLoading}
        />
        <KpiCard
          label="Date Range"
          value={
            summary?.min_date && summary?.max_date
              ? `${summary.min_date} — ${summary.max_date}`
              : "—"
          }
          loading={summaryLoading}
        />
        {summary &&
          Object.entries(summary.metrics)
            .slice(0, 2)
            .map(([key, val]) => (
              <KpiCard
                key={key}
                label={key}
                value={val.toLocaleString()}
                loading={false}
              />
            ))}
      </div>

      {/* Data Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">
            Data{" "}
            {tableData && (
              <span className="text-[var(--muted-foreground)] font-normal text-sm">
                ({tableData.total_count.toLocaleString()} rows)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!tableData ? (
            <p className="text-[var(--muted-foreground)] text-sm">
              Loading...
            </p>
          ) : tableData.rows.length === 0 ? (
            <p className="text-[var(--muted-foreground)] text-sm">
              No data available.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {tableData.columns.map((col) => (
                        <TableHead
                          key={col}
                          className="cursor-pointer hover:text-[var(--foreground)]"
                          onClick={() => handleSort(col)}
                        >
                          {col}
                          {sortColumn === col && (
                            <span className="ml-1">
                              {sortDir === "asc" ? "\u2191" : "\u2193"}
                            </span>
                          )}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tableData.rows.map((row, i) => (
                      <TableRow key={i}>
                        {tableData.columns.map((col) => (
                          <TableCell
                            key={col}
                            className="text-sm max-w-[200px] truncate"
                          >
                            {row[col] != null ? String(row[col]) : "—"}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-[var(--muted-foreground)]">
                    Page {page + 1} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ReleaseDataSourcePage() {
  return <ReleaseDataSourceDetail />;
}
