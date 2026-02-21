"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { AuthGuard } from "@/components/auth-guard";
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

function ConnectorList() {
  const [connectors, setConnectors] = useState<Connector[]>([]);

  useEffect(() => {
    api("/api/connectors/")
      .then((res) => res.json())
      .then(setConnectors);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--primary)]">
          Connectors
        </h1>
        <Button asChild>
          <Link href="/connectors/new">Add Connector</Link>
        </Button>
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
  return (
    <AuthGuard>
      <ConnectorList />
    </AuthGuard>
  );
}
