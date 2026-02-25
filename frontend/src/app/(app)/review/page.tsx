"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchDataSources } from "@/lib/api/data-sources";
import { fetchRuns } from "@/lib/api/pipeline";
import { fetchKpiSummary } from "@/lib/api/explore";
import type { DataSourceSummary } from "@/types";
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

interface DataSourceWithStats extends DataSourceSummary {
  totalRows: number;
  minDate: string | null;
  maxDate: string | null;
  lastRunDate: string | null;
}

const ReviewList = () => {
  const [dataSources, setDataSources] = useState<DataSourceWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const allDs = await fetchDataSources();
        const results: DataSourceWithStats[] = [];

        await Promise.all(
          allDs.map(async (ds) => {
            try {
              const runs = await fetchRuns(ds.id);
              const successRuns = runs.filter((r) => r.status === "success");
              if (successRuns.length === 0) return;

              const kpi = await fetchKpiSummary(ds.id);
              const lastRun = successRuns[0];

              results.push({
                ...ds,
                totalRows: kpi?.total_rows ?? 0,
                minDate: kpi?.min_date ?? null,
                maxDate: kpi?.max_date ?? null,
                lastRunDate: lastRun?.completed_at ?? null,
              });
            } catch {
              // Skip data sources that error
            }
          })
        );

        results.sort((a, b) => a.name.localeCompare(b.name));
        setDataSources(results);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (error) return <ErrorBanner message={error} />;

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--primary)] mb-6">Review & QA</h1>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 bg-[var(--muted)] rounded animate-pulse" />
          ))}
        </div>
      ) : dataSources.length === 0 ? (
        <p className="text-[var(--muted-foreground)] text-sm">
          No data sources with completed pipeline runs yet. Run a pipeline first to explore data here.
        </p>
      ) : (
        <div className="rounded-md border border-[var(--border)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data Source</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Total Rows</TableHead>
                <TableHead>Date Range</TableHead>
                <TableHead>Last Run</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dataSources.map((ds) => (
                <TableRow key={ds.id}>
                  <TableCell className="font-medium">
                    <Link href={`/review/${ds.id}`} className="text-[var(--primary)] hover:underline">
                      {ds.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{ds.dataset_type}</Badge>
                  </TableCell>
                  <TableCell>{ds.totalRows.toLocaleString()}</TableCell>
                  <TableCell className="text-[var(--muted-foreground)]">
                    {ds.minDate && ds.maxDate ? `${ds.minDate} \u2014 ${ds.maxDate}` : "\u2014"}
                  </TableCell>
                  <TableCell className="text-[var(--muted-foreground)]">
                    {ds.lastRunDate ? new Date(ds.lastRunDate).toLocaleDateString() : "\u2014"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

const ReviewPage = () => <ReviewList />;
export default ReviewPage;
