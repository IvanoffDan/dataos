"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  fetchLabelSummary,
  fetchColumnStats,
  fetchColumnValues,
  saveColumnRules,
  autoLabelAll,
  undoAutoLabelAll,
  autoLabelColumn,
  undoAutoLabelColumn,
} from "@/lib/api/labels";

export const useLabelSummary = () =>
  useQuery({ queryKey: ["label-summary"], queryFn: fetchLabelSummary });

export const useColumnStats = (datasetType: string) =>
  useQuery({
    queryKey: ["column-stats", datasetType],
    queryFn: () => fetchColumnStats(datasetType),
    enabled: !!datasetType,
  });

export const useColumnValues = (datasetType: string, column: string) =>
  useQuery({
    queryKey: ["column-values", datasetType, column],
    queryFn: () => fetchColumnValues(datasetType, column),
    enabled: !!datasetType && !!column,
  });

export const useSaveColumnRules = (datasetType: string, column: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rules: { match_value: string; replace_value: string }[]) =>
      saveColumnRules(datasetType, column, rules),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["column-values", datasetType, column] });
      qc.invalidateQueries({ queryKey: ["column-stats", datasetType] });
      qc.invalidateQueries({ queryKey: ["label-summary"] });
      toast.success("Rules saved");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useAutoLabelAll = (datasetType: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => autoLabelAll(datasetType),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["column-stats", datasetType] });
      qc.invalidateQueries({ queryKey: ["label-summary"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useUndoAutoLabelAll = (datasetType: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => undoAutoLabelAll(datasetType),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["column-stats", datasetType] });
      qc.invalidateQueries({ queryKey: ["label-summary"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useAutoLabelColumn = (datasetType: string, column: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => autoLabelColumn(datasetType, column),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["column-values", datasetType, column] });
      qc.invalidateQueries({ queryKey: ["column-stats", datasetType] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useUndoAutoLabelColumn = (datasetType: string, column: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => undoAutoLabelColumn(datasetType, column),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["column-values", datasetType, column] });
      qc.invalidateQueries({ queryKey: ["column-stats", datasetType] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
};
