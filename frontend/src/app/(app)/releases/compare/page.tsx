"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { compareReleases, ReleaseCompareResponse } from "@/lib/releases-api";
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

function ComparePage() {
  const searchParams = useSearchParams();
  const r1 = Number(searchParams.get("r1"));
  const r2 = Number(searchParams.get("r2"));
  const [data, setData] = useState<ReleaseCompareResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!r1 || !r2) {
      setError("Two release IDs are required (r1 and r2 query params)");
      return;
    }
    compareReleases(r1, r2)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [r1, r2]);

  if (error) {
    return (
      <div>
        <div className="mb-4">
          <Link href="/releases" className="text-[var(--primary)] hover:underline text-sm">
            &larr; Back to Releases
          </Link>
        </div>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!data) {
    return <p className="text-[var(--muted-foreground)]">Loading...</p>;
  }

  return (
    <div>
      <div className="mb-4">
        <Link href="/releases" className="text-[var(--primary)] hover:underline text-sm">
          &larr; Back to Releases
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-[var(--primary)] mb-6">
        Compare Releases
      </h1>

      {/* Release headers */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">v{data.r1.version}</Badge>
              <span className="font-medium">{data.r1.name}</span>
            </div>
            <p className="text-sm text-[var(--muted-foreground)] mt-1">
              {data.r1.dataset_count} datasets &middot;{" "}
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
              {data.r2.dataset_count} datasets &middot;{" "}
              {data.r2.total_rows.toLocaleString()} rows &middot;{" "}
              {new Date(data.r2.created_at).toLocaleDateString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Diff table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Per-Dataset Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dataset</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-center">
                  v{data.r1.version} Version
                </TableHead>
                <TableHead className="text-center">
                  v{data.r1.version} Rows
                </TableHead>
                <TableHead className="text-center">
                  v{data.r2.version} Version
                </TableHead>
                <TableHead className="text-center">
                  v{data.r2.version} Rows
                </TableHead>
                <TableHead className="text-center">Row Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.diffs.map((d) => {
                const rowDiff =
                  d.r1_rows != null && d.r2_rows != null
                    ? d.r2_rows - d.r1_rows
                    : null;
                return (
                  <TableRow key={d.dataset_id}>
                    <TableCell className="font-medium">
                      {d.dataset_name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{d.dataset_type}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {d.r1_version != null ? `v${d.r1_version}` : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {d.r1_rows != null
                        ? d.r1_rows.toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {d.r2_version != null ? `v${d.r2_version}` : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {d.r2_rows != null
                        ? d.r2_rows.toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {rowDiff != null ? (
                        <span
                          className={
                            rowDiff > 0
                              ? "text-green-600"
                              : rowDiff < 0
                              ? "text-red-600"
                              : ""
                          }
                        >
                          {rowDiff > 0 ? "+" : ""}
                          {rowDiff.toLocaleString()}
                        </span>
                      ) : (
                        "—"
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
}

export default function CompareReleasesPage() {
  return <ComparePage />;
}
