"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { fetchKpiSummary, KpiSummary } from "@/lib/explore-api";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DataSource {
  id: number;
  name: string;
  dataset_type: string;
}

interface PipelineRun {
  id: number;
  data_source_id: number;
  status: string;
  completed_at: string | null;
}

interface DataSourceWithStats extends DataSource {
  totalRows: number;
  minDate: string | null;
  maxDate: string | null;
  lastRunDate: string | null;
}

function ReviewList() {
  const [dataSources, setDataSources] = useState<DataSourceWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const dataSourcesRes: DataSource[] = await api("/api/data-sources").then((r) => r.json());

      const results: DataSourceWithStats[] = [];

      await Promise.all(
        dataSourcesRes.map(async (ds) => {
          try {
            const runs: PipelineRun[] = await api(
              `/api/data-sources/${ds.id}/runs`
            ).then((r) => r.json());
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
      setLoading(false);
    }

    load();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--primary)] mb-6">
        Review & QA
      </h1>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-12 bg-[var(--muted)] rounded animate-pulse"
            />
          ))}
        </div>
      ) : dataSources.length === 0 ? (
        <p className="text-[var(--muted-foreground)] text-sm">
          No data sources with completed pipeline runs yet. Run a pipeline first to
          explore data here.
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
                    <Link
                      href={`/review/${ds.id}`}
                      className="text-[var(--primary)] hover:underline"
                    >
                      {ds.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{ds.dataset_type}</Badge>
                  </TableCell>
                  <TableCell>{ds.totalRows.toLocaleString()}</TableCell>
                  <TableCell className="text-[var(--muted-foreground)]">
                    {ds.minDate && ds.maxDate
                      ? `${ds.minDate} — ${ds.maxDate}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-[var(--muted-foreground)]">
                    {ds.lastRunDate
                      ? new Date(ds.lastRunDate).toLocaleDateString()
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export default function ReviewPage() {
  return <ReviewList />;
}
