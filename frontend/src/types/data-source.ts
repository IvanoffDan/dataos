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
  mappings_accepted: boolean;
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

// --- Review Context ---

export interface ReviewMapping {
  target_column: string;
  target_type: string;
  target_description: string;
  target_required: boolean;
  source_column: string | null;
  static_value: string | null;
  confidence: number | null;
  reasoning: string | null;
  ai_suggested: boolean | null;
  sample_values: string[];
}

export interface ReviewLabelRule {
  id: number;
  match_value: string;
  replace_value: string;
  row_count: number;
  percentage: number;
  ai_suggested: boolean | null;
  confidence: number | null;
}

export interface ReviewLabelColumn {
  column_name: string;
  description: string;
  distinct_count: number;
  rule_count: number;
  ai_rule_count: number;
  coverage_pct: number;
  row_coverage_pct: number;
  rules: ReviewLabelRule[];
}

export interface ReviewSummary {
  total_target_columns: number;
  mapped_count: number;
  unmapped_required_count: number;
  high_confidence_count: number;
  needs_review_count: number;
  total_label_rules: number;
  label_columns_count: number;
  row_coverage_pct: number;
}

export interface ReviewContextResponse {
  data_source: DataSource;
  summary: ReviewSummary;
  mappings: ReviewMapping[];
  label_columns: ReviewLabelColumn[];
}
