"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useDataSource, useSourceColumns, useSaveMappings, useAutoMap } from "@/hooks/use-data-sources";
import { fetchTargetColumns, fetchMappings } from "@/lib/api/data-sources";
import type { ColumnDef, ExistingMapping, MappingEntry, AiSuggestion } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorBanner } from "@/components/shared/error-banner";

const MappingEditor = () => {
  const params = useParams();
  const router = useRouter();
  const dataSourceId = Number(params.id);

  const { data: dataSource } = useDataSource(dataSourceId);
  const { data: sourceColumns = [] } = useSourceColumns(dataSourceId);

  const [targetColumns, setTargetColumns] = useState<ColumnDef[]>([]);
  const [mappings, setMappings] = useState<Record<string, MappingEntry>>({});
  const [error, setError] = useState("");

  const [aiSuggestions, setAiSuggestions] = useState<Record<string, AiSuggestion>>({});

  const saveMutation = useSaveMappings(dataSourceId);
  const autoMapMutation = useAutoMap(dataSourceId);

  // Load target columns + existing mappings when data source loads
  useEffect(() => {
    if (!dataSource) return;
    fetchTargetColumns(dataSource.dataset_type).then(setTargetColumns);
    fetchMappings(dataSourceId).then((existing: ExistingMapping[]) => {
      const map: Record<string, MappingEntry> = {};
      for (const m of existing) {
        if (m.static_value != null) {
          map[m.target_column] = { type: "static", value: m.static_value };
        } else if (m.source_column) {
          map[m.target_column] = { type: "column", value: m.source_column };
        }
      }
      setMappings(map);
    });
  }, [dataSource, dataSourceId]);

  const handleMappingChange = (targetCol: string, entry: MappingEntry | null) => {
    setMappings((prev) => {
      const next = { ...prev };
      if (!entry || entry.value === "") {
        delete next[targetCol];
      } else {
        next[targetCol] = entry;
      }
      return next;
    });
    setAiSuggestions((prev) => {
      if (!prev[targetCol]) return prev;
      const next = { ...prev };
      delete next[targetCol];
      return next;
    });
  };

  const handleModeToggle = (targetCol: string, mode: "column" | "static") => {
    setMappings((prev) => {
      const next = { ...prev };
      const current = prev[targetCol];
      if (mode === "column") {
        next[targetCol] = { type: "column", value: current?.type === "column" ? current.value : "" };
      } else {
        next[targetCol] = { type: "static", value: current?.type === "static" ? current.value : "" };
      }
      return next;
    });
    setAiSuggestions((prev) => {
      if (!prev[targetCol]) return prev;
      const next = { ...prev };
      delete next[targetCol];
      return next;
    });
  };

  const handleAutoMap = () => {
    autoMapMutation.mutate(undefined, {
      onSuccess: (data) => {
        const newSuggestions: Record<string, AiSuggestion> = {};
        const newMappings: Record<string, MappingEntry> = {};

        for (const s of data.suggestions) {
          const existing = mappings[s.target_column];
          if (existing && existing.value !== "") continue;

          if (s.source_column) {
            newMappings[s.target_column] = { type: "column", value: s.source_column };
            newSuggestions[s.target_column] = { confidence: s.confidence, reasoning: s.reasoning };
          } else if (s.static_value) {
            newMappings[s.target_column] = { type: "static", value: s.static_value };
            newSuggestions[s.target_column] = { confidence: s.confidence, reasoning: s.reasoning };
          }
        }

        setMappings((prev) => ({ ...prev, ...newMappings }));
        setAiSuggestions((prev) => ({ ...prev, ...newSuggestions }));
      },
    });
  };

  const handleClearAiSuggestions = () => {
    const aiTargets = Object.keys(aiSuggestions);
    setMappings((prev) => {
      const next = { ...prev };
      for (const col of aiTargets) delete next[col];
      return next;
    });
    setAiSuggestions({});
  };

  const handleSave = () => {
    const mappingItems = Object.entries(mappings)
      .filter(([, entry]) => entry.value !== "")
      .map(([target_column, entry]) => ({
        source_column: entry.type === "column" ? entry.value : "",
        target_column,
        static_value: entry.type === "static" ? entry.value : null,
      }));
    saveMutation.mutate(mappingItems, {
      onSuccess: () => router.push(`/datasets/${dataSourceId}`),
    });
  };

  const requiredUnmapped = targetColumns.filter(
    (c) => c.required && (!mappings[c.name] || mappings[c.name].value === "")
  );
  const hasAiSuggestions = Object.keys(aiSuggestions).length > 0;

  return (
    <div>
      <div className="mb-4">
        <Link
          href={`/datasets/${dataSourceId}`}
          className="text-[var(--primary)] hover:underline text-sm"
        >
          &larr; Back to Data Source
        </Link>
      </div>

      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-[var(--primary)]">Column Mapping</h1>
        <div className="flex items-center gap-2">
          {hasAiSuggestions && (
            <Button variant="outline" onClick={handleClearAiSuggestions}>
              Clear AI suggestions
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleAutoMap}
            disabled={autoMapMutation.isPending}
          >
            {autoMapMutation.isPending ? "Auto-mapping..." : "Auto-map with AI"}
          </Button>
        </div>
      </div>
      <p className="text-[var(--muted-foreground)] text-sm mb-6">
        Map source columns to the target {dataSource?.dataset_type} schema. Required columns
        must be mapped. Use &ldquo;Static Value&rdquo; for columns that are constant across all rows.
      </p>

      {error && <ErrorBanner message={error} />}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Target Columns</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {targetColumns.map((col) => {
              const entry = mappings[col.name];
              const isMapped = !!entry && entry.value !== "";
              const mode = entry?.type || "column";
              const aiSuggestion = aiSuggestions[col.name];

              let rowBorder = "border-[var(--border)]";
              let rowBg = "";
              if (aiSuggestion) {
                rowBorder = "border-blue-300";
                rowBg = "bg-blue-50";
              } else if (col.required && !isMapped) {
                rowBorder = "border-yellow-300";
                rowBg = "bg-yellow-50";
              }

              return (
                <div
                  key={col.name}
                  className={`flex items-center gap-4 p-3 rounded-lg border ${rowBorder} ${rowBg}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm font-mono">{col.name}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {col.data_type}
                      </Badge>
                      {col.required && (
                        <Badge variant="default" className="text-[10px] px-1.5 py-0">
                          required
                        </Badge>
                      )}
                      {aiSuggestion && (
                        <span title={aiSuggestion.reasoning}>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 cursor-help ${
                              aiSuggestion.confidence >= 0.9
                                ? "border-green-500 text-green-700 bg-green-50"
                                : aiSuggestion.confidence >= 0.7
                                  ? "border-yellow-500 text-yellow-700 bg-yellow-50"
                                  : "border-red-500 text-red-700 bg-red-50"
                            }`}
                          >
                            AI {Math.round(aiSuggestion.confidence * 100)}%
                          </Badge>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                      {col.description}
                      {col.format && ` (format: ${col.format})`}
                      {col.max_length && ` (max ${col.max_length} chars)`}
                      {col.min_value !== null && ` (min: ${col.min_value})`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex rounded-md border border-[var(--border)] text-xs overflow-hidden">
                      <button
                        type="button"
                        onClick={() => handleModeToggle(col.name, "column")}
                        className={`px-2 py-1 ${
                          mode === "column"
                            ? "bg-[var(--primary)] text-white"
                            : "bg-white text-[var(--muted-foreground)] hover:bg-gray-50"
                        }`}
                      >
                        Column
                      </button>
                      <button
                        type="button"
                        onClick={() => handleModeToggle(col.name, "static")}
                        className={`px-2 py-1 ${
                          mode === "static"
                            ? "bg-[var(--primary)] text-white"
                            : "bg-white text-[var(--muted-foreground)] hover:bg-gray-50"
                        }`}
                      >
                        Static
                      </button>
                    </div>
                    <div className="w-56">
                      {mode === "column" ? (
                        <select
                          value={entry?.type === "column" ? entry.value : ""}
                          onChange={(e) =>
                            handleMappingChange(col.name, e.target.value
                              ? { type: "column", value: e.target.value }
                              : null)
                          }
                          className={`flex h-9 w-full rounded-md border px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)] ${
                            isMapped
                              ? "border-green-300 bg-green-50"
                              : "border-[var(--border)] bg-white"
                          }`}
                        >
                          <option value="">-- not mapped --</option>
                          {sourceColumns.map((sc) => (
                            <option key={sc.name} value={sc.name}>
                              {sc.name} ({sc.type})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={entry?.type === "static" ? entry.value : ""}
                          onChange={(e) =>
                            handleMappingChange(col.name, { type: "static", value: e.target.value })
                          }
                          placeholder="Enter static value..."
                          className={`flex h-9 w-full rounded-md border px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)] ${
                            isMapped
                              ? "border-green-300 bg-green-50"
                              : "border-[var(--border)] bg-white"
                          }`}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-4">
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Saving..." : "Save Mappings"}
        </Button>
        {requiredUnmapped.length > 0 && (
          <p className="text-yellow-600 text-sm">
            {requiredUnmapped.length} required column(s) unmapped:{" "}
            {requiredUnmapped.map((c) => c.name).join(", ")}
          </p>
        )}
      </div>
    </div>
  );
};

const MappingPage = () => <MappingEditor />;
export default MappingPage;
