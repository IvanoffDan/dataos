import { apiFetch } from "@/lib/api";
import type { PipelineRun, ValidationError } from "@/types";

export const fetchRuns = (dataSourceId: number): Promise<PipelineRun[]> =>
  apiFetch(`/api/data-sources/${dataSourceId}/runs`);

export const triggerRun = (dataSourceId: number): Promise<PipelineRun> =>
  apiFetch(`/api/data-sources/${dataSourceId}/run`, { method: "POST" });

export const fetchRunErrors = (runId: number): Promise<ValidationError[]> =>
  apiFetch(`/api/pipeline/runs/${runId}/errors`);
