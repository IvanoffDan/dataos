"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  useDataSourcePolling,
  useApproveDataSource,
  useMappings,
  useTargetColumns,
} from "@/hooks/use-data-sources";
import { useColumnStats } from "@/hooks/use-labels";
import { sourceStatusVariant } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorBanner } from "@/components/shared/error-banner";
import { PageHeader } from "@/components/shared/page-header";

const ProcessingSpinner = ({ status }: { status: string }) => {
  const messages: Record<string, string> = {
    auto_mapping: "AI is mapping source columns to the target schema...",
    auto_labelling: "AI is standardizing string values...",
  };
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="h-8 w-8 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      <p className="text-[var(--muted-foreground)]">
        {messages[status] ?? "Processing..."}
      </p>
      <p className="text-xs text-[var(--muted-foreground)]">This page refreshes automatically</p>
    </div>
  );
};

const ReviewPage = () => {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const { data: ds, isLoading, error } = useDataSourcePolling(id);

  const { data: mappings = [] } = useMappings(id);
  const { data: targetCols = [] } = useTargetColumns(ds?.dataset_type ?? "");
  const { data: columnStats } = useColumnStats(ds?.dataset_type ?? "");

  const approveMutation = useApproveDataSource(id);

  if (error) return <ErrorBanner message={error.message} />;
  if (isLoading || !ds) {
    return <p className="text-[var(--muted-foreground)]">Loading...</p>;
  }

  const isReady = ds.status === "pending_review";
  const isFailed = ds.status === "processing_failed";
  const processing =
    ds.status === "auto_mapping" || ds.status === "auto_labelling";

  // Build target column lookup
  const targetColMap = new Map(targetCols.map((c) => [c.name, c]));

  // String columns with AI rules from columnStats
  const stringColStats =
    columnStats?.columns?.filter((c) => c.ai_rule_count > 0) ?? [];

  return (
    <div>
      <PageHeader
        backHref={`/datasets/${id}`}
        backLabel="Back to Data Source"
        title={ds.name}
        badges={
          <Badge variant={sourceStatusVariant(ds.status)}>{ds.status}</Badge>
        }
        actions={
          isReady ? (
            <div className="flex items-center gap-2">
              <Button asChild variant="outline">
                <Link href={`/datasets/${id}/mapping`}>Edit Mappings</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/labels/${ds.dataset_type}`}>Edit Labels</Link>
              </Button>
              <Button
                onClick={() =>
                  approveMutation.mutate(undefined, {
                    onSuccess: () => router.push(`/datasets/${id}`),
                  })
                }
                disabled={approveMutation.isPending}
              >
                {approveMutation.isPending ? "Approving..." : "Approve"}
              </Button>
            </div>
          ) : undefined
        }
      />

      {processing && <ProcessingSpinner status={ds.status} />}

      {isFailed && (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 mb-6">
          <p className="text-sm text-red-800">
            Automated processing failed. You can{" "}
            <Link
              href={`/datasets/${id}/mapping`}
              className="underline font-medium"
            >
              map columns manually
            </Link>{" "}
            instead.
          </p>
        </div>
      )}

      {!processing && mappings.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Column Mappings</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Target Column</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Mapped To</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappings.map((m) => {
                  const tc = targetColMap.get(m.target_column);
                  return (
                    <TableRow key={m.target_column}>
                      <TableCell className="font-medium">
                        {m.target_column}
                      </TableCell>
                      <TableCell className="text-[var(--muted-foreground)] text-xs">
                        {tc?.data_type ?? ""}
                      </TableCell>
                      <TableCell>
                        {tc?.required ? (
                          <Badge variant="secondary">required</Badge>
                        ) : (
                          ""
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {m.source_column
                          ? m.source_column
                          : m.static_value
                            ? `"${m.static_value}" (static)`
                            : "\u2014"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!processing && stringColStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Label Rules (AI Suggested)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stringColStats.map((col) => (
                <div key={col.column_name}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium">{col.column_name}</span>
                    <Badge variant="secondary">
                      {col.ai_rule_count} AI rules
                    </Badge>
                    {col.distinct_count != null && (
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {col.distinct_count} distinct values
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)] mb-1">
                    {col.description}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-xs text-[var(--muted-foreground)] mt-4">
              View and edit individual label rules on the{" "}
              <Link
                href={`/labels/${ds.dataset_type}`}
                className="text-[var(--primary)] underline"
              >
                Labels page
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ReviewPage;
