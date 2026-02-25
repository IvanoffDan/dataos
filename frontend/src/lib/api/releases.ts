import { api, jsonOrThrow } from "@/lib/api";
import type { Release, ReleaseListItem, KpiSummary, TableDataResponse, ReleaseCompareResponse } from "@/types";

export const fetchReleases = async (): Promise<ReleaseListItem[]> => {
  const res = await api("/api/releases");
  return jsonOrThrow(res);
};

export const createRelease = async (body: {
  name: string;
  description?: string;
}): Promise<Release> => {
  const res = await api("/api/releases", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
};

export const fetchRelease = async (id: number): Promise<Release> => {
  const res = await api(`/api/releases/${id}`);
  return jsonOrThrow(res);
};

export const fetchReleaseSummary = async (
  releaseId: number,
  dataSourceId: number
): Promise<KpiSummary> => {
  const res = await api(
    `/api/releases/${releaseId}/data-sources/${dataSourceId}/summary`
  );
  return jsonOrThrow(res);
};

export const fetchReleaseData = async (
  releaseId: number,
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
  const res = await api(
    `/api/releases/${releaseId}/data-sources/${dataSourceId}/data?${query}`
  );
  return jsonOrThrow(res);
};

export const compareReleases = async (
  r1: number,
  r2: number
): Promise<ReleaseCompareResponse> => {
  const res = await api(`/api/releases/compare?r1=${r1}&r2=${r2}`);
  return jsonOrThrow(res);
};
