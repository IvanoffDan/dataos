"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useDataSource } from "@/hooks/use-data-sources";
import { useKpiSummary, useMetrics, useTimeSeries, useBreakdown, useTableData } from "@/hooks/use-explore";
import { formatMetricValue } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/charts/kpi-card";
import { MetricControls } from "@/components/charts/metric-controls";
import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { BreakdownChart } from "@/components/charts/breakdown-chart";
import { DataTable } from "@/components/data-table/data-table";
import { ErrorBanner } from "@/components/shared/error-banner";
import { SortingState } from "@tanstack/react-table";

const dateRangeToFrom = (range: string): string | null => {
  if (range === "all") return null;
  const now = new Date();
  const map: Record<string, number> = { "30d": 30, "90d": 90, "6mo": 180, "1yr": 365 };
  const days = map[range] ?? 90;
  now.setDate(now.getDate() - days);
  return now.toISOString().split("T")[0];
};

const getGroupByOptions = (type: string): string[] => {
  const sales = ["division", "brand", "category", "product", "geography", "sales_channel", "currency_code"];
  const paidMedia = ["media_channel", "funnel_stage", "format", "publisher", "geography", "brand", "category", "product", "geography_breakdown"];
  if (type === "sales") return sales;
  if (type === "paid_media") return paidMedia;
  return [];
};

const PAGE_SIZE = 50;

const DataSourceExplorer = () => {
  const params = useParams();
  const dataSourceId = Number(params.id);

  const { data: dataSource, error: dsError } = useDataSource(dataSourceId);
  const { data: kpi, isLoading: kpiLoading } = useKpiSummary(dataSourceId);
  const { data: metrics = [] } = useMetrics(dataSourceId);

  const [selectedMetric, setSelectedMetric] = useState("");
  const [granularity, setGranularity] = useState("weekly");
  const [groupBy, setGroupBy] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState("all");
  const [activeTab, setActiveTab] = useState<"chart" | "table">("chart");
  const [tablePage, setTablePage] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([]);

  // Auto-select default metric
  const effectiveMetric = selectedMetric || metrics.find((m) => m.default)?.id || metrics[0]?.id || "";
  if (effectiveMetric && !selectedMetric && metrics.length > 0) {
    setSelectedMetric(effectiveMetric);
  }

  const { data: tsData = [], isLoading: tsLoading } = useTimeSeries(
    dataSourceId,
    { metric_id: effectiveMetric, granularity, group_by: groupBy, date_from: dateRangeToFrom(dateRange) },
    activeTab === "chart" && !!effectiveMetric
  );

  const { data: breakdownData = [], isLoading: breakdownLoading } = useBreakdown(
    dataSourceId,
    { metric_id: effectiveMetric, group_by: groupBy!, date_from: dateRangeToFrom(dateRange) },
    activeTab === "chart" && !!groupBy && !!effectiveMetric
  );

  const sortCol = sorting[0]?.id;
  const sortDir = sorting[0]?.desc === false ? "asc" : "desc";
  const { data: tableData, isLoading: tableLoading } = useTableData(
    dataSourceId,
    { offset: tablePage * PAGE_SIZE, limit: PAGE_SIZE, sort_column: sortCol, sort_dir: sortDir },
    activeTab === "table"
  );

  const currentMetric = metrics.find((m) => m.id === effectiveMetric);

  if (dsError) return <ErrorBanner message={dsError.message} />;
  if (!dataSource) return <p className="text-[var(--muted-foreground)]">Loading...</p>;

  return (
    <div>
      <div className="mb-4">
        <Link href="/review" className="text-[var(--primary)] hover:underline text-sm">
          &larr; Back to Review & QA
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-[var(--primary)] mb-6">{dataSource.name}</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Total Rows" value={kpi ? kpi.total_rows.toLocaleString() : "\u2014"} loading={kpiLoading} />
        <KpiCard
          label="Date Range"
          value={kpi?.min_date && kpi?.max_date ? `${kpi.min_date} \u2014 ${kpi.max_date}` : "\u2014"}
          loading={kpiLoading}
        />
        {metrics.slice(0, 2).map((m) => (
          <KpiCard
            key={m.id}
            label={m.name}
            value={kpi?.metrics[m.id] !== undefined ? formatMetricValue(kpi.metrics[m.id], m.format_type) : "\u2014"}
            loading={kpiLoading}
          />
        ))}
      </div>

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

      {activeTab === "chart" && (
        <div className="space-y-6">
          <MetricControls
            metrics={metrics}
            selectedMetric={effectiveMetric}
            onMetricChange={setSelectedMetric}
            granularity={granularity}
            onGranularityChange={setGranularity}
            groupBy={groupBy}
            onGroupByChange={setGroupBy}
            groupByOptions={getGroupByOptions(dataSource.dataset_type)}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
          />
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{currentMetric?.name ?? "Metric"} over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <TimeSeriesChart data={tsData} grouped={!!groupBy} loading={tsLoading} />
            </CardContent>
          </Card>
          {groupBy && breakdownData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{currentMetric?.name} by {groupBy}</CardTitle>
              </CardHeader>
              <CardContent>
                <BreakdownChart data={breakdownData} loading={breakdownLoading} />
              </CardContent>
            </Card>
          )}
        </div>
      )}

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
};

const DataSourceExplorePage = () => <DataSourceExplorer />;
export default DataSourceExplorePage;
