"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchRuns, triggerRun, fetchRunErrors } from "@/lib/api/pipeline";

export const usePipelineRuns = (dataSourceId: number) =>
  useQuery({
    queryKey: ["pipeline-runs", dataSourceId],
    queryFn: () => fetchRuns(dataSourceId),
  });

export const useTriggerRun = (dataSourceId: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => triggerRun(dataSourceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline-runs", dataSourceId] });
      toast.success("Pipeline run triggered");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useRunErrors = (runId: number | null) =>
  useQuery({
    queryKey: ["run-errors", runId],
    queryFn: () => fetchRunErrors(runId!),
    enabled: runId !== null,
  });
