"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCompareReleases } from "@/hooks/use-releases";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorBanner } from "@/components/shared/error-banner";

const ComparePage = () => {
  const searchParams = useSearchParams();
  const r1 = Number(searchParams.get("r1"));
  const r2 = Number(searchParams.get("r2"));

  const { data, isLoading, error } = useCompareReleases(r1, r2, !!r1 && !!r2);

  if (!r1 || !r2) {
    return (
      <div>
        <div className="mb-4">
          <Link href="/releases" className="text-[var(--primary)] hover:underline text-sm">
            &larr; Back to Releases
          </Link>
        </div>
        <ErrorBanner message="Two release IDs are required (r1 and r2 query params)" />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="mb-4">
          <Link href="/releases" className="text-[var(--primary)] hover:underline text-sm">
            &larr; Back to Releases
          </Link>
        </div>
        <ErrorBanner message={error.message} />
      </div>
    );
  }

  if (isLoading || !data) return <p className="text-[var(--muted-foreground)]">Loading...</p>;

  return (
    <div>
      <div className="mb-4">
        <Link href="/releases" className="text-[var(--primary)] hover:underline text-sm">
          &larr; Back to Releases
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-[var(--primary)] mb-6">Compare Releases</h1>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">v{data.r1.version}</Badge>
              <span className="font-medium">{data.r1.name}</span>
            </div>
            <p className="text-sm text-[var(--muted-foreground)] mt-1">
              {data.r1.data_source_count} data sources &middot;{" "}
              {data.r1.total_rows.toLocaleString()} rows &middot;{" "}
              {new Date(data.r1.created_at).toLocaleDateString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">v{data.r2.version}</Badge>
              <span className="font-medium">{data.r2.name}</span>
            </div>
            <p className="text-sm text-[var(--muted-foreground)] mt-1">
              {data.r2.data_source_count} data sources &middot;{" "}
              {data.r2.total_rows.toLocaleString()} rows &middot;{" "}
              {new Date(data.r2.created_at).toLocaleDateString()}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Per-Data Source Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data Source</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-center">v{data.r1.version} Version</TableHead>
                <TableHead className="text-center">v{data.r1.version} Rows</TableHead>
                <TableHead className="text-center">v{data.r2.version} Version</TableHead>
                <TableHead className="text-center">v{data.r2.version} Rows</TableHead>
                <TableHead className="text-center">Row Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.diffs.map((d) => {
                const rowDiff =
                  d.r1_rows != null && d.r2_rows != null ? d.r2_rows - d.r1_rows : null;
                return (
                  <TableRow key={d.data_source_id}>
                    <TableCell className="font-medium">{d.data_source_name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{d.dataset_type}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {d.r1_version != null ? `v${d.r1_version}` : "\u2014"}
                    </TableCell>
                    <TableCell className="text-center">
                      {d.r1_rows != null ? d.r1_rows.toLocaleString() : "\u2014"}
                    </TableCell>
                    <TableCell className="text-center">
                      {d.r2_version != null ? `v${d.r2_version}` : "\u2014"}
                    </TableCell>
                    <TableCell className="text-center">
                      {d.r2_rows != null ? d.r2_rows.toLocaleString() : "\u2014"}
                    </TableCell>
                    <TableCell className="text-center">
                      {rowDiff != null ? (
                        <span className={rowDiff > 0 ? "text-green-600" : rowDiff < 0 ? "text-red-600" : ""}>
                          {rowDiff > 0 ? "+" : ""}
                          {rowDiff.toLocaleString()}
                        </span>
                      ) : (
                        "\u2014"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

const CompareReleasesPage = () => <ComparePage />;
export default CompareReleasesPage;
