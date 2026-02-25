"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  fetchDataSources,
  fetchDataSource,
  createDataSource,
  updateDataSource,
  deleteDataSource,
  approveDataSource,
  retryDataSource,
  fetchDatasetTypes,
  fetchTargetColumns,
  fetchSourceColumns,
  fetchMappings,
  saveMappings,
  autoMap,
  fetchReviewContext,
  patchMapping,
  reprocessDataSource,
  acceptMappings,
  resetMappingsAccepted,
} from "@/lib/api/data-sources";

export const useDataSources = () =>
  useQuery({ queryKey: ["data-sources"], queryFn: fetchDataSources });

export const useDataSource = (id: number) =>
  useQuery({ queryKey: ["data-sources", id], queryFn: () => fetchDataSource(id) });

export const useDatasetTypes = () =>
  useQuery({ queryKey: ["dataset-types"], queryFn: fetchDatasetTypes });

export const useTargetColumns = (datasetType: string) =>
  useQuery({
    queryKey: ["target-columns", datasetType],
    queryFn: () => fetchTargetColumns(datasetType),
    enabled: !!datasetType,
  });

export const useSourceColumns = (dataSourceId: number) =>
  useQuery({
    queryKey: ["source-columns", dataSourceId],
    queryFn: () => fetchSourceColumns(dataSourceId),
  });

export const useMappings = (dataSourceId: number) =>
  useQuery({
    queryKey: ["mappings", dataSourceId],
    queryFn: () => fetchMappings(dataSourceId),
  });

export const useCreateDataSource = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createDataSource,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["data-sources"] });
      toast.success("Data source created");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useUpdateDataSource = (id: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string }) => updateDataSource(id, body),
    onSuccess: (data) => {
      qc.setQueryData(["data-sources", id], data);
      qc.invalidateQueries({ queryKey: ["data-sources"] });
      toast.success("Data source updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useDeleteDataSource = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteDataSource,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["data-sources"] });
      toast.success("Data source deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useSaveMappings = (dataSourceId: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mappings: { source_column: string; target_column: string; static_value: string | null }[]) =>
      saveMappings(dataSourceId, mappings),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mappings", dataSourceId] });
      qc.invalidateQueries({ queryKey: ["data-sources", dataSourceId] });
      toast.success("Mappings saved");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useDataSourcePolling = (id: number) =>
  useQuery({
    queryKey: ["data-sources", id],
    queryFn: () => fetchDataSource(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "auto_mapping" || status === "auto_labelling"
        ? 5000
        : false;
    },
  });

export const useApproveDataSource = (id: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => approveDataSource(id),
    onSuccess: (data) => {
      qc.setQueryData(["data-sources", id], data);
      qc.invalidateQueries({ queryKey: ["data-sources"] });
      toast.success("Data source approved");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useRetryDataSource = (id: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => retryDataSource(id),
    onSuccess: (data) => {
      qc.setQueryData(["data-sources", id], data);
      qc.invalidateQueries({ queryKey: ["data-sources"] });
      toast.success("Retrying automated processing");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useAutoMap = (dataSourceId: number) =>
  useMutation({
    mutationFn: () => autoMap(dataSourceId),
    onError: (err: Error) => toast.error(err.message),
  });

export const useReviewContext = (id: number) =>
  useQuery({
    queryKey: ["review-context", id],
    queryFn: () => fetchReviewContext(id),
  });

export const usePatchMapping = (dsId: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ targetColumn, body }: { targetColumn: string; body: { source_column?: string | null; static_value?: string | null } }) =>
      patchMapping(dsId, targetColumn, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["review-context", dsId] });
      qc.invalidateQueries({ queryKey: ["mappings", dsId] });
      toast.success("Mapping updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useAcceptMappings = (id: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reprocess: boolean = false) => acceptMappings(id, reprocess),
    onSuccess: (data) => {
      qc.setQueryData(["data-sources", id], data);
      qc.invalidateQueries({ queryKey: ["review-context", id] });
      qc.invalidateQueries({ queryKey: ["data-sources"] });
      toast.success("Mappings accepted");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useResetMappingsAccepted = (id: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => resetMappingsAccepted(id),
    onSuccess: (data) => {
      qc.setQueryData(["data-sources", id], data);
      qc.invalidateQueries({ queryKey: ["review-context", id] });
      qc.invalidateQueries({ queryKey: ["data-sources"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useReprocessDataSource = (id: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => reprocessDataSource(id),
    onSuccess: (data) => {
      qc.setQueryData(["data-sources", id], data);
      qc.invalidateQueries({ queryKey: ["review-context", id] });
      qc.invalidateQueries({ queryKey: ["data-sources"] });
      toast.success("Re-processing started");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};
