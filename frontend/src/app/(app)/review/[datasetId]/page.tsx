"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  fetchKpiSummary,
  fetchMetrics,
  fetchTimeSeries,
  fetchBreakdown,
  fetchTableData,
  KpiSummary,
  MetricDef,
  TimeSeriesPoint,
  BreakdownItem,
  TableDataResponse,
} from "@/lib/explore-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/charts/kpi-card";
import { MetricControls } from "@/components/charts/metric-controls";
import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { BreakdownChart } from "@/components/charts/breakdown-chart";
import { DataTable } from "@/components/data-table/data-table";
import { SortingState } from "@tanstack/react-table";

interface Dataset {
  id: number;
  name: string;
  type: string;
}

function dateRangeToFrom(range: string): string | null {
  if (range === "all") return null;
  const now = new Date();
  const map: Record<string, number> = {
    "30d": 30,
    "90d": 90,
    "6mo": 180,
    "1yr": 365,
  };
  const days = map[range] ?? 90;
  now.setDate(now.getDate() - days);
  return now.toISOString().split("T")[0];
}

// Get groupable columns for a dataset type (string columns)
function getGroupByOptions(type: string): string[] {
  const sales = [
    "division",
    "brand",
    "category",
    "product",
    "geography",
    "sales_channel",
    "currency_code",
  ];
  const paidMedia = [
    "media_channel",
    "funnel_stage",
    "format",
    "publisher",
    "geography",
    "brand",
    "category",
    "product",
    "geography_breakdown",
  ];
  if (type === "sales") return sales;
  if (type === "paid_media") return paidMedia;
  return [];
}

function formatMetricValue(value: number, formatType: string): string {
  if (formatType === "currency") {
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function DatasetExplorer() {
  const params = useParams();
  const datasetId = Number(params.datasetId);

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [kpi, setKpi] = useState<KpiSummary | null>(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [metrics, setMetrics] = useState<MetricDef[]>([]);

  // Controls
  const [selectedMetric, setSelectedMetric] = useState("");
  const [granularity, setGranularity] = useState("weekly");
  const [groupBy, setGroupBy] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState("all");

  // Chart data
  const [tsData, setTsData] = useState<TimeSeriesPoint[]>([]);
  const [tsLoading, setTsLoading] = useState(false);
  const [breakdownData, setBreakdownData] = useState<BreakdownItem[]>([]);
  const [breakdownLoading, setBreakdownLoading] = useState(false);

  // Table data
  const [tableData, setTableData] = useState<TableDataResponse | null>(null);
  const [tablePage, setTablePage] = useState(0);
  const [tableLoading, setTableLoading] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);

  // Tab
  const [activeTab, setActiveTab] = useState<"chart" | "table">("chart");

  const PAGE_SIZE = 50;

  // Load dataset + KPIs + metrics
  useEffect(() => {
    api(`/api/datasets/${datasetId}`)
      .then((r) => r.json())
      .then(setDataset);

    setKpiLoading(true);
    fetchKpiSummary(datasetId)
      .then(setKpi)
      .finally(() => setKpiLoading(false));

    fetchMetrics(datasetId).then((m) => {
      setMetrics(m);
      const def = m.find((x) => x.default) || m[0];
      if (def) setSelectedMetric(def.id);
    });
  }, [datasetId]);

  // Load chart data when controls change
  const loadCharts = useCallback(() => {
    if (!selectedMetric) return;

    setTsLoading(true);
    fetchTimeSeries(datasetId, {
      metric_id: selectedMetric,
      granularity,
      group_by: groupBy,
      date_from: dateRangeToFrom(dateRange),
    })
      .then(setTsData)
      .finally(() => setTsLoading(false));

    if (groupBy) {
      setBreakdownLoading(true);
      fetchBreakdown(datasetId, {
        metric_id: selectedMetric,
        group_by: groupBy,
        date_from: dateRangeToFrom(dateRange),
      })
        .then(setBreakdownData)
        .finally(() => setBreakdownLoading(false));
    } else {
      setBreakdownData([]);
    }
  }, [datasetId, selectedMetric, granularity, groupBy, dateRange]);

  useEffect(() => {
    if (activeTab === "chart") loadCharts();
  }, [activeTab, loadCharts]);

  // Load table data
  const loadTable = useCallback(() => {
    setTableLoading(true);
    const sortCol = sorting[0]?.id;
    const sortDir = sorting[0]?.desc === false ? "asc" : "desc";
    fetchTableData(datasetId, {
      offset: tablePage * PAGE_SIZE,
      limit: PAGE_SIZE,
      sort_column: sortCol,
      sort_dir: sortDir,
    })
      .then(setTableData)
      .finally(() => setTableLoading(false));
  }, [datasetId, tablePage, sorting]);

  useEffect(() => {
    if (activeTab === "table") loadTable();
  }, [activeTab, loadTable]);

  const currentMetric = metrics.find((m) => m.id === selectedMetric);

  if (!dataset) {
    return <p className="text-[var(--muted-foreground)]">Loading...</p>;
  }

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/review"
          className="text-[var(--primary)] hover:underline text-sm"
        >
          &larr; Back to Review & QA
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-[var(--primary)] mb-6">
        {dataset.name}
      </h1>

      {/* KPI Cards */}
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
                ? formatMetricValue(kpi.metrics[m.id], m.format_type)
                : "—"
            }
            loading={kpiLoading}
          />
        ))}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-4 border-b border-[var(--border)]">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "chart"
              ? "border-[var(--primary)] text-[var(--primary)]"
              : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          }`}
          onClick={() => setActiveTab("chart")}
        >
          Chart View
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "table"
              ? "border-[var(--primary)] text-[var(--primary)]"
              : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          }`}
          onClick={() => setActiveTab("table")}
        >
          Table View
        </button>
      </div>

      {/* Chart View */}
      {activeTab === "chart" && (
        <div className="space-y-6">
          <MetricControls
            metrics={metrics}
            selectedMetric={selectedMetric}
            onMetricChange={setSelectedMetric}
            granularity={granularity}
            onGranularityChange={setGranularity}
            groupBy={groupBy}
            onGroupByChange={setGroupBy}
            groupByOptions={getGroupByOptions(dataset.type)}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {currentMetric?.name ?? "Metric"} over Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TimeSeriesChart
                data={tsData}
                grouped={!!groupBy}
                loading={tsLoading}
              />
            </CardContent>
          </Card>

          {groupBy && breakdownData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {currentMetric?.name} by {groupBy}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BreakdownChart
                  data={breakdownData}
                  loading={breakdownLoading}
                />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Table View */}
      {activeTab === "table" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Data
              {tableData && (
                <span className="text-sm font-normal text-[var(--muted-foreground)] ml-2">
                  ({tableData.total_count.toLocaleString()} rows)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={tableData?.columns ?? []}
              rows={tableData?.rows ?? []}
              totalCount={tableData?.total_count ?? 0}
              page={tablePage}
              pageSize={PAGE_SIZE}
              onPageChange={setTablePage}
              sorting={sorting}
              onSortingChange={setSorting}
              loading={tableLoading}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function DatasetExplorePage() {
  return <DatasetExplorer />;
}
