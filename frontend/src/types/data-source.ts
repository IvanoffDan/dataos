export interface DataSource {
  id: number;
  name: string;
  dataset_type: string;
  description: string;
  connector_id: number;
  connector_name: string;
  bq_table: string;
  raw_table: string | null;
  connector_category: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface DataSourceSummary {
  id: number;
  name: string;
  dataset_type: string;
  description: string;
  connector_name: string;
  bq_table: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface DatasetType {
  id: string;
  name: string;
  description: string;
}

export interface ColumnDef {
  name: string;
  description: string;
  data_type: string;
  required: boolean;
  max_length: number | null;
  min_value: number | null;
  format: string | null;
}

export interface SourceColumn {
  name: string;
  type: string;
}

export interface ExistingMapping {
  source_column: string | null;
  target_column: string;
  static_value: string | null;
}

export type MappingEntry =
  | { type: "column"; value: string }
  | { type: "static"; value: string };

export interface AiSuggestion {
  confidence: number;
  reasoning: string;
}
