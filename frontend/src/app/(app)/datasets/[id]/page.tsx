"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useDataSource, useUpdateDataSource, useDeleteDataSource } from "@/hooks/use-data-sources";
import { useKpiSummary, useMetrics, useTimeSeries } from "@/hooks/use-explore";
import { usePipelineRuns, useTriggerRun, useRunErrors } from "@/hooks/use-pipeline";
import { sourceStatusVariant, runStatusVariant, formatMetricValue } from "@/lib/format";
import { KpiCard } from "@/components/charts/kpi-card";
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
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EditDialog } from "@/components/shared/edit-dialog";
import { ErrorBanner } from "@/components/shared/error-banner";
import { PageHeader } from "@/components/shared/page-header";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

const DataSourceDetail = () => {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const { data: dataSource, isLoading, error } = useDataSource(id);
  const { data: kpi, isLoading: kpiLoading } = useKpiSummary(id);
  const { data: metrics = [] } = useMetrics(id);
  const { data: runs = [] } = usePipelineRuns(id);

  const defaultMetric = metrics.find((m) => m.default) || metrics[0];
  const { data: previewChart = [] } = useTimeSeries(
    id,
    { metric_id: defaultMetric?.id ?? "", granularity: "weekly" },
    !!defaultMetric
  );

  const updateMutation = useUpdateDataSource(id);
  const deleteMutation = useDeleteDataSource();
  const triggerRun = useTriggerRun(id);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [errorsRunId, setErrorsRunId] = useState<number | null>(null);

  const { data: validationErrors = [] } = useRunErrors(errorsRunId);

  if (error) return <ErrorBanner message={error.message} />;
  if (isLoading || !dataSource) {
    return <p className="text-[var(--muted-foreground)]">Loading...</p>;
  }

  return (
    <div>
      <PageHeader
        backHref="/datasets"
        backLabel="Back to Data Sources"
        title={dataSource.name}
        badges={
          <>
            <Badge variant="secondary">{dataSource.dataset_type}</Badge>
            <Badge variant={sourceStatusVariant(dataSource.status)}>
              {dataSource.status}
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
          </>
        }
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/datasets/${id}/mapping`}>Map Columns</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => triggerRun.mutate()}
              disabled={triggerRun.isPending}
            >
              {triggerRun.isPending ? "Running..." : "Run Pipeline"}
            </Button>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          </>
        }
      />

      {dataSource.description && (
        <p className="text-[var(--muted-foreground)] text-sm mb-4">
          {dataSource.description}
        </p>
      )}

      <p className="text-sm text-[var(--muted-foreground)] mb-6">
        Connector: <span className="font-medium text-[var(--foreground)]">{dataSource.connector_name}</span>
        {" "}&middot;{" "}
        BQ Table: <span className="font-mono">{dataSource.bq_table}</span>
        {dataSource.connector_category && dataSource.connector_category !== "passthrough" && (
          <>
            {" "}&middot;{" "}
            <Badge variant="secondary" className="text-xs">
              {dataSource.connector_category}
            </Badge>
          </>
        )}
      </p>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="Total Rows"
          value={kpi ? kpi.total_rows.toLocaleString() : "\u2014"}
          loading={kpiLoading}
        />
        <KpiCard
          label="Date Range"
          value={
            kpi?.min_date && kpi?.max_date
              ? `${kpi.min_date} \u2014 ${kpi.max_date}`
              : "\u2014"
          }
          loading={kpiLoading}
        />
        {metrics.slice(0, 2).map((m) => (
          <KpiCard
            key={m.id}
            label={m.name}
            value={
              kpi?.metrics[m.id] !== undefined
                ? formatMetricValue(kpi.metrics[m.id], m.format_type)
                : "\u2014"
            }
            loading={kpiLoading}
          />
        ))}
      </div>

      {/* Preview Chart */}
      {previewChart.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">
              {defaultMetric?.name} (Weekly)
            </CardTitle>
            <Link
              href={`/review/${id}`}
              className="text-sm text-[var(--primary)] hover:underline"
            >
              Explore in Review & QA &rarr;
            </Link>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={previewChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v: string) => {
                    const d = new Date(v);
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  }}
                />
                <YAxis tick={{ fontSize: 12 }} width={60} />
                <Tooltip
                  formatter={(value) => (value as number).toLocaleString()}
                  labelFormatter={(label) => new Date(String(label)).toLocaleDateString()}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Pipeline Runs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pipeline Runs</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-[var(--muted-foreground)] text-sm">No pipeline runs yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Rows OK</TableHead>
                  <TableHead>Rows Failed</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge variant={runStatusVariant(r.status)}>{r.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {r.version != null ? (
                        <Badge variant="secondary">v{r.version}</Badge>
                      ) : (
                        "\u2014"
                      )}
                    </TableCell>
                    <TableCell className="text-[var(--muted-foreground)]">
                      {r.started_at ? new Date(r.started_at).toLocaleString() : "\u2014"}
                    </TableCell>
                    <TableCell>{r.rows_processed}</TableCell>
                    <TableCell>
                      {r.rows_failed > 0 ? (
                        <span className="text-red-600">{r.rows_failed}</span>
                      ) : (
                        r.rows_failed
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.rows_failed > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setErrorsRunId(r.id)}
                        >
                          View Errors
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Validation Errors Dialog */}
      <Dialog open={errorsRunId !== null} onOpenChange={(v) => !v && setErrorsRunId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Validation Errors</DialogTitle>
          </DialogHeader>
          {validationErrors.length === 0 ? (
            <p className="text-[var(--muted-foreground)] text-sm">No errors found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Column</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {validationErrors.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{e.row_number}</TableCell>
                    <TableCell className="font-mono text-xs">{e.column_name}</TableCell>
                    <TableCell className="text-sm">{e.error_message}</TableCell>
                    <TableCell className="font-mono text-xs text-[var(--muted-foreground)]">
                      {e.source_value ?? "\u2014"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onConfirm={() =>
          deleteMutation.mutate(id, { onSuccess: () => router.push("/datasets") })
        }
        onCancel={() => setDeleteOpen(false)}
        title="Delete Data Source"
        description={`Are you sure you want to delete "${dataSource.name}"? This will remove all mappings and pipeline runs.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
      />

      <EditDialog
        open={editOpen}
        onSave={(newName) =>
          updateMutation.mutate({ name: newName }, { onSuccess: () => setEditOpen(false) })
        }
        onCancel={() => setEditOpen(false)}
        title="Rename Data Source"
        label="Data Source Name"
        defaultValue={dataSource.name}
        loading={updateMutation.isPending}
      />
    </div>
  );
};

const DatasetDetailPage = () => <DataSourceDetail />;
export default DatasetDetailPage;
