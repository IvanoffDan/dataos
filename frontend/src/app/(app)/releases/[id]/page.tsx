"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  fetchRelease,
  fetchReleaseSummary,
  Release,
  KpiSummary,
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

function ReleaseDetail() {
  const params = useParams();
  const releaseId = Number(params.id);
  const [release, setRelease] = useState<Release | null>(null);
  const [summaries, setSummaries] = useState<Record<number, KpiSummary>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    fetchRelease(releaseId)
      .then((r) => {
        setRelease(r);
        // Load KPI summaries for each dataset entry
        r.entries.forEach((entry) => {
          fetchReleaseSummary(releaseId, entry.dataset_id)
            .then((s) =>
              setSummaries((prev) => ({ ...prev, [entry.dataset_id]: s }))
            )
            .catch(() => {});
        });
      })
      .catch((e) => setError(e.message));
  }, [releaseId]);

  if (error) {
    return <p className="text-red-600">{error}</p>;
  }

  if (!release) {
    return <p className="text-[var(--muted-foreground)]">Loading...</p>;
  }

  const totalRows = release.entries.reduce((sum, e) => sum + e.rows_processed, 0);

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/releases"
          className="text-[var(--primary)] hover:underline text-sm"
        >
          &larr; Back to Releases
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-[var(--primary)]">
          {release.name}
        </h1>
        <Badge variant="secondary">v{release.version}</Badge>
      </div>

      {release.description && (
        <p className="text-[var(--muted-foreground)] text-sm mb-6">
          {release.description}
        </p>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="Datasets"
          value={String(release.entries.length)}
          loading={false}
        />
        <KpiCard
          label="Total Rows"
          value={totalRows.toLocaleString()}
          loading={false}
        />
        <KpiCard
          label="Created"
          value={new Date(release.created_at).toLocaleDateString()}
          loading={false}
        />
        <KpiCard
          label="Release Version"
          value={`v${release.version}`}
          loading={false}
        />
      </div>

      {/* Dataset Entries */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Datasets in this Release</CardTitle>
        </CardHeader>
        <CardContent>
          {release.entries.length === 0 ? (
            <p className="text-[var(--muted-foreground)] text-sm">
              No datasets in this release.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dataset</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Date Range</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {release.entries.map((entry) => {
                  const summary = summaries[entry.dataset_id];
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">
                        {entry.dataset_name || `Dataset ${entry.dataset_id}`}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {entry.dataset_type || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>v{entry.pipeline_run_version}</TableCell>
                      <TableCell>
                        {entry.rows_processed.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-[var(--muted-foreground)]">
                        {summary
                          ? summary.min_date && summary.max_date
                            ? `${summary.min_date} — ${summary.max_date}`
                            : "—"
                          : "..."}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link
                            href={`/releases/${releaseId}/datasets/${entry.dataset_id}`}
                          >
                            View Data
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ReleaseDetailPage() {
  return <ReleaseDetail />;
}
