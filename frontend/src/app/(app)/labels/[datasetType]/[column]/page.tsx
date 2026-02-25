"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DistinctValue {
  value: string;
  row_count: number;
  percentage: number;
  replacement: string | null;
  ai_suggested: boolean | null;
  confidence: number | null;
}

interface StaleRule {
  id: number;
  dataset_type: string;
  column_name: string;
  match_value: string;
  replace_value: string;
  ai_suggested: boolean | null;
  confidence: number | null;
  created_at: string;
}

interface AutoLabelResponse {
  suggestions: { match_value: string; replace_value: string; confidence: number }[];
  skipped_count: number;
  error: string | null;
}

interface ColumnValuesResponse {
  dataset_type: string;
  column_name: string;
  column_description: string;
  total_rows: number | null;
  distinct_count: number;
  rule_count: number;
  covered_row_count: number;
  values: DistinctValue[];
  stale_rules: StaleRule[];
}

function ColumnEditor() {
  const params = useParams();
  const datasetType = params.datasetType as string;
  const column = params.column as string;

  const [data, setData] = useState<ColumnValuesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [search, setSearch] = useState("");

  // Replacement state: value -> replacement text
  const [replacements, setReplacements] = useState<Record<string, string>>({});
  // Track which stale rules to keep
  const [keptStaleRules, setKeptStaleRules] = useState<Set<number>>(new Set());
  // AI auto-fill state
  const [autoFilling, setAutoFilling] = useState(false);
  const [autoFillMsg, setAutoFillMsg] = useState("");

  const loadData = useCallback(() => {
    setLoading(true);
    api(`/api/labels/types/${datasetType}/columns/${column}/values`)
      .then((r) => r.json())
      .then((d: ColumnValuesResponse) => {
        setData(d);
        // Initialize replacements from existing rules
        const init: Record<string, string> = {};
        for (const v of d.values) {
          if (v.replacement) {
            init[v.value] = v.replacement;
          }
        }
        setReplacements(init);
        // By default keep all stale rules
        setKeptStaleRules(new Set(d.stale_rules.map((r) => r.id)));
      })
      .finally(() => setLoading(false));
  }, [datasetType, column]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredValues = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data.values;
    const q = search.toLowerCase();
    return data.values.filter(
      (v) =>
        v.value.toLowerCase().includes(q) ||
        (replacements[v.value] || "").toLowerCase().includes(q)
    );
  }, [data, search, replacements]);

  const handleSave = async () => {
    if (!data) return;
    setSaving(true);
    setSaveMsg("");

    // Build rules from non-empty replacements
    const rules: { match_value: string; replace_value: string }[] = [];
    for (const [value, replacement] of Object.entries(replacements)) {
      if (replacement.trim()) {
        rules.push({ match_value: value, replace_value: replacement.trim() });
      }
    }
    // Add kept stale rules
    for (const stale of data.stale_rules) {
      if (keptStaleRules.has(stale.id)) {
        rules.push({
          match_value: stale.match_value,
          replace_value: stale.replace_value,
        });
      }
    }

    try {
      const res = await api(
        `/api/labels/types/${datasetType}/columns/${column}/rules`,
        {
          method: "PUT",
          body: JSON.stringify({ rules }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Save failed");
      }
      setSaveMsg(`Saved ${rules.length} rule${rules.length !== 1 ? "s" : ""}`);
      loadData();
    } catch (err) {
      setSaveMsg(
        err instanceof Error ? err.message : "Something went wrong"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAutoFill = async () => {
    setAutoFilling(true);
    setAutoFillMsg("");
    try {
      const res = await api(
        `/api/labels/types/${datasetType}/columns/${column}/auto-label`,
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Auto-fill failed");
      }
      const result: AutoLabelResponse = await res.json();
      setAutoFillMsg(
        `AI suggested ${result.suggestions.length} rule${result.suggestions.length !== 1 ? "s" : ""}` +
          (result.skipped_count > 0 ? ` (${result.skipped_count} already mapped)` : "")
      );
      loadData();
    } catch (err) {
      setAutoFillMsg(
        err instanceof Error ? err.message : "Something went wrong"
      );
    } finally {
      setAutoFilling(false);
    }
  };

  const handleUndoAI = async () => {
    setAutoFillMsg("");
    try {
      const res = await api(
        `/api/labels/types/${datasetType}/columns/${column}/auto-label`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Undo failed");
      }
      const result = await res.json();
      setAutoFillMsg(`Removed ${result.deleted} AI suggestion${result.deleted !== 1 ? "s" : ""}`);
      loadData();
    } catch (err) {
      setAutoFillMsg(
        err instanceof Error ? err.message : "Something went wrong"
      );
    }
  };

  const hasAISuggestions = data?.values.some((v) => v.ai_suggested) ?? false;

  if (loading) {
    return <p className="text-[var(--muted-foreground)]">Loading...</p>;
  }

  if (!data) {
    return <p className="text-red-600">Failed to load column data.</p>;
  }

  const valueCoveragePct =
    data.distinct_count > 0
      ? Math.round(
          (Object.values(replacements).filter((v) => v.trim()).length /
            data.distinct_count) *
            100
        )
      : 0;

  const rowCoveragePct =
    data.total_rows && data.total_rows > 0
      ? Math.round((data.covered_row_count / data.total_rows) * 100)
      : 0;

  return (
    <div>
      <div className="mb-4">
        <Link
          href={`/labels/${datasetType}`}
          className="text-[var(--primary)] hover:underline text-sm"
        >
          &larr; Back to Columns
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-2xl font-bold text-[var(--primary)] font-mono">
          {column}
        </h1>
      </div>
      {data.column_description && (
        <p className="text-sm text-[var(--muted-foreground)] mb-6">
          {data.column_description}
        </p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-2xl font-bold">{data.distinct_count}</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              Distinct values
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-2xl font-bold">{data.rule_count}</p>
            <p className="text-xs text-[var(--muted-foreground)]">Rules</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-2xl font-bold">{valueCoveragePct}%</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              Value coverage
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-2xl font-bold">{rowCoveragePct}%</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              Row coverage
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search + Actions */}
      <div className="flex items-center gap-3 mb-4">
        <Input
          placeholder="Search values..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Button
          variant="outline"
          onClick={handleAutoFill}
          disabled={autoFilling}
        >
          {autoFilling ? "Auto-filling..." : "Auto-fill with AI"}
        </Button>
        {hasAISuggestions && (
          <Button variant="outline" onClick={handleUndoAI}>
            Undo AI
          </Button>
        )}
        <div className="flex-1" />
        {(saveMsg || autoFillMsg) && (
          <span className="text-sm text-[var(--muted-foreground)]">
            {autoFillMsg || saveMsg}
          </span>
        )}
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Rules"}
        </Button>
      </div>

      {/* Values table */}
      {data.values.length === 0 ? (
        <p className="text-[var(--muted-foreground)]">
          {data.total_rows === null
            ? "Run the pipeline to see data values."
            : "No values found for this column."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Value</TableHead>
              <TableHead className="w-24">Rows</TableHead>
              <TableHead className="w-20">%</TableHead>
              <TableHead>Replace With</TableHead>
              <TableHead className="w-24">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredValues.map((v) => {
              const hasRule = (replacements[v.value] || "").trim() !== "";
              const isAI = v.ai_suggested === true;
              const rowBg = isAI
                ? "bg-yellow-50"
                : hasRule
                  ? "bg-green-50"
                  : "";
              return (
                <TableRow key={v.value} className={rowBg}>
                  <TableCell className="font-mono text-sm">
                    {v.value}
                  </TableCell>
                  <TableCell>{v.row_count.toLocaleString()}</TableCell>
                  <TableCell className="text-[var(--muted-foreground)]">
                    {v.percentage}%
                  </TableCell>
                  <TableCell>
                    <Input
                      value={replacements[v.value] || ""}
                      onChange={(e) =>
                        setReplacements((prev) => ({
                          ...prev,
                          [v.value]: e.target.value,
                        }))
                      }
                      placeholder="Enter replacement..."
                      className="h-8 text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {isAI ? (
                        <>
                          <Badge variant="warning">AI</Badge>
                          {v.confidence != null && (
                            <span className="text-xs text-[var(--muted-foreground)]">
                              {Math.round(v.confidence * 100)}%
                            </span>
                          )}
                        </>
                      ) : hasRule ? (
                        <Badge variant="success">Mapped</Badge>
                      ) : (
                        <Badge variant="secondary">Unmapped</Badge>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* Stale rules */}
      {data.stale_rules.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-3 text-[var(--muted-foreground)]">
            Stale Rules
          </h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-3">
            These rules match values that no longer appear in the data. Uncheck
            to remove on next save.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">Keep</TableHead>
                <TableHead>Match Value</TableHead>
                <TableHead>Replace With</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.stale_rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={keptStaleRules.has(rule.id)}
                      onChange={(e) => {
                        setKeptStaleRules((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) {
                            next.add(rule.id);
                          } else {
                            next.delete(rule.id);
                          }
                          return next;
                        });
                      }}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {rule.match_value}
                  </TableCell>
                  <TableCell>{rule.replace_value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export default function ColumnEditorPage() {
  return <ColumnEditor />;
}
