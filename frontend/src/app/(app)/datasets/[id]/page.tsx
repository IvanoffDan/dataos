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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface Dataset {
  id: number;
  name: string;
  type: string;
  description: string;
  created_at: string;
  updated_at: string;
}

interface DataSource {
  id: number;
  dataset_id: number;
  connector_id: number;
  bq_table: string;
  status: string;
  connector_name: string;
  created_at: string;
}

interface Connector {
  id: number;
  name: string;
  schema_name: string;
  status: string;
}

interface BqTable {
  table_id: string;
  full_id: string;
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

function DatasetDetail() {
  const params = useParams();
  const router = useRouter();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [error, setError] = useState("");

  // Edit/delete dataset
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Add source dialog
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [selectedConnector, setSelectedConnector] = useState<number | null>(
    null
  );
  const [bqTables, setBqTables] = useState<BqTable[]>([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [loadingTables, setLoadingTables] = useState(false);
  const [addingSource, setAddingSource] = useState(false);

  // Delete source dialog
  const [deleteSourceId, setDeleteSourceId] = useState<number | null>(null);
  const [deletingSource, setDeletingSource] = useState(false);

  // Run errors
  const [errorsRunId, setErrorsRunId] = useState<number | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    []
  );

  // KPI & chart data
  const [kpi, setKpi] = useState<KpiSummary | null>(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [metrics, setMetrics] = useState<MetricDef[]>([]);
  const [previewChart, setPreviewChart] = useState<TimeSeriesPoint[]>([]);

  const loadData = useCallback(() => {
    api(`/api/datasets/${params.id}`)
      .then((r) => r.json())
      .then(setDataset);
    api(`/api/datasets/${params.id}/sources`)
      .then((r) => r.json())
      .then(setSources);
    api(`/api/datasets/${params.id}/runs`)
      .then((r) => r.json())
      .then(setRuns);
    // Load KPI summary
    const id = Number(params.id);
    setKpiLoading(true);
    fetchKpiSummary(id)
      .then(setKpi)
      .finally(() => setKpiLoading(false));
    fetchMetrics(id).then((m) => {
      setMetrics(m);
      // Load preview chart with default metric (weekly, all time)
      const defaultMetric = m.find((x) => x.default) || m[0];
      if (defaultMetric) {
        fetchTimeSeries(id, {
          metric_id: defaultMetric.id,
          granularity: "weekly",
        }).then(setPreviewChart);
      }
    });
  }, [params.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load connectors when add-source dialog opens
  useEffect(() => {
    if (addSourceOpen) {
      api("/api/connectors")
        .then((r) => r.json())
        .then(setConnectors);
    }
  }, [addSourceOpen]);

  // Load BQ tables when connector is selected
  useEffect(() => {
    if (selectedConnector) {
      setLoadingTables(true);
      setBqTables([]);
      setSelectedTable("");
      api(`/api/connectors/${selectedConnector}/tables`)
        .then(async (r) => {
          if (!r.ok) {
            const data = await r.json().catch(() => ({}));
            throw new Error(data.detail || "Failed to load tables");
          }
          return r.json();
        })
        .then((tables: BqTable[]) => {
          setBqTables(Array.isArray(tables) ? tables : []);
          if (tables.length > 0) setSelectedTable(tables[0].table_id);
        })
        .catch((err) => {
          setBqTables([]);
          setError(err instanceof Error ? err.message : "Failed to load tables");
        })
        .finally(() => setLoadingTables(false));
    }
  }, [selectedConnector]);

  const handleSave = async (newName: string) => {
    setSaving(true);
    setError("");
    try {
      const res = await api(`/api/datasets/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      setDataset(await res.json());
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
      await api(`/api/datasets/${params.id}`, { method: "DELETE" });
      router.push("/datasets");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const handleAddSource = async () => {
    if (!selectedConnector || !selectedTable) return;
    setAddingSource(true);
    setError("");
    try {
      const res = await api(`/api/datasets/${params.id}/sources`, {
        method: "POST",
        body: JSON.stringify({
          connector_id: selectedConnector,
          bq_table: selectedTable,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      setAddSourceOpen(false);
      setSelectedConnector(null);
      setBqTables([]);
      setSelectedTable("");
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setAddingSource(false);
    }
  };

  const handleDeleteSource = async () => {
    if (!deleteSourceId) return;
    setDeletingSource(true);
    try {
      await api(`/api/data-sources/${deleteSourceId}`, { method: "DELETE" });
      setDeleteSourceId(null);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setDeletingSource(false);
    }
  };

  const handleRunPipeline = async () => {
    setError("");
    try {
      const res = await api(`/api/datasets/${params.id}/run`, {
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

  if (!dataset) {
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
            {dataset.name}
          </h1>
          <Badge variant="secondary">{dataset.type}</Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditOpen(true)}
          >
            Edit
          </Button>
        </div>
        <div className="flex items-center gap-2">
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

      {dataset.description && (
        <p className="text-[var(--muted-foreground)] text-sm mb-6">
          {dataset.description}
        </p>
      )}

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
              href={`/review/${params.id}`}
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

      {/* Data Sources */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Connectors</CardTitle>
          <Button size="sm" onClick={() => setAddSourceOpen(true)}>
            Add Connector
          </Button>
        </CardHeader>
        <CardContent>
          {sources.length === 0 ? (
            <p className="text-[var(--muted-foreground)] text-sm">
              No connectors linked yet. Add a connector to start mapping columns.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Connector</TableHead>
                  <TableHead>BQ Table</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/datasets/${dataset.id}/sources/${s.id}`}
                        className="text-[var(--primary)] hover:underline"
                      >
                        {s.connector_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-[var(--muted-foreground)] font-mono text-xs">
                      {s.bq_table}
                    </TableCell>
                    <TableCell>
                      <Badge variant={sourceStatusVariant(s.status)}>
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button asChild variant="outline" size="sm">
                        <Link
                          href={`/datasets/${dataset.id}/sources/${s.id}/mapping`}
                        >
                          Map Columns
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => setDeleteSourceId(s.id)}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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

      {/* Add Source Dialog */}
      <Dialog
        open={addSourceOpen}
        onOpenChange={(v) => !v && setAddSourceOpen(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Connector</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Connector</Label>
              <select
                value={selectedConnector ?? ""}
                onChange={(e) =>
                  setSelectedConnector(
                    e.target.value ? Number(e.target.value) : null
                  )
                }
                className="flex h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              >
                <option value="">Select a connector...</option>
                {connectors
                  .filter((c) => c.status === "connected")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>

            {selectedConnector && (
              <div className="space-y-2">
                <Label>BQ Table</Label>
                {loadingTables ? (
                  <p className="text-sm text-[var(--muted-foreground)]">
                    Loading tables...
                  </p>
                ) : bqTables.length === 0 ? (
                  <p className="text-sm text-[var(--muted-foreground)]">
                    No tables found in this connector&apos;s schema.
                  </p>
                ) : (
                  <select
                    value={selectedTable}
                    onChange={(e) => setSelectedTable(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  >
                    {bqTables.map((t) => (
                      <option key={t.table_id} value={t.table_id}>
                        {t.table_id}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddSourceOpen(false)}
              disabled={addingSource}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddSource}
              disabled={!selectedConnector || !selectedTable || addingSource}
            >
              {addingSource ? "Adding..." : "Add Connector"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Source Confirmation */}
      <ConfirmDialog
        open={deleteSourceId !== null}
        onConfirm={handleDeleteSource}
        onCancel={() => setDeleteSourceId(null)}
        title="Remove Data Source"
        description="Are you sure? This will remove the data source and all its column mappings."
        confirmLabel="Remove"
        variant="destructive"
        loading={deletingSource}
      />

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

      {/* Edit/Delete Dataset Dialogs */}
      <ConfirmDialog
        open={deleteOpen}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
        title="Delete Data Source"
        description={`Are you sure you want to delete "${dataset.name}"? This will remove all connectors, mappings, and pipeline runs.`}
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
        defaultValue={dataset.name}
        loading={saving}
      />
    </div>
  );
}

export default function DatasetDetailPage() {
  return <DatasetDetail />;
}
