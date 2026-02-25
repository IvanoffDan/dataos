"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  useConnector,
  useDeleteConnector,
  useUpdateConnector,
  useRefreshConnectorStatus,
  useRetransformConnector,
} from "@/hooks/use-connectors";
import { statusBadgeVariant, formatFrequencyLong, formatDateTime } from "@/lib/format";
import type { Connector } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EditDialog } from "@/components/shared/edit-dialog";
import { ErrorBanner } from "@/components/shared/error-banner";
import { PageHeader } from "@/components/shared/page-header";

const nextSyncEstimate = (connector: Connector): string => {
  if (connector.paused) return "Paused";
  if (!connector.succeeded_at || !connector.sync_frequency) return "\u2014";
  const last = new Date(connector.succeeded_at).getTime();
  const next = last + connector.sync_frequency * 60_000;
  if (next < Date.now()) return "Imminent";
  const diff = next - Date.now();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `~${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `~${hours}h`;
  return `~${Math.floor(hours / 24)}d`;
};

const ConnectorDetail = () => {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const { data: connector, isLoading, error } = useConnector(id);
  const updateMutation = useUpdateConnector(id);
  const deleteMutation = useDeleteConnector();
  const refreshMutation = useRefreshConnectorStatus(id);
  const retransformMutation = useRetransformConnector(id);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (error) return <ErrorBanner message={error.message} />;
  if (isLoading || !connector) {
    return <p className="text-[var(--muted-foreground)]">Loading...</p>;
  }

  const lastSuccess = connector.succeeded_at
    ? new Date(connector.succeeded_at).getTime()
    : 0;
  const lastFailure = connector.failed_at
    ? new Date(connector.failed_at).getTime()
    : 0;
  const healthy = lastSuccess >= lastFailure;

  return (
    <div>
      <PageHeader
        backHref="/connectors"
        backLabel="Back to Connectors"
        title={connector.name}
        badges={
          <>
            <Badge variant={statusBadgeVariant(connector.status)}>
              {connector.status}
            </Badge>
            {connector.connector_category && connector.connector_category !== "passthrough" && (
              <Badge variant="secondary">{connector.connector_category}</Badge>
            )}
            {connector.paused && <Badge variant="secondary">Paused</Badge>}
            <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
          </>
        }
        actions={
          <>
            {connector.connector_category !== "passthrough" && (
              <Button
                variant="outline"
                onClick={() => retransformMutation.mutate()}
                disabled={retransformMutation.isPending}
              >
                {retransformMutation.isPending ? "Triggering..." : "Re-run Transform"}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending || !connector.fivetran_connector_id}
            >
              {refreshMutation.isPending ? "Refreshing..." : "Refresh Status"}
            </Button>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Connector Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <dt className="text-[var(--muted-foreground)]">Service</dt>
              <dd>{connector.service || "\u2014"}</dd>
              <dt className="text-[var(--muted-foreground)]">Category</dt>
              <dd className="capitalize">{connector.connector_category}</dd>
              <dt className="text-[var(--muted-foreground)]">Fivetran ID</dt>
              <dd className="font-mono text-xs">
                {connector.fivetran_connector_id || "\u2014"}
              </dd>
              <dt className="text-[var(--muted-foreground)]">Setup State</dt>
              <dd>{connector.setup_state}</dd>
              <dt className="text-[var(--muted-foreground)]">Created</dt>
              <dd>{new Date(connector.created_at).toLocaleString()}</dd>
              <dt className="text-[var(--muted-foreground)]">Updated</dt>
              <dd>{new Date(connector.updated_at).toLocaleString()}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sync Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <dt className="text-[var(--muted-foreground)]">Sync State</dt>
              <dd>{connector.sync_state || "\u2014"}</dd>
              <dt className="text-[var(--muted-foreground)]">Frequency</dt>
              <dd>{formatFrequencyLong(connector.sync_frequency)}</dd>
              <dt className="text-[var(--muted-foreground)]">Schedule Type</dt>
              <dd className="capitalize">{connector.schedule_type || "\u2014"}</dd>
              {connector.daily_sync_time && (
                <>
                  <dt className="text-[var(--muted-foreground)]">Daily Sync Time</dt>
                  <dd>{connector.daily_sync_time}</dd>
                </>
              )}
              <dt className="text-[var(--muted-foreground)]">Next Sync</dt>
              <dd>{nextSyncEstimate(connector)}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Sync History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    !lastSuccess && !lastFailure
                      ? "bg-gray-100"
                      : healthy
                        ? "bg-green-100"
                        : "bg-red-100"
                  }`}
                >
                  <span className="text-lg">
                    {!lastSuccess && !lastFailure
                      ? "\u2014"
                      : healthy
                        ? "\u2713"
                        : "\u2717"}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {!lastSuccess && !lastFailure
                      ? "No syncs yet"
                      : healthy
                        ? "Healthy"
                        : "Last sync failed"}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">Current health</p>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-green-700">Last Success</p>
                <p className="text-sm">{formatDateTime(connector.succeeded_at)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-red-700">Last Failure</p>
                <p className="text-sm">{formatDateTime(connector.failed_at)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onConfirm={() =>
          deleteMutation.mutate(id, {
            onSuccess: () => router.push("/connectors"),
          })
        }
        onCancel={() => setDeleteOpen(false)}
        title="Delete Connector"
        description={`Are you sure you want to delete "${connector.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
      />

      <EditDialog
        open={editOpen}
        onSave={(newName) =>
          updateMutation.mutate({ name: newName }, { onSuccess: () => setEditOpen(false) })
        }
        onCancel={() => setEditOpen(false)}
        title="Rename Connector"
        label="Connector Name"
        defaultValue={connector.name}
        loading={updateMutation.isPending}
      />
    </div>
  );
};

const ConnectorDetailPage = () => <ConnectorDetail />;
export default ConnectorDetailPage;
