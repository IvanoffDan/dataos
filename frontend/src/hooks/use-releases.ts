"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  fetchReleases,
  fetchRelease,
  createRelease,
  fetchReleaseSummary,
  fetchReleaseData,
  compareReleases,
} from "@/lib/api/releases";

export const useReleases = () =>
  useQuery({ queryKey: ["releases"], queryFn: fetchReleases });

export const useRelease = (id: number) =>
  useQuery({ queryKey: ["releases", id], queryFn: () => fetchRelease(id) });

export const useCreateRelease = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createRelease,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["releases"] });
      toast.success("Release created");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useReleaseSummary = (releaseId: number, dataSourceId: number, enabled = true) =>
  useQuery({
    queryKey: ["release-summary", releaseId, dataSourceId],
    queryFn: () => fetchReleaseSummary(releaseId, dataSourceId),
    enabled,
  });

export const useReleaseData = (
  releaseId: number,
  dataSourceId: number,
  params: { offset?: number; limit?: number; sort_column?: string; sort_dir?: string }
) =>
  useQuery({
    queryKey: ["release-data", releaseId, dataSourceId, params],
    queryFn: () => fetchReleaseData(releaseId, dataSourceId, params),
  });

export const useCompareReleases = (r1: number, r2: number, enabled = true) =>
  useQuery({
    queryKey: ["release-compare", r1, r2],
    queryFn: () => compareReleases(r1, r2),
    enabled: enabled && !!r1 && !!r2,
  });
