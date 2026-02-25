export interface PipelineRun {
  id: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  rows_processed: number;
  rows_failed: number;
  version: number | null;
  error_summary: string | null;
  created_at: string;
}

export interface PipelineRunSummary {
  id: number;
  data_source_id: number;
  status: string;
  completed_at: string | null;
}

export interface ValidationError {
  id: number;
  row_number: number;
  column_name: string;
  error_type: string;
  error_message: string;
  source_value: string | null;
}
