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
