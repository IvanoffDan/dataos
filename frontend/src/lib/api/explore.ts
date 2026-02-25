import { api, jsonOrThrow } from "@/lib/api";
import type { KpiSummary, MetricDef, TimeSeriesPoint, BreakdownItem, TableDataResponse, PreviewResponse } from "@/types";

export const fetchKpiSummary = async (dataSourceId: number): Promise<KpiSummary> => {
  const res = await api(`/api/explore/data-sources/${dataSourceId}/summary`);
  return jsonOrThrow(res);
};

export const fetchMetrics = async (dataSourceId: number): Promise<MetricDef[]> => {
  const res = await api(`/api/explore/data-sources/${dataSourceId}/metrics`);
  return jsonOrThrow(res);
};

export const fetchTimeSeries = async (
  dataSourceId: number,
  body: {
    metric_id: string;
    granularity?: string;
    group_by?: string | null;
    date_from?: string | null;
    date_to?: string | null;
  }
): Promise<TimeSeriesPoint[]> => {
  const res = await api(`/api/explore/data-sources/${dataSourceId}/time-series`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
};

export const fetchBreakdown = async (
  dataSourceId: number,
  body: {
    metric_id: string;
    group_by: string;
    date_from?: string | null;
    date_to?: string | null;
    limit?: number;
  }
): Promise<BreakdownItem[]> => {
  const res = await api(`/api/explore/data-sources/${dataSourceId}/breakdown`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
};

export const fetchTableData = async (
  dataSourceId: number,
  params: {
    offset?: number;
    limit?: number;
    sort_column?: string;
    sort_dir?: string;
  } = {}
): Promise<TableDataResponse> => {
  const query = new URLSearchParams();
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.sort_column) query.set("sort_column", params.sort_column);
  if (params.sort_dir) query.set("sort_dir", params.sort_dir);
  const res = await api(`/api/explore/data-sources/${dataSourceId}/data?${query}`);
  return jsonOrThrow(res);
};

export const fetchRawPreview = async (
  dataSourceId: number,
  params: { offset?: number; limit?: number } = {}
): Promise<PreviewResponse> => {
  const query = new URLSearchParams();
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  const res = await api(`/api/explore/data-sources/${dataSourceId}/raw-preview?${query}`);
  return jsonOrThrow(res);
};

export const fetchMappedPreview = async (
  dataSourceId: number,
  params: { offset?: number; limit?: number } = {}
): Promise<PreviewResponse> => {
  const query = new URLSearchParams();
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  const res = await api(`/api/explore/data-sources/${dataSourceId}/mapped-preview?${query}`);
  return jsonOrThrow(res);
};
