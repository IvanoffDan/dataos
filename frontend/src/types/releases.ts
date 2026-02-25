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
