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

interface DataSource {
  id: number;
  name: string;
  dataset_type: string;
  description: string;
  connector_name: string;
  bq_table: string;
  status: string;
  created_at: string;
  updated_at: string;
}

function DataSourceList() {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);

  useEffect(() => {
    api("/api/data-sources")
      .then((res) => res.json())
      .then(setDataSources);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--primary)]">Data Sources</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Define output schemas for your data. Each data source maps ingested connector data into a standardised format for analysis.
          </p>
        </div>
        <Button asChild>
          <Link href="/datasets/new">Create Data Source</Link>
        </Button>
      </div>
      {dataSources.length === 0 ? (
        <p className="text-[var(--muted-foreground)]">
          No data sources created yet.
        </p>
      ) : (
        <div className="rounded-lg border border-[var(--border)] bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Connector</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dataSources.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <Link
                      href={`/datasets/${d.id}`}
                      className="text-[var(--primary)] font-medium hover:underline"
                    >
                      {d.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{d.dataset_type}</Badge>
                  </TableCell>
                  <TableCell className="text-[var(--muted-foreground)]">
                    {d.connector_name || "\u2014"}
                  </TableCell>
                  <TableCell className="text-[var(--muted-foreground)]">
                    {d.description || "\u2014"}
                  </TableCell>
                  <TableCell className="text-[var(--muted-foreground)]">
                    {new Date(d.created_at).toLocaleDateString()}
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

export default function DatasetsPage() {
  return <DataSourceList />;
}
