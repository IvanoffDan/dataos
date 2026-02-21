"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EditDialog } from "@/components/edit-dialog";

interface Connector {
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
  created_at: string;
  updated_at: string;
}

function statusBadgeVariant(
  status: string
): "success" | "warning" | "error" | "secondary" {
  switch (status) {
    case "connected":
      return "success";
    case "setup_incomplete":
      return "warning";
    case "broken":
      return "error";
    default:
      return "secondary";
  }
}

function formatFrequency(minutes: number | null): string {
  if (!minutes) return "\u2014";
  if (minutes < 60) return `Every ${minutes} minutes`;
  if (minutes === 60) return "Every hour";
  if (minutes < 1440) return `Every ${Math.round(minutes / 60)} hours`;
  return `Every ${Math.round(minutes / 1440)} days`;
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  return new Date(dateStr).toLocaleString();
}

function nextSyncEstimate(connector: Connector): string {
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
}

function ConnectorDetail() {
  const params = useParams();
  const router = useRouter();
  const [connector, setConnector] = useState<Connector | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api(`/api/connectors/${params.id}`)
      .then((res) => res.json())
      .then(setConnector);
  }, [params.id]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError("");
    try {
      const res = await api(`/api/connectors/${params.id}/sync-status`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to refresh status");
      }
      setConnector(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRefreshing(false);
    }
  };

  const handleSave = async (newName: string) => {
    setSaving(true);
    setError("");
    try {
      const res = await api(`/api/connectors/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to update connector");
      }
      setConnector(await res.json());
      setEditOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      const res = await api(`/api/connectors/${params.id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to delete connector");
      }
      router.push("/connectors");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  if (!connector) {
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
      <div className="mb-4">
        <Link
          href="/connectors"
          className="text-[var(--primary)] hover:underline text-sm"
        >
          &larr; Back to Connectors
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-[var(--primary)]">
            {connector.name}
          </h1>
          <Badge variant={statusBadgeVariant(connector.status)}>
            {connector.status}
          </Badge>
          {connector.paused && <Badge variant="secondary">Paused</Badge>}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditOpen(true)}
          >
            Edit
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing || !connector.fivetran_connector_id}
          >
            {refreshing ? "Refreshing..." : "Refresh Status"}
          </Button>
          <Button
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            Delete
          </Button>
        </div>
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Connector Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <dt className="text-[var(--muted-foreground)]">Service</dt>
              <dd>{connector.service || "\u2014"}</dd>
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
              <dd>{formatFrequency(connector.sync_frequency)}</dd>
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
              {/* Health indicator */}
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
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Current health
                  </p>
                </div>
              </div>

              {/* Last success */}
              <div>
                <p className="text-sm font-medium text-green-700">
                  Last Success
                </p>
                <p className="text-sm">
                  {formatDateTime(connector.succeeded_at)}
                </p>
              </div>

              {/* Last failure */}
              <div>
                <p className="text-sm font-medium text-red-700">
                  Last Failure
                </p>
                <p className="text-sm">
                  {formatDateTime(connector.failed_at)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
        title="Delete Connector"
        description={`Are you sure you want to delete "${connector.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
      />

      <EditDialog
        open={editOpen}
        onSave={handleSave}
        onCancel={() => setEditOpen(false)}
        title="Rename Connector"
        label="Connector Name"
        defaultValue={connector.name}
        loading={saving}
      />
    </div>
  );
}

export default function ConnectorDetailPage() {
  return (
    <AuthGuard>
      <ConnectorDetail />
    </AuthGuard>
  );
}
