"use client";

import Link from "next/link";
import { useConnectors, useRefreshAllConnectors } from "@/hooks/use-connectors";
import { statusBadgeVariant, formatFrequency } from "@/lib/format";
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
import { SyncHealthDot } from "@/components/shared/sync-health-dot";
import { ErrorBanner } from "@/components/shared/error-banner";

const ConnectorList = () => {
  const { data: connectors = [], isLoading, error } = useConnectors();
  const refreshAll = useRefreshAllConnectors();

  if (error) return <ErrorBanner message={error.message} />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--primary)]">Connectors</h1>
        <div className="flex items-center gap-2">
          {connectors.length > 0 && (
            <Button
              variant="outline"
              onClick={() => refreshAll.mutate()}
              disabled={refreshAll.isPending}
            >
              {refreshAll.isPending ? "Refreshing..." : "Refresh All"}
            </Button>
          )}
          <Button asChild>
            <Link href="/connectors/new">Add Connector</Link>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-gray-200 rounded" />
          ))}
        </div>
      ) : connectors.length === 0 ? (
        <p className="text-[var(--muted-foreground)]">No connectors configured yet.</p>
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
                    <Badge variant={statusBadgeVariant(c.status)}>{c.status}</Badge>
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
};

const ConnectorsPage = () => <ConnectorList />;
export default ConnectorsPage;
