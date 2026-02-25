import type { ConnectorSummary } from "./connector";

export interface DataSourceSummaryDashboard {
  id: number;
  name: string;
  dataset_type: string;
  connector_name: string;
  latest_run_status: string | null;
  latest_run_at: string | null;
  rule_count: number;
}

export interface RecentRunItem {
  id: number;
  data_source_id: number;
  data_source_name: string;
  status: string;
  rows_processed: number;
  completed_at: string | null;
  created_at: string;
}

export interface DashboardData {
  connector_count: number;
  connectors_healthy: number;
  connectors_failing: number;
  connectors_syncing: number;
  latest_sync: string | null;
  data_source_count: number;
  total_runs: number;
  runs_succeeded: number;
  runs_failed: number;
  total_rows_processed: number;
  total_label_rules: number;
  types_with_rules: number;
  connectors: ConnectorSummary[];
  data_sources: DataSourceSummaryDashboard[];
  recent_runs: RecentRunItem[];
}
