"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { BreakdownItem } from "@/types";

interface BreakdownChartProps {
  data: BreakdownItem[];
  loading?: boolean;
}

export function BreakdownChart({ data, loading }: BreakdownChartProps) {
  if (loading) {
    return (
      <div className="h-[300px] bg-[var(--muted)] rounded animate-pulse" />
    );
  }

  if (data.length === 0) {
    return null;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 32)}>
      <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis type="number" tick={{ fontSize: 12 }} />
        <YAxis
          dataKey="dimension"
          type="category"
          tick={{ fontSize: 12 }}
          width={120}
        />
        <Tooltip
          formatter={(value) =>
            (value as number).toLocaleString(undefined, { maximumFractionDigits: 2 })
          }
        />
        <Bar dataKey="value" fill="#2563eb" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
