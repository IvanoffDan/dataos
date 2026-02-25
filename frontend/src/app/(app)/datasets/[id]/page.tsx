"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  fetchKpiSummary,
  fetchMetrics,
  fetchTimeSeries,
  KpiSummary,
  MetricDef,
  TimeSeriesPoint,
} from "@/lib/explore-api";
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
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EditDialog } from "@/components/edit-dialog";
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

interface DataSource {
  id: number;
  name: string;
  description: string;
  dataset_type: string;
  connector_id: number;
  connector_name: string;
  bq_table: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface PipelineRun {
  id: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  rows_processed: number;
  rows_failed: number;
  version: number | null;
  error_summary: string | null;
  created_at: string;
}

interface ValidationError {
  id: number;
  row_number: number;
  column_name: string;
  error_type: string;
  error_message: string;
  source_value: string | null;
}

function sourceStatusVariant(
  status: string
): "success" | "warning" | "error" | "secondary" {
  switch (status) {
    case "mapped":
      return "success";
    case "pending_mapping":
      return "warning";
    case "error":
      return "error";
    default:
      return "secondary";
  }
}

function runStatusVariant(
  status: string
): "success" | "warning" | "error" | "secondary" {
  switch (status) {
    case "success":
      return "success";
    case "pending":
      return "warning";
    case "running":
      return "secondary";
    case "failed":
      return "error";
    default:
      return "secondary";
  }
}

function DataSourceDetail() {
  const params = useParams();
  const router = useRouter();
  const [dataSource, setDataSource] = useState<DataSource | null>(null);
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [error, setError] = useState("");

  // Edit/delete
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Run errors
  const [errorsRunId, setErrorsRunId] = useState<number | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);

  // KPI & chart data
  const [kpi, setKpi] = useState<KpiSummary | null>(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [metrics, setMetrics] = useState<MetricDef[]>([]);
  const [previewChart, setPreviewChart] = useState<TimeSeriesPoint[]>([]);

  const id = Number(params.id);

  const loadData = useCallback(() => {
    api(`/api/data-sources/${id}`)
      .then((r) => r.json())
      .then(setDataSource);
    api(`/api/data-sources/${id}/runs`)
      .then((r) => r.json())
      .then(setRuns);
    // Load KPI summary
    setKpiLoading(true);
    fetchKpiSummary(id)
      .then(setKpi)
      .finally(() => setKpiLoading(false));
    fetchMetrics(id).then((m) => {
      setMetrics(m);
      const defaultMetric = m.find((x) => x.default) || m[0];
      if (defaultMetric) {
        fetchTimeSeries(id, {
          metric_id: defaultMetric.id,
          granularity: "weekly",
        }).then(setPreviewChart);
      }
    });
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async (newName: string) => {
    setSaving(true);
    setError("");
    try {
      const res = await api(`/api/data-sources/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      setDataSource(await res.json());
      setEditOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api(`/api/data-sources/${id}`, { method: "DELETE" });
      router.push("/datasets");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const handleRunPipeline = async () => {
    setError("");
    try {
      const res = await api(`/api/data-sources/${id}/run`, {
        method: "POST",
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const handleViewErrors = async (runId: number) => {
    setErrorsRunId(runId);
    const res = await api(`/api/pipeline/runs/${runId}/errors`);
    setValidationErrors(await res.json());
  };

  if (!dataSource) {
    return <p className="text-[var(--muted-foreground)]">Loading...</p>;
  }

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/datasets"
          className="text-[var(--primary)] hover:underline text-sm"
        >
          &larr; Back to Data Sources
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-[var(--primary)]">
            {dataSource.name}
          </h1>
          <Badge variant="secondary">{dataSource.dataset_type}</Badge>
          <Badge variant={sourceStatusVariant(dataSource.status)}>
            {dataSource.status}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditOpen(true)}
          >
            Edit
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href={`/datasets/${id}/mapping`}>Map Columns</Link>
          </Button>
          <Button variant="outline" onClick={handleRunPipeline}>
            Run Pipeline
          </Button>
          <Button
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            Delete
          </Button>
        </div>
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {dataSource.description && (
        <p className="text-[var(--muted-foreground)] text-sm mb-4">
          {dataSource.description}
        </p>
      )}

      <p className="text-sm text-[var(--muted-foreground)] mb-6">
        Connector: <span className="font-medium text-[var(--foreground)]">{dataSource.connector_name}</span>
        {" "}&middot;{" "}
        BQ Table: <span className="font-mono">{dataSource.bq_table}</span>
      </p>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="Total Rows"
          value={kpi ? kpi.total_rows.toLocaleString() : "—"}
          loading={kpiLoading}
        />
        <KpiCard
          label="Date Range"
          value={
            kpi?.min_date && kpi?.max_date
              ? `${kpi.min_date} — ${kpi.max_date}`
              : "—"
          }
          loading={kpiLoading}
        />
        {metrics.slice(0, 2).map((m) => (
          <KpiCard
            key={m.id}
            label={m.name}
            value={
              kpi?.metrics[m.id] !== undefined
                ? m.format_type === "currency"
                  ? `$${kpi.metrics[m.id].toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                  : kpi.metrics[m.id].toLocaleString()
                : "—"
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
              {metrics.find((m) => m.default)?.name || metrics[0]?.name} (Weekly)
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
            <p className="text-[var(--muted-foreground)] text-sm">
              No pipeline runs yet.
            </p>
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
                      <Badge variant={runStatusVariant(r.status)}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {r.version != null ? (
                        <Badge variant="secondary">v{r.version}</Badge>
                      ) : (
                        "\u2014"
                      )}
                    </TableCell>
                    <TableCell className="text-[var(--muted-foreground)]">
                      {r.started_at
                        ? new Date(r.started_at).toLocaleString()
                        : "\u2014"}
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
                          onClick={() => handleViewErrors(r.id)}
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
      <Dialog
        open={errorsRunId !== null}
        onOpenChange={(v) => !v && setErrorsRunId(null)}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Validation Errors</DialogTitle>
          </DialogHeader>
          {validationErrors.length === 0 ? (
            <p className="text-[var(--muted-foreground)] text-sm">
              No errors found.
            </p>
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
                    <TableCell className="font-mono text-xs">
                      {e.column_name}
                    </TableCell>
                    <TableCell className="text-sm">
                      {e.error_message}
                    </TableCell>
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

      {/* Edit/Delete Dialogs */}
      <ConfirmDialog
        open={deleteOpen}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
        title="Delete Data Source"
        description={`Are you sure you want to delete "${dataSource.name}"? This will remove all mappings and pipeline runs.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
      />

      <EditDialog
        open={editOpen}
        onSave={handleSave}
        onCancel={() => setEditOpen(false)}
        title="Rename Data Source"
        label="Data Source Name"
        defaultValue={dataSource.name}
        loading={saving}
      />
    </div>
  );
}

export default function DatasetDetailPage() {
  return <DataSourceDetail />;
}
