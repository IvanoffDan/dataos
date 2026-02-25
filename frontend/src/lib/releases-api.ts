import { api } from "@/lib/api";

export interface ReleaseEntry {
  id: number;
  data_source_id: number;
  data_source_name: string | null;
  dataset_type: string | null;
  pipeline_run_version: number;
  rows_processed: number;
}

export interface Release {
  id: number;
  version: number;
  name: string;
  description: string | null;
  created_by: number;
  created_at: string;
  entries: ReleaseEntry[];
}

export interface ReleaseListItem {
  id: number;
  version: number;
  name: string;
  description: string | null;
  created_at: string;
  data_source_count: number;
  total_rows: number;
}

export interface KpiSummary {
  total_rows: number;
  min_date: string | null;
  max_date: string | null;
  metrics: Record<string, number>;
}

export interface TableDataResponse {
  rows: Record<string, unknown>[];
  total_count: number;
  columns: string[];
}

export interface DataSourceDiff {
  data_source_id: number;
  data_source_name: string;
  dataset_type: string;
  r1_version: number | null;
  r1_rows: number | null;
  r2_version: number | null;
  r2_rows: number | null;
}

export interface ReleaseCompareResponse {
  r1: ReleaseListItem;
  r2: ReleaseListItem;
  diffs: DataSourceDiff[];
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function fetchReleases(): Promise<ReleaseListItem[]> {
  const res = await api("/api/releases");
  return jsonOrThrow(res);
}

export async function createRelease(body: {
  name: string;
  description?: string;
}): Promise<Release> {
  const res = await api("/api/releases", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

export async function fetchRelease(id: number): Promise<Release> {
  const res = await api(`/api/releases/${id}`);
  return jsonOrThrow(res);
}

export async function fetchReleaseSummary(
  releaseId: number,
  dataSourceId: number
): Promise<KpiSummary> {
  const res = await api(
    `/api/releases/${releaseId}/data-sources/${dataSourceId}/summary`
  );
  return jsonOrThrow(res);
}

export async function fetchReleaseData(
  releaseId: number,
  dataSourceId: number,
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
  const res = await api(
    `/api/releases/${releaseId}/data-sources/${dataSourceId}/data?${query}`
  );
  return jsonOrThrow(res);
}

export async function compareReleases(
  r1: number,
  r2: number
): Promise<ReleaseCompareResponse> {
  const res = await api(`/api/releases/compare?r1=${r1}&r2=${r2}`);
  return jsonOrThrow(res);
}
