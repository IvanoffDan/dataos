"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDataSources } from "@/hooks/use-data-sources";
import { sourceStatusVariant, formatSourceStatus } from "@/lib/format";
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

const ATTENTION_STATUSES = new Set(["pending_review", "processing_failed"]);
const PROCESSING_STATUSES = new Set(["auto_mapping", "auto_labelling"]);

const getActionLabel = (status: string): { label: string; variant: "default" | "warning" | "secondary" | "error" } => {
  switch (status) {
    case "pending_review":
      return { label: "Review & Approve", variant: "warning" };
    case "processing_failed":
      return { label: "Failed", variant: "error" };
    case "auto_mapping":
    case "auto_labelling":
      return { label: "Processing...", variant: "secondary" };
    case "mapped":
      return { label: "Active", variant: "default" };
    default:
      return { label: formatSourceStatus(status), variant: "secondary" };
  }
};

const DataSourceList = () => {
  const { data: dataSources = [], isLoading, error } = useDataSources();
  const router = useRouter();

  const { attention, processing, active } = useMemo(() => {
    const attention = dataSources.filter((d) => ATTENTION_STATUSES.has(d.status));
    const processing = dataSources.filter((d) => PROCESSING_STATUSES.has(d.status));
    const active = dataSources.filter(
      (d) => !ATTENTION_STATUSES.has(d.status) && !PROCESSING_STATUSES.has(d.status)
    );
    return { attention, processing, active };
  }, [dataSources]);

  if (error) return <ErrorBanner message={error.message} />;

  const renderSection = (
    title: string,
    items: typeof dataSources,
    highlight?: boolean
  ) => {
    if (items.length === 0) return null;
    return (
      <div className={`rounded-lg border ${highlight ? "border-yellow-300 bg-yellow-50/30" : "border-[var(--border)] bg-white"} mb-6`}>
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            {title}
            <span className="text-[var(--muted-foreground)] font-normal ml-2">({items.length})</span>
          </h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Connector</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((d) => {
              const action = getActionLabel(d.status);
              const isClickable = d.status === "pending_review" || d.status === "processing_failed";
              const reviewHref = isClickable ? `/datasets/${d.id}/review` : `/datasets/${d.id}`;
              return (
                <TableRow
                  key={d.id}
                  className={isClickable ? "cursor-pointer hover:bg-yellow-50/50" : ""}
                  onClick={isClickable ? () => router.push(reviewHref) : undefined}
                >
                  <TableCell>
                    <Link
                      href={`/datasets/${d.id}`}
                      className="text-[var(--primary)] font-medium hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {d.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{d.dataset_type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={sourceStatusVariant(d.status)}>
                      {formatSourceStatus(d.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[var(--muted-foreground)]">
                    {d.connector_name || "\u2014"}
                  </TableCell>
                  <TableCell className="text-[var(--muted-foreground)]">
                    {new Date(d.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {isClickable ? (
                      <Button
                        asChild
                        size="sm"
                        variant={action.variant === "error" ? "destructive" : "default"}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      >
                        <Link href={reviewHref}>{action.label}</Link>
                      </Button>
                    ) : d.status === "auto_mapping" || d.status === "auto_labelling" ? (
                      <span className="text-xs text-[var(--muted-foreground)] flex items-center justify-end gap-1">
                        <span className="inline-block h-3 w-3 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
                        Processing
                      </span>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

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
        <>
          {renderSection("Needs Attention", attention, true)}
          {renderSection("Processing", processing)}
          {renderSection("Active", active)}
        </>
      )}
    </div>
  );
};

const DatasetsPage = () => <DataSourceList />;
export default DatasetsPage;
