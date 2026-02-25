import { apiFetch, api, jsonOrThrow } from "@/lib/api";
import type {
  DatasetLabelSummary,
  ColumnStatsResponse,
  ColumnValuesResponse,
  AutoLabelAllResponse,
  AutoLabelResponse,
} from "@/types";

export const fetchLabelSummary = (): Promise<DatasetLabelSummary[]> =>
  apiFetch("/api/labels/summary");

export const fetchColumnStats = (datasetType: string): Promise<ColumnStatsResponse> =>
  apiFetch(`/api/labels/types/${datasetType}/columns`);

export const fetchColumnValues = (
  datasetType: string,
  column: string
): Promise<ColumnValuesResponse> =>
  apiFetch(`/api/labels/types/${datasetType}/columns/${column}/values`);

export const saveColumnRules = (
  datasetType: string,
  column: string,
  rules: { match_value: string; replace_value: string }[]
): Promise<void> =>
  apiFetch(`/api/labels/types/${datasetType}/columns/${column}/rules`, {
    method: "PUT",
    body: JSON.stringify({ rules }),
  });

export const autoLabelAll = (datasetType: string): Promise<AutoLabelAllResponse> =>
  apiFetch(`/api/labels/types/${datasetType}/auto-label`, { method: "POST" });

export const undoAutoLabelAll = async (datasetType: string): Promise<void> => {
  const res = await api(`/api/labels/types/${datasetType}/auto-label`, {
    method: "DELETE",
  });
  await jsonOrThrow(res);
};

export const autoLabelColumn = (
  datasetType: string,
  column: string
): Promise<AutoLabelResponse> =>
  apiFetch(`/api/labels/types/${datasetType}/columns/${column}/auto-label`, {
    method: "POST",
  });

export const undoAutoLabelColumn = (
  datasetType: string,
  column: string
): Promise<{ deleted: number }> =>
  apiFetch(`/api/labels/types/${datasetType}/columns/${column}/auto-label`, {
    method: "DELETE",
  });
