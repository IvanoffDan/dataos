"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
  connector_category: string;
  created_at: string;
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

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatFrequency(minutes: number | null): string {
  if (!minutes) return "\u2014";
  if (minutes < 60) return `${minutes}m`;
  if (minutes === 60) return "1h";
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

/** Small inline bar showing sync health: green for success, red for failure. */
function SyncHealthDot({ connector }: { connector: Connector }) {
  const { succeeded_at, failed_at, paused } = connector;

  if (paused) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
        <span className="inline-block w-2 h-2 rounded-full bg-gray-400" />
        Paused
      </span>
    );
  }

  // Determine if last action was success or failure
  const lastSuccess = succeeded_at ? new Date(succeeded_at).getTime() : 0;
  const lastFailure = failed_at ? new Date(failed_at).getTime() : 0;

  if (!lastSuccess && !lastFailure) {
    return <span className="text-xs text-[var(--muted-foreground)]">{"\u2014"}</span>;
  }

  const healthy = lastSuccess >= lastFailure;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span
        className={`inline-block w-2 h-2 rounded-full ${
          healthy ? "bg-green-500" : "bg-red-500"
        }`}
      />
      <span className={healthy ? "text-green-700" : "text-red-700"}>
        {healthy
          ? timeAgo(succeeded_at!)
          : `Failed ${timeAgo(failed_at!)}`}
      </span>
    </span>
  );
}

function ConnectorList() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = () =>
    api("/api/connectors")
      .then((res) => res.json())
      .then(setConnectors);

  useEffect(() => {
    load();
  }, []);

  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      const res = await api("/api/connectors/refresh-all", { method: "POST" });
      if (res.ok) {
        setConnectors(await res.json());
      }
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--primary)]">
          Connectors
        </h1>
        <div className="flex items-center gap-2">
          {connectors.length > 0 && (
            <Button
              variant="outline"
              onClick={handleRefreshAll}
              disabled={refreshing}
            >
              {refreshing ? "Refreshing..." : "Refresh All"}
            </Button>
          )}
          <Button asChild>
            <Link href="/connectors/new">Add Connector</Link>
          </Button>
        </div>
      </div>
      {connectors.length === 0 ? (
        <p className="text-[var(--muted-foreground)]">
          No connectors configured yet.
        </p>
      ) : (
        <div className="rounded-lg border border-[var(--border)] bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Sync</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Sync State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {connectors.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link
                      href={`/connectors/${c.id}`}
                      className="text-[var(--primary)] font-medium hover:underline"
                    >
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-[var(--muted-foreground)]">
                    {c.service || "\u2014"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(c.status)}>
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <SyncHealthDot connector={c} />
                  </TableCell>
                  <TableCell className="text-[var(--muted-foreground)] text-sm">
                    {formatFrequency(c.sync_frequency)}
                  </TableCell>
                  <TableCell className="text-[var(--muted-foreground)]">
                    {c.sync_state || "\u2014"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export default function ConnectorsPage() {
  return <ConnectorList />;
}
