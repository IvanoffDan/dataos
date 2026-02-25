"use client";

import { timeAgo } from "@/lib/format";
import type { ConnectorSummary } from "@/types";

export const SyncHealthDot = ({ connector }: { connector: ConnectorSummary }) => {
  if (connector.paused) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
        <span className="inline-block w-2 h-2 rounded-full bg-gray-400" />
        Paused
      </span>
    );
  }

  if (connector.sync_state === "syncing") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-yellow-700">
        <span className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
        Syncing
      </span>
    );
  }

  const lastSuccess = connector.succeeded_at
    ? new Date(connector.succeeded_at).getTime()
    : 0;
  const lastFailure = connector.failed_at
    ? new Date(connector.failed_at).getTime()
    : 0;

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
          ? timeAgo(connector.succeeded_at!)
          : `Failed ${timeAgo(connector.failed_at!)}`}
      </span>
    </span>
  );
};
