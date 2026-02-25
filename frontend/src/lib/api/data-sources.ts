import { apiFetch, api } from "@/lib/api";
import type { DataSource, DataSourceSummary, DatasetType, ColumnDef, SourceColumn, ExistingMapping } from "@/types";

export const fetchDataSources = (): Promise<DataSourceSummary[]> =>
  apiFetch("/api/data-sources");

export const fetchDataSource = (id: number): Promise<DataSource> =>
  apiFetch(`/api/data-sources/${id}`);

export const createDataSource = (body: {
  name: string;
  dataset_type: string;
  description: string;
  connector_id: number;
  bq_table?: string;
}): Promise<DataSource> =>
  apiFetch("/api/data-sources", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateDataSource = (id: number, body: { name: string }): Promise<DataSource> =>
  apiFetch(`/api/data-sources/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const deleteDataSource = async (id: number): Promise<void> => {
  await api(`/api/data-sources/${id}`, { method: "DELETE" });
};

export const fetchDatasetTypes = (): Promise<DatasetType[]> =>
  apiFetch("/api/dataset-types");

export const fetchTargetColumns = (datasetType: string): Promise<ColumnDef[]> =>
  apiFetch(`/api/dataset-types/${datasetType}/columns`);

export const fetchSourceColumns = (dataSourceId: number): Promise<SourceColumn[]> =>
  apiFetch(`/api/data-sources/${dataSourceId}/source-columns`);

export const fetchMappings = (dataSourceId: number): Promise<ExistingMapping[]> =>
  apiFetch(`/api/data-sources/${dataSourceId}/mappings`);

export const saveMappings = (
  dataSourceId: number,
  mappings: { source_column: string; target_column: string; static_value: string | null }[]
): Promise<void> =>
  apiFetch(`/api/data-sources/${dataSourceId}/mappings`, {
    method: "PUT",
    body: JSON.stringify({ mappings }),
  });

export const approveDataSource = (dataSourceId: number): Promise<DataSource> =>
  apiFetch(`/api/data-sources/${dataSourceId}/approve`, { method: "POST" });

export const autoMap = (dataSourceId: number): Promise<{
  suggestions: {
    target_column: string;
    source_column: string | null;
    static_value: string | null;
    confidence: number;
    reasoning: string;
  }[];
}> =>
  apiFetch(`/api/data-sources/${dataSourceId}/auto-map`, { method: "POST" });
