import { apiFetch, api, jsonOrThrow } from "@/lib/api";
import type { Connector, ConnectorSummary, ConnectorType, ConnectorOption, BqTable } from "@/types";

export const fetchConnectors = (): Promise<Connector[]> =>
  apiFetch("/api/connectors");

export const fetchConnector = (id: number): Promise<Connector> =>
  apiFetch(`/api/connectors/${id}`);

export const deleteConnector = async (id: number): Promise<void> => {
  const res = await api(`/api/connectors/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    await jsonOrThrow(res);
  }
};

export const updateConnector = (id: number, body: { name: string }): Promise<Connector> =>
  apiFetch(`/api/connectors/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const refreshAllConnectors = (): Promise<Connector[]> =>
  apiFetch("/api/connectors/refresh-all", { method: "POST" });

export const refreshConnectorStatus = (id: number): Promise<Connector> =>
  apiFetch(`/api/connectors/${id}/sync-status`, { method: "POST" });

export const createConnector = (body: { name: string; service: string }): Promise<{ id: number; connect_card_url: string }> =>
  apiFetch("/api/connectors", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const finalizeConnector = (id: number): Promise<void> =>
  apiFetch(`/api/connectors/${id}/finalize`, { method: "POST" });

export const retransformConnector = (id: number): Promise<{ message: string }> =>
  apiFetch(`/api/connectors/${id}/retransform`, { method: "POST" });

export const fetchConnectorTypes = (): Promise<ConnectorType[]> =>
  apiFetch("/api/connectors/types");

export const fetchConnectorTables = (connectorId: number): Promise<BqTable[]> =>
  apiFetch(`/api/connectors/${connectorId}/tables`);

export const fetchConnectorOptions = (): Promise<ConnectorOption[]> =>
  apiFetch("/api/connectors");
