"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  fetchConnectors,
  fetchConnector,
  deleteConnector,
  updateConnector,
  refreshAllConnectors,
  refreshConnectorStatus,
  retransformConnector,
  fetchConnectorTypes,
} from "@/lib/api/connectors";

export const useConnectors = () =>
  useQuery({ queryKey: ["connectors"], queryFn: fetchConnectors });

export const useConnector = (id: number) =>
  useQuery({ queryKey: ["connectors", id], queryFn: () => fetchConnector(id) });

export const useConnectorTypes = () =>
  useQuery({ queryKey: ["connector-types"], queryFn: fetchConnectorTypes });

export const useDeleteConnector = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteConnector,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["connectors"] });
      toast.success("Connector deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useUpdateConnector = (id: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string }) => updateConnector(id, body),
    onSuccess: (data) => {
      qc.setQueryData(["connectors", id], data);
      qc.invalidateQueries({ queryKey: ["connectors"] });
      toast.success("Connector updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useRefreshAllConnectors = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: refreshAllConnectors,
    onSuccess: (data) => {
      qc.setQueryData(["connectors"], data);
      toast.success("Connectors refreshed");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useRefreshConnectorStatus = (id: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => refreshConnectorStatus(id),
    onSuccess: (data) => {
      qc.setQueryData(["connectors", id], data);
      toast.success("Status refreshed");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useRetransformConnector = (id: number) =>
  useMutation({
    mutationFn: () => retransformConnector(id),
    onSuccess: (data) => toast.success(data.message),
    onError: (err: Error) => toast.error(err.message),
  });
