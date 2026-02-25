"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchKpiSummary,
  fetchMetrics,
  fetchTimeSeries,
  fetchBreakdown,
  fetchTableData,
} from "@/lib/api/explore";

export const useKpiSummary = (dataSourceId: number) =>
  useQuery({
    queryKey: ["kpi-summary", dataSourceId],
    queryFn: () => fetchKpiSummary(dataSourceId),
  });

export const useMetrics = (dataSourceId: number) =>
  useQuery({
    queryKey: ["metrics", dataSourceId],
    queryFn: () => fetchMetrics(dataSourceId),
  });

export const useTimeSeries = (
  dataSourceId: number,
  body: {
    metric_id: string;
    granularity?: string;
    group_by?: string | null;
    date_from?: string | null;
  },
  enabled = true
) =>
  useQuery({
    queryKey: ["time-series", dataSourceId, body],
    queryFn: () => fetchTimeSeries(dataSourceId, body),
    enabled: enabled && !!body.metric_id,
  });

export const useBreakdown = (
  dataSourceId: number,
  body: {
    metric_id: string;
    group_by: string;
    date_from?: string | null;
  },
  enabled = true
) =>
  useQuery({
    queryKey: ["breakdown", dataSourceId, body],
    queryFn: () => fetchBreakdown(dataSourceId, body),
    enabled,
  });

export const useTableData = (
  dataSourceId: number,
  params: {
    offset?: number;
    limit?: number;
    sort_column?: string;
    sort_dir?: string;
  },
  enabled = true
) =>
  useQuery({
    queryKey: ["table-data", dataSourceId, params],
    queryFn: () => fetchTableData(dataSourceId, params),
    enabled,
  });
