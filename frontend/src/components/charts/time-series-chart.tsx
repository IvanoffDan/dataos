"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import type { TimeSeriesPoint } from "@/types";

const COLORS = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#ca8a04",
  "#9333ea",
  "#0891b2",
  "#e11d48",
  "#65a30d",
  "#c026d3",
  "#ea580c",
];

interface TimeSeriesChartProps {
  data: TimeSeriesPoint[];
  grouped: boolean;
  loading?: boolean;
}

export function TimeSeriesChart({
  data,
  grouped,
  loading,
}: TimeSeriesChartProps) {
  if (loading) {
    return (
      <div className="h-[300px] bg-[var(--muted)] rounded animate-pulse" />
    );
  }

  if (data.length === 0) {
    return (
      <p className="text-[var(--muted-foreground)] text-sm py-8 text-center">
        No data for the selected filters.
      </p>
    );
  }

  const formatTick = (v: string) => {
    const d = new Date(v);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const formatValue = (value: number) =>
    value.toLocaleString(undefined, { maximumFractionDigits: 2 });

  if (grouped) {
    // Pivot data for stacked bar chart
    const groups = [...new Set(data.map((d) => d.group!))];
    const periods = [...new Set(data.map((d) => d.period))];
    const pivoted = periods.map((period) => {
      const row: Record<string, unknown> = { period };
      for (const g of groups) {
        const point = data.find((d) => d.period === period && d.group === g);
        row[g] = point?.value ?? 0;
      }
      return row;
    });

    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={pivoted}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="period" tick={{ fontSize: 12 }} tickFormatter={formatTick} />
          <YAxis tick={{ fontSize: 12 }} width={70} />
          <Tooltip
            formatter={(value) => formatValue(value as number)}
            labelFormatter={(label) =>
              new Date(String(label)).toLocaleDateString()
            }
          />
          <Legend />
          {groups.map((g, i) => (
            <Bar
              key={g}
              dataKey={g}
              stackId="a"
              fill={COLORS[i % COLORS.length]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="period" tick={{ fontSize: 12 }} tickFormatter={formatTick} />
        <YAxis tick={{ fontSize: 12 }} width={70} />
        <Tooltip
          formatter={(value) => formatValue(value as number)}
          labelFormatter={(label) =>
            new Date(String(label)).toLocaleDateString()
          }
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#2563eb"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
