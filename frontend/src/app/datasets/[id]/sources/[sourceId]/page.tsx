"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  fetchRawPreview,
  fetchMappedPreview,
  PreviewResponse,
} from "@/lib/explore-api";
import { AuthGuard } from "@/components/auth-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table/data-table";

interface DataSource {
  id: number;
  dataset_id: number;
  connector_id: number;
  bq_table: string;
  status: string;
  connector_name: string;
}

function statusVariant(
  status: string
): "success" | "warning" | "error" | "secondary" {
  switch (status) {
    case "mapped":
      return "success";
    case "pending_mapping":
      return "warning";
    case "error":
      return "error";
    default:
      return "secondary";
  }
}

function DataSourceDetail() {
  const params = useParams();
  const datasetId = params.id as string;
  const sourceId = params.sourceId as string;

  const [source, setSource] = useState<DataSource | null>(null);
  const [activeTab, setActiveTab] = useState<"raw" | "mapped">("raw");

  // Raw data
  const [rawData, setRawData] = useState<PreviewResponse | null>(null);
  const [rawPage, setRawPage] = useState(0);
  const [rawLoading, setRawLoading] = useState(false);

  // Mapped data
  const [mappedData, setMappedData] = useState<PreviewResponse | null>(null);
  const [mappedPage, setMappedPage] = useState(0);
  const [mappedLoading, setMappedLoading] = useState(false);

  const PAGE_SIZE = 50;

  useEffect(() => {
    api(`/api/datasets/${datasetId}/sources`)
      .then((r) => r.json())
      .then((sources: DataSource[]) => {
        const s = sources.find((x) => x.id === Number(sourceId));
        if (s) setSource(s);
      });
  }, [datasetId, sourceId]);

  const loadRaw = useCallback(() => {
    setRawLoading(true);
    fetchRawPreview(Number(sourceId), {
      offset: rawPage * PAGE_SIZE,
      limit: PAGE_SIZE,
    })
      .then(setRawData)
      .finally(() => setRawLoading(false));
  }, [sourceId, rawPage]);

  const loadMapped = useCallback(() => {
    setMappedLoading(true);
    fetchMappedPreview(Number(sourceId), {
      offset: mappedPage * PAGE_SIZE,
      limit: PAGE_SIZE,
    })
      .then(setMappedData)
      .finally(() => setMappedLoading(false));
  }, [sourceId, mappedPage]);

  useEffect(() => {
    if (activeTab === "raw") loadRaw();
  }, [activeTab, loadRaw]);

  useEffect(() => {
    if (activeTab === "mapped") loadMapped();
  }, [activeTab, loadMapped]);

  if (!source) {
    return <p className="text-[var(--muted-foreground)]">Loading...</p>;
  }

  return (
    <div>
      <div className="mb-4">
        <Link
          href={`/datasets/${datasetId}`}
          className="text-[var(--primary)] hover:underline text-sm"
        >
          &larr; Back to Dataset
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-[var(--primary)]">
          {source.connector_name}
        </h1>
        <Badge variant={statusVariant(source.status)}>{source.status}</Badge>
      </div>

      <p className="text-sm text-[var(--muted-foreground)] mb-6">
        BQ Table:{" "}
        <span className="font-mono">{source.bq_table}</span>
      </p>

      {/* Tab bar */}
      <div className="flex gap-1 mb-4 border-b border-[var(--border)]">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "raw"
              ? "border-[var(--primary)] text-[var(--primary)]"
              : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          }`}
          onClick={() => setActiveTab("raw")}
        >
          Raw Data
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "mapped"
              ? "border-[var(--primary)] text-[var(--primary)]"
              : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          }`}
          onClick={() => setActiveTab("mapped")}
        >
          Mapped Data
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "raw" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Raw Source Data
              {rawData && (
                <span className="text-sm font-normal text-[var(--muted-foreground)] ml-2">
                  ({rawData.total_count.toLocaleString()} rows)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={rawData?.columns ?? []}
              rows={rawData?.rows ?? []}
              totalCount={rawData?.total_count ?? 0}
              page={rawPage}
              pageSize={PAGE_SIZE}
              onPageChange={setRawPage}
              loading={rawLoading}
            />
          </CardContent>
        </Card>
      )}

      {activeTab === "mapped" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Mapped Data
              {mappedData && (
                <span className="text-sm font-normal text-[var(--muted-foreground)] ml-2">
                  ({mappedData.total_count.toLocaleString()} rows)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={mappedData?.columns ?? []}
              rows={mappedData?.rows ?? []}
              totalCount={mappedData?.total_count ?? 0}
              page={mappedPage}
              pageSize={PAGE_SIZE}
              onPageChange={setMappedPage}
              loading={mappedLoading}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function DataSourceDetailPage() {
  return (
    <AuthGuard>
      <DataSourceDetail />
    </AuthGuard>
  );
}
