"use client";

import { MetricDef } from "@/lib/explore-api";

interface MetricControlsProps {
  metrics: MetricDef[];
  selectedMetric: string;
  onMetricChange: (id: string) => void;
  granularity: string;
  onGranularityChange: (g: string) => void;
  groupBy: string | null;
  onGroupByChange: (col: string | null) => void;
  groupByOptions: string[];
  dateRange: string;
  onDateRangeChange: (r: string) => void;
}

const selectClass =
  "h-9 rounded-md border border-[var(--border)] bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]";

export function MetricControls({
  metrics,
  selectedMetric,
  onMetricChange,
  granularity,
  onGranularityChange,
  groupBy,
  onGroupByChange,
  groupByOptions,
  dateRange,
  onDateRangeChange,
}: MetricControlsProps) {
  return (
    <div className="flex flex-wrap gap-3 items-center">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-[var(--muted-foreground)]">Metric</label>
        <select
          value={selectedMetric}
          onChange={(e) => onMetricChange(e.target.value)}
          className={selectClass}
        >
          {metrics.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-[var(--muted-foreground)]">
          Granularity
        </label>
        <select
          value={granularity}
          onChange={(e) => onGranularityChange(e.target.value)}
          className={selectClass}
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-[var(--muted-foreground)]">
          Group By
        </label>
        <select
          value={groupBy ?? ""}
          onChange={(e) =>
            onGroupByChange(e.target.value === "" ? null : e.target.value)
          }
          className={selectClass}
        >
          <option value="">None</option>
          {groupByOptions.map((col) => (
            <option key={col} value={col}>
              {col}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-[var(--muted-foreground)]">
          Date Range
        </label>
        <select
          value={dateRange}
          onChange={(e) => onDateRangeChange(e.target.value)}
          className={selectClass}
        >
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="6mo">Last 6 months</option>
          <option value="1yr">Last 1 year</option>
          <option value="all">All time</option>
        </select>
      </div>
    </div>
  );
}
