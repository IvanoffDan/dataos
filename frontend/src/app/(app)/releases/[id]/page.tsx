"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useRelease, useReleaseSummary } from "@/hooks/use-releases";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KpiCard } from "@/components/charts/kpi-card";
import { ErrorBanner } from "@/components/shared/error-banner";
import { PageHeader } from "@/components/shared/page-header";

const EntryDateRange = ({ releaseId, dataSourceId }: { releaseId: number; dataSourceId: number }) => {
  const { data: summary } = useReleaseSummary(releaseId, dataSourceId);
  if (!summary) return <span className="text-[var(--muted-foreground)]">...</span>;
  return (
    <span className="text-[var(--muted-foreground)]">
      {summary.min_date && summary.max_date ? `${summary.min_date} \u2014 ${summary.max_date}` : "\u2014"}
    </span>
  );
};

const ReleaseDetail = () => {
  const params = useParams();
  const releaseId = Number(params.id);
  const { data: release, isLoading, error } = useRelease(releaseId);

  if (error) return <ErrorBanner message={error.message} />;
  if (isLoading || !release) return <p className="text-[var(--muted-foreground)]">Loading...</p>;

  const totalRows = release.entries.reduce((sum, e) => sum + e.rows_processed, 0);

  return (
    <div>
      <PageHeader
        backHref="/releases"
        backLabel="Back to Releases"
        title={release.name}
        badges={<Badge variant="secondary">v{release.version}</Badge>}
      />

      {release.description && (
        <p className="text-[var(--muted-foreground)] text-sm mb-6">{release.description}</p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Data Sources" value={String(release.entries.length)} loading={false} />
        <KpiCard label="Total Rows" value={totalRows.toLocaleString()} loading={false} />
        <KpiCard label="Created" value={new Date(release.created_at).toLocaleDateString()} loading={false} />
        <KpiCard label="Release Version" value={`v${release.version}`} loading={false} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Data Sources in this Release</CardTitle>
        </CardHeader>
        <CardContent>
          {release.entries.length === 0 ? (
            <p className="text-[var(--muted-foreground)] text-sm">No data sources in this release.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data Source</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Date Range</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {release.entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">
                      {entry.data_source_name || `Data Source ${entry.data_source_id}`}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{entry.dataset_type || "\u2014"}</Badge>
                    </TableCell>
                    <TableCell>v{entry.pipeline_run_version}</TableCell>
                    <TableCell>{entry.rows_processed.toLocaleString()}</TableCell>
                    <TableCell>
                      <EntryDateRange releaseId={releaseId} dataSourceId={entry.data_source_id} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/releases/${releaseId}/data-sources/${entry.data_source_id}`}>
                          View Data
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const ReleaseDetailPage = () => <ReleaseDetail />;
export default ReleaseDetailPage;
