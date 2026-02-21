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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Connector Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm max-w-lg">
            <dt className="text-[var(--muted-foreground)]">Service</dt>
            <dd>{connector.service || "\u2014"}</dd>
            <dt className="text-[var(--muted-foreground)]">Fivetran ID</dt>
            <dd className="font-mono text-xs">
              {connector.fivetran_connector_id || "\u2014"}
            </dd>
            <dt className="text-[var(--muted-foreground)]">Setup State</dt>
            <dd>{connector.setup_state}</dd>
            <dt className="text-[var(--muted-foreground)]">Sync State</dt>
            <dd>{connector.sync_state || "\u2014"}</dd>
            <dt className="text-[var(--muted-foreground)]">Created</dt>
            <dd>{new Date(connector.created_at).toLocaleString()}</dd>
            <dt className="text-[var(--muted-foreground)]">Updated</dt>
            <dd>{new Date(connector.updated_at).toLocaleString()}</dd>
          </dl>
        </CardContent>
      </Card>

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
