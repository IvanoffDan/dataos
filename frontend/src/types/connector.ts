export interface Connector {
  id: number;
  name: string;
  fivetran_connector_id: string | null;
  service: string;
  status: string;
  setup_state: string;
  sync_state: string | null;
  succeeded_at: string | null;
  failed_at: string | null;
  sync_frequency: number | null;
  schedule_type: string | null;
  paused: boolean;
  daily_sync_time: string | null;
  connector_category: string;
  requires_table_selection: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConnectorSummary {
  id: number;
  name: string;
  service: string;
  status: string;
  paused: boolean;
  succeeded_at: string | null;
  failed_at: string | null;
  sync_state: string | null;
  created_at: string;
}

export interface ConnectorType {
  id: string;
  name: string;
}

export interface ConnectorOption {
  id: number;
  name: string;
  schema_name: string;
  status: string;
  requires_table_selection: boolean;
  connector_category: string;
}

export interface BqTable {
  table_id: string;
  full_id: string;
}
