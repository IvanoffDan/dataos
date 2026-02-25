export interface DatasetLabelSummary {
  dataset_type: string;
  dataset_type_name: string;
  total_rules: number;
  columns_with_rules: number;
  total_string_columns: number;
}

export interface ColumnStats {
  column_name: string;
  description: string;
  distinct_count: number | null;
  rule_count: number;
  ai_rule_count: number;
  non_null_count: number | null;
  total_rows: number | null;
}

export interface ColumnStatsResponse {
  dataset_type: string;
  dataset_type_name: string;
  total_rows: number | null;
  columns: ColumnStats[];
}

export interface AutoLabelColumnResult {
  column_name: string;
  suggestion_count: number;
  skipped_count: number;
  error: string | null;
}

export interface AutoLabelAllResponse {
  columns: AutoLabelColumnResult[];
  total_suggestions: number;
  total_skipped: number;
}

export interface DistinctValue {
  value: string;
  row_count: number;
  percentage: number;
  replacement: string | null;
  ai_suggested: boolean | null;
  confidence: number | null;
}

export interface StaleRule {
  id: number;
  dataset_type: string;
  column_name: string;
  match_value: string;
  replace_value: string;
  ai_suggested: boolean | null;
  confidence: number | null;
  created_at: string;
}

export interface AutoLabelResponse {
  suggestions: { match_value: string; replace_value: string; confidence: number }[];
  skipped_count: number;
  error: string | null;
}

export interface ColumnValuesResponse {
  dataset_type: string;
  column_name: string;
  column_description: string;
  total_rows: number | null;
  distinct_count: number;
  rule_count: number;
  covered_row_count: number;
  values: DistinctValue[];
  stale_rules: StaleRule[];
}
