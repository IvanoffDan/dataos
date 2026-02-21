import { api } from "@/lib/api";

export interface KpiSummary {
  total_rows: number;
  min_date: string | null;
  max_date: string | null;
  metrics: Record<string, number>;
}

export interface MetricDef {
  id: string;
  name: string;
  format_type: string;
  default: boolean;
}

export interface TimeSeriesPoint {
  period: string;
  value: number;
  group?: string;
}

export interface BreakdownItem {
  dimension: string;
  value: number;
}

export interface TableDataResponse {
  rows: Record<string, unknown>[];
  total_count: number;
  columns: string[];
}

export interface PreviewResponse {
  rows: Record<string, unknown>[];
  total_count: number;
  columns: string[];
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function fetchKpiSummary(datasetId: number): Promise<KpiSummary> {
  const res = await api(`/api/explore/datasets/${datasetId}/summary`);
  return jsonOrThrow(res);
}

export async function fetchMetrics(datasetId: number): Promise<MetricDef[]> {
  const res = await api(`/api/explore/datasets/${datasetId}/metrics`);
  return jsonOrThrow(res);
}

export async function fetchTimeSeries(
  datasetId: number,
  body: {
    metric_id: string;
    granularity?: string;
    group_by?: string | null;
    date_from?: string | null;
    date_to?: string | null;
  }
): Promise<TimeSeriesPoint[]> {
  const res = await api(`/api/explore/datasets/${datasetId}/time-series`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

export async function fetchBreakdown(
  datasetId: number,
  body: {
    metric_id: string;
    group_by: string;
    date_from?: string | null;
    date_to?: string | null;
    limit?: number;
  }
): Promise<BreakdownItem[]> {
  const res = await api(`/api/explore/datasets/${datasetId}/breakdown`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

export async function fetchTableData(
  datasetId: number,
  params: {
    offset?: number;
    limit?: number;
    sort_column?: string;
    sort_dir?: string;
  } = {}
): Promise<TableDataResponse> {
  const query = new URLSearchParams();
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.sort_column) query.set("sort_column", params.sort_column);
  if (params.sort_dir) query.set("sort_dir", params.sort_dir);
  const res = await api(`/api/explore/datasets/${datasetId}/data?${query}`);
  return jsonOrThrow(res);
}

export async function fetchRawPreview(
  dataSourceId: number,
  params: { offset?: number; limit?: number } = {}
): Promise<PreviewResponse> {
  const query = new URLSearchParams();
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  const res = await api(
    `/api/explore/data-sources/${dataSourceId}/raw-preview?${query}`
  );
  return jsonOrThrow(res);
}

export async function fetchMappedPreview(
  dataSourceId: number,
  params: { offset?: number; limit?: number } = {}
): Promise<PreviewResponse> {
  const query = new URLSearchParams();
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  const res = await api(
    `/api/explore/data-sources/${dataSourceId}/mapped-preview?${query}`
  );
  return jsonOrThrow(res);
}
