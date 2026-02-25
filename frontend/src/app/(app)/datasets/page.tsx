"use client";

import Link from "next/link";
import { useDataSources } from "@/hooks/use-data-sources";
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
import { ErrorBanner } from "@/components/shared/error-banner";

const DataSourceList = () => {
  const { data: dataSources = [], isLoading, error } = useDataSources();

  if (error) return <ErrorBanner message={error.message} />;

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

      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-gray-200 rounded" />
          ))}
        </div>
      ) : dataSources.length === 0 ? (
        <p className="text-[var(--muted-foreground)]">No data sources created yet.</p>
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
};

const DatasetsPage = () => <DataSourceList />;
export default DatasetsPage;
