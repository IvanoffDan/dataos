"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DatasetType {
  id: string;
  name: string;
  description: string;
}

interface Connector {
  id: number;
  name: string;
  schema_name: string;
  status: string;
  requires_table_selection: boolean;
  connector_category: string;
}

interface BqTable {
  table_id: string;
  full_id: string;
}

function CreateDataSource() {
  const router = useRouter();
  const [types, setTypes] = useState<DatasetType[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [name, setName] = useState("");
  const [datasetType, setDatasetType] = useState("");
  const [description, setDescription] = useState("");
  const [selectedConnector, setSelectedConnector] = useState<number | null>(null);
  const [bqTables, setBqTables] = useState<BqTable[]>([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [loadingTables, setLoadingTables] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api("/api/dataset-types")
      .then((res) => res.json())
      .then((data: DatasetType[]) => {
        setTypes(data);
        if (data.length > 0) setDatasetType(data[0].id);
      });
    api("/api/connectors")
      .then((res) => res.json())
      .then(setConnectors);
  }, []);

  const selectedConnectorObj = connectors.find((c) => c.id === selectedConnector);
  const needsTableSelection = selectedConnectorObj?.requires_table_selection !== false;

  // Load BQ tables when connector is selected (only if table selection is needed)
  useEffect(() => {
    if (selectedConnector && needsTableSelection) {
      setLoadingTables(true);
      setBqTables([]);
      setSelectedTable("");
      api(`/api/connectors/${selectedConnector}/tables`)
        .then(async (r) => {
          if (!r.ok) {
            const data = await r.json().catch(() => ({}));
            throw new Error(data.detail || "Failed to load tables");
          }
          return r.json();
        })
        .then((tables: BqTable[]) => {
          setBqTables(Array.isArray(tables) ? tables : []);
          if (tables.length > 0) setSelectedTable(tables[0].table_id);
        })
        .catch((err) => {
          setBqTables([]);
          setError(err instanceof Error ? err.message : "Failed to load tables");
        })
        .finally(() => setLoadingTables(false));
    } else if (selectedConnector && !needsTableSelection) {
      // Auto-managed table — clear table picker state
      setBqTables([]);
      setSelectedTable("");
    }
  }, [selectedConnector, needsTableSelection]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !datasetType || !selectedConnector) return;
    if (needsTableSelection && !selectedTable) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await api("/api/data-sources", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          dataset_type: datasetType,
          description,
          connector_id: selectedConnector,
          ...(needsTableSelection ? { bq_table: selectedTable } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to create data source");
      }
      const ds = await res.json();
      router.push(`/datasets/${ds.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/datasets"
          className="text-[var(--primary)] hover:underline text-sm"
        >
          &larr; Back to Data Sources
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-[var(--primary)] mb-6">
        Create Data Source
      </h1>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-lg">Data Source Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. AU Sales Data"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <select
                id="type"
                value={datasetType}
                onChange={(e) => setDatasetType(e.target.value)}
                className="flex h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                required
              >
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {types.find((t) => t.id === datasetType) && (
                <p className="text-xs text-[var(--muted-foreground)]">
                  {types.find((t) => t.id === datasetType)?.description}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this data source"
              />
            </div>

            <div className="space-y-2">
              <Label>Connector</Label>
              <select
                value={selectedConnector ?? ""}
                onChange={(e) =>
                  setSelectedConnector(e.target.value ? Number(e.target.value) : null)
                }
                className="flex h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                required
              >
                <option value="">Select a connector...</option>
                {connectors
                  .filter((c) => c.status === "connected")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>

            {selectedConnector && needsTableSelection && (
              <div className="space-y-2">
                <Label>BQ Table</Label>
                {loadingTables ? (
                  <p className="text-sm text-[var(--muted-foreground)]">
                    Loading tables...
                  </p>
                ) : bqTables.length === 0 ? (
                  <p className="text-sm text-[var(--muted-foreground)]">
                    No tables found in this connector&apos;s schema.
                  </p>
                ) : (
                  <select
                    value={selectedTable}
                    onChange={(e) => setSelectedTable(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  >
                    {bqTables.map((t) => (
                      <option key={t.table_id} value={t.table_id}>
                        {t.table_id}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {selectedConnector && !needsTableSelection && (
              <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                Table is managed automatically for{" "}
                <span className="font-medium">{selectedConnectorObj?.connector_category}</span>{" "}
                connectors. No table selection needed.
              </div>
            )}

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <Button
              type="submit"
              disabled={submitting || !name.trim() || !selectedConnector || (needsTableSelection && !selectedTable)}
            >
              {submitting ? "Creating..." : "Create Data Source"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function CreateDatasetPage() {
  return <CreateDataSource />;
}
