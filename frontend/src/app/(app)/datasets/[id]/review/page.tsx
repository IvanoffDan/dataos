"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  useReviewContext,
  useApproveDataSource,
  useRetryDataSource,
  usePatchMapping,
  useAcceptMappings,
  useResetMappingsAccepted,
  useSourceColumns,
  useDataSourcePolling,
} from "@/hooks/use-data-sources";
import {
  useSaveColumnRules,
  useAutoLabelColumn,
  useUndoAutoLabelColumn,
} from "@/hooks/use-labels";
import { sourceStatusVariant, formatSourceStatus } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ErrorBanner } from "@/components/shared/error-banner";
import { PageHeader } from "@/components/shared/page-header";
import type {
  ReviewMapping,
  ReviewLabelColumn,
  ReviewSummary,
  SourceColumn,
} from "@/types";

// --- Step Indicator ---

const StepIndicator = ({ step, mappingsAccepted }: { step: 1 | 2; mappingsAccepted: boolean }) => (
  <div className="flex items-center gap-2 mb-6">
    <div className="flex items-center gap-1.5">
      <div
        className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${
          mappingsAccepted
            ? "bg-green-500 text-white"
            : step === 1
            ? "bg-[var(--primary)] text-white"
            : "bg-[var(--muted)] text-[var(--muted-foreground)]"
        }`}
      >
        {mappingsAccepted ? "\u2713" : "1"}
      </div>
      <span className={`text-sm ${step === 1 ? "font-medium" : "text-[var(--muted-foreground)]"}`}>
        Mappings
      </span>
    </div>
    <div className={`h-px w-8 ${mappingsAccepted ? "bg-green-500" : "bg-[var(--border)]"}`} />
    <div className="flex items-center gap-1.5">
      <div
        className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${
          step === 2
            ? "bg-[var(--primary)] text-white"
            : "bg-[var(--muted)] text-[var(--muted-foreground)]"
        }`}
      >
        2
      </div>
      <span className={`text-sm ${step === 2 ? "font-medium" : "text-[var(--muted-foreground)]"}`}>
        Labels
      </span>
    </div>
  </div>
);

// --- Summary Cards ---

const SummaryCard = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="rounded-lg border border-[var(--border)] bg-white p-4 text-center">
    <p className="text-2xl font-bold text-[var(--foreground)]">{value}</p>
    <p className="text-xs text-[var(--muted-foreground)] mt-1">{label}</p>
    {sub && <p className="text-xs text-[var(--muted-foreground)]">{sub}</p>}
  </div>
);

const MappingSummaryBanner = ({ summary }: { summary: ReviewSummary }) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
    <SummaryCard
      label="Mapped"
      value={`${summary.mapped_count}/${summary.total_target_columns}`}
    />
    <SummaryCard
      label="High Confidence"
      value={String(summary.high_confidence_count)}
    />
    <SummaryCard
      label="Needs Review"
      value={String(summary.needs_review_count)}
    />
    <SummaryCard
      label="Unmapped Required"
      value={String(summary.unmapped_required_count)}
    />
  </div>
);

const LabelSummaryBanner = ({ summary }: { summary: ReviewSummary }) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
    <SummaryCard
      label="Label Columns"
      value={String(summary.label_columns_count)}
    />
    <SummaryCard
      label="Total Rules"
      value={String(summary.total_label_rules)}
    />
    <SummaryCard
      label="Row Coverage"
      value={summary.label_columns_count > 0 ? `${summary.row_coverage_pct}%` : "\u2014"}
    />
    <SummaryCard
      label="Mapped"
      value={`${summary.mapped_count}/${summary.total_target_columns}`}
    />
  </div>
);

// --- Confidence Badge ---

const ConfidenceBadge = ({ confidence, ai }: { confidence: number | null; ai: boolean | null }) => {
  if (!ai) return null;
  if (confidence === null) return <Badge variant="secondary">AI</Badge>;
  if (confidence >= 0.9) return <Badge variant="success">AI {Math.round(confidence * 100)}%</Badge>;
  if (confidence >= 0.7) return <Badge variant="warning">AI {Math.round(confidence * 100)}%</Badge>;
  return <Badge variant="error">AI {Math.round(confidence * 100)}%</Badge>;
};

// --- Mapping Review Row ---

const MappingReviewRow = ({
  mapping,
  sourceColumns,
  dsId,
}: {
  mapping: ReviewMapping;
  sourceColumns: SourceColumn[];
  dsId: number;
}) => {
  const patchMut = usePatchMapping(dsId);
  const [isStatic, setIsStatic] = useState(!!mapping.static_value && !mapping.source_column);
  const [localSource, setLocalSource] = useState(mapping.source_column ?? "");
  const [staticVal, setStaticVal] = useState(mapping.static_value ?? "");
  const [showReasoning, setShowReasoning] = useState(false);

  // Sync local state when server data arrives (after refetch)
  useEffect(() => { setLocalSource(mapping.source_column ?? ""); }, [mapping.source_column]);
  useEffect(() => { setStaticVal(mapping.static_value ?? ""); }, [mapping.static_value]);
  useEffect(() => { setIsStatic(!!mapping.static_value && !mapping.source_column); }, [mapping.static_value, mapping.source_column]);

  const isMapped = !!(localSource || staticVal);
  const needsReview =
    (mapping.confidence !== null && mapping.confidence < 0.9) ||
    (mapping.target_required && !isMapped);

  return (
    <div
      className={`rounded-lg border p-4 ${
        !isMapped && mapping.target_required
          ? "border-red-300 bg-red-50/50"
          : needsReview
          ? "border-yellow-300 bg-yellow-50/50"
          : "border-[var(--border)] bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium font-mono text-sm">{mapping.target_column}</span>
            <span className="text-xs text-[var(--muted-foreground)]">
              {mapping.target_type}
            </span>
            {mapping.target_required && (
              <Badge variant="secondary" className="text-[10px]">required</Badge>
            )}
            <ConfidenceBadge confidence={mapping.confidence} ai={mapping.ai_suggested} />
            {!isMapped && mapping.target_required && (
              <Badge variant="error">Missing</Badge>
            )}
          </div>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">{mapping.target_description}</p>
          {mapping.sample_values.length > 0 && (
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              Samples: {mapping.sample_values.map((v) => `"${v}"`).join(", ")}
            </p>
          )}
          {mapping.reasoning && (
            <button
              onClick={() => setShowReasoning(!showReasoning)}
              className="text-xs text-[var(--primary)] hover:underline mt-1"
            >
              {showReasoning ? "Hide reasoning" : "Show AI reasoning"}
            </button>
          )}
          {showReasoning && mapping.reasoning && (
            <p className="text-xs text-[var(--muted-foreground)] mt-1 italic bg-[var(--muted)] rounded p-2">
              {mapping.reasoning}
            </p>
          )}
        </div>

        {/* Inline editing */}
        <div className="flex items-center gap-2 shrink-0">
          {!isStatic ? (
            <select
              className="h-9 rounded-md border border-[var(--border)] bg-white px-2 text-sm min-w-[180px]"
              value={localSource}
              onChange={(e) => {
                const val = e.target.value || null;
                setLocalSource(e.target.value);
                patchMut.mutate({ targetColumn: mapping.target_column, body: { source_column: val } });
              }}
            >
              <option value="">-- select --</option>
              {sourceColumns.map((sc) => (
                <option key={sc.name} value={sc.name}>
                  {sc.name} ({sc.type})
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-1">
              <Input
                className="h-9 w-[140px] text-sm"
                value={staticVal}
                onChange={(e) => setStaticVal(e.target.value)}
                onBlur={() => {
                  if (staticVal !== (mapping.static_value ?? "")) {
                    patchMut.mutate({
                      targetColumn: mapping.target_column,
                      body: { static_value: staticVal || null },
                    });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                placeholder="Static value"
              />
            </div>
          )}
          <button
            onClick={() => setIsStatic(!isStatic)}
            className="text-xs text-[var(--primary)] hover:underline whitespace-nowrap"
          >
            {isStatic ? "Column" : "Static"}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Mapping Review Section ---

const MappingReviewSection = ({
  mappings,
  sourceColumns,
  dsId,
}: {
  mappings: ReviewMapping[];
  sourceColumns: SourceColumn[];
  dsId: number;
}) => {
  const [showAll, setShowAll] = useState(false);

  const highConf = mappings.filter(
    (m) =>
      (m.source_column || m.static_value) &&
      m.confidence !== null &&
      m.confidence >= 0.9
  );
  const needsReview = mappings.filter(
    (m) =>
      (m.confidence !== null && m.confidence < 0.9) ||
      (m.target_required && !m.source_column && !m.static_value) ||
      m.confidence === null
  );

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Column Mappings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Needs review — always shown */}
        {needsReview.map((m) => (
          <MappingReviewRow
            key={m.target_column}
            mapping={m}
            sourceColumns={sourceColumns}
            dsId={dsId}
          />
        ))}

        {/* High confidence — collapsible */}
        {highConf.length > 0 && (
          <>
            <button
              onClick={() => setShowAll(!showAll)}
              className="flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] w-full py-2"
            >
              <span className="text-xs">{showAll ? "\u25BE" : "\u25B8"}</span>
              <span>
                {highConf.length} high-confidence mapping{highConf.length !== 1 ? "s" : ""}
              </span>
            </button>
            {showAll &&
              highConf.map((m) => (
                <MappingReviewRow
                  key={m.target_column}
                  mapping={m}
                  sourceColumns={sourceColumns}
                  dsId={dsId}
                />
              ))}
          </>
        )}
      </CardContent>
    </Card>
  );
};

// --- Label Column Card ---

const LabelColumnCard = ({
  column,
  datasetType,
}: {
  column: ReviewLabelColumn;
  datasetType: string;
}) => {
  const allHighConf = column.rules.every(
    (r) => r.confidence !== null && r.confidence >= 0.9
  );
  const shouldCollapse = allHighConf && column.rules.length > 0;

  const [expanded, setExpanded] = useState(!shouldCollapse);
  const [editedRules, setEditedRules] = useState<Record<string, string>>({});
  const saveMut = useSaveColumnRules(datasetType, column.column_name);
  const autoLabelMut = useAutoLabelColumn(datasetType, column.column_name);
  const undoMut = useUndoAutoLabelColumn(datasetType, column.column_name);

  const handleSave = () => {
    const rules = column.rules.map((r) => ({
      match_value: r.match_value,
      replace_value: editedRules[r.match_value] ?? r.replace_value,
    }));
    saveMut.mutate(rules);
    setEditedRules({});
  };

  const hasEdits = Object.keys(editedRules).length > 0;

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs">{expanded ? "\u25BE" : "\u25B8"}</span>
            <CardTitle className="text-base font-mono">{column.column_name}</CardTitle>
            <Badge variant="secondary">
              {column.rule_count}/{column.distinct_count} values
            </Badge>
            <Badge variant={column.coverage_pct >= 90 ? "success" : column.coverage_pct >= 50 ? "warning" : "error"}>
              {column.coverage_pct}% coverage
            </Badge>
          </div>
          <span className="text-xs text-[var(--muted-foreground)]">
            {column.row_coverage_pct}% row coverage
          </span>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent>
          <div className="space-y-2 mb-4">
            {column.rules.map((rule) => (
              <div key={rule.match_value} className="flex items-center gap-3 text-sm">
                <span className="font-mono text-xs w-[200px] truncate" title={rule.match_value}>
                  {rule.match_value}
                </span>
                <span className="text-[var(--muted-foreground)] text-xs">
                  ({rule.row_count.toLocaleString()} rows)
                </span>
                <span className="text-[var(--muted-foreground)]">&rarr;</span>
                <Input
                  className="h-8 w-[180px] text-sm"
                  value={editedRules[rule.match_value] ?? rule.replace_value}
                  onChange={(e) =>
                    setEditedRules((prev) => ({ ...prev, [rule.match_value]: e.target.value }))
                  }
                />
                <ConfidenceBadge confidence={rule.confidence} ai={rule.ai_suggested} />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {hasEdits && (
              <Button size="sm" onClick={handleSave} disabled={saveMut.isPending}>
                {saveMut.isPending ? "Saving..." : "Save Changes"}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => autoLabelMut.mutate()}
              disabled={autoLabelMut.isPending}
            >
              {autoLabelMut.isPending ? "Running..." : "Re-run AI"}
            </Button>
            {column.ai_rule_count > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => undoMut.mutate()}
                disabled={undoMut.isPending}
              >
                {undoMut.isPending ? "Clearing..." : "Clear AI"}
              </Button>
            )}
            <Button asChild size="sm" variant="outline">
              <Link href={`/labels/${datasetType}/${column.column_name}`}>
                Full Editor
              </Link>
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
};

// --- Label Review Section ---

const LabelReviewSection = ({
  columns,
  datasetType,
}: {
  columns: ReviewLabelColumn[];
  datasetType: string;
}) => {
  if (columns.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-[var(--muted-foreground)]">
          <p className="text-sm">No label columns for this dataset type.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {columns.map((col) => (
        <LabelColumnCard key={col.column_name} column={col} datasetType={datasetType} />
      ))}
    </div>
  );
};

// --- Processing Banner ---

const processingSteps = [
  { key: "auto_mapping", label: "Mapping columns", description: "AI is analyzing source columns and mapping them to the target schema" },
  { key: "auto_labelling", label: "Labelling values", description: "AI is standardizing string values into canonical labels" },
  { key: "pending_review", label: "Ready for review", description: "Review mappings and labels below, then approve" },
];

const ProcessingBanner = ({ status, ds }: { status: string; ds: { dataset_type: string; connector_name: string; bq_table: string } }) => {
  const currentIdx = processingSteps.findIndex((s) => s.key === status);

  return (
    <Card className="mb-6 border-blue-200 bg-blue-50/50">
      <CardContent className="pt-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-900">
              {status === "auto_mapping"
                ? "AI is mapping source columns to the target schema..."
                : "AI is standardizing string values..."}
            </p>
            <p className="text-xs text-blue-700 mt-0.5">This page refreshes automatically</p>
          </div>
        </div>

        {/* Progress steps */}
        <div className="flex items-center gap-2 mb-4">
          {processingSteps.map((step, i) => {
            const isDone = i < currentIdx;
            const isCurrent = step.key === status;
            return (
              <div key={step.key} className="flex items-center gap-2">
                {i > 0 && (
                  <div className={`h-px w-6 ${isDone ? "bg-blue-500" : "bg-blue-200"}`} />
                )}
                <div className="flex items-center gap-1.5">
                  <div
                    className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isDone
                        ? "bg-blue-500 text-white"
                        : isCurrent
                        ? "bg-blue-500 text-white"
                        : "bg-blue-200 text-blue-500"
                    }`}
                  >
                    {isDone ? "\u2713" : i + 1}
                  </div>
                  <span
                    className={`text-xs ${
                      isCurrent ? "font-medium text-blue-900" : isDone ? "text-blue-700" : "text-blue-400"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Data source info */}
        <div className="flex items-center gap-4 text-xs text-blue-700 border-t border-blue-200 pt-3">
          <span>
            Type: <span className="font-medium">{ds.dataset_type}</span>
          </span>
          <span>
            Connector: <span className="font-medium">{ds.connector_name}</span>
          </span>
          <span className="font-mono">{ds.bq_table}</span>
        </div>
      </CardContent>
    </Card>
  );
};

// --- Main Page ---

const ReviewPage = () => {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const { data: ds, isLoading: dsLoading } = useDataSourcePolling(id);

  const processing =
    ds?.status === "auto_mapping" || ds?.status === "auto_labelling";

  const { data: ctx, isLoading: ctxLoading, error } = useReviewContext(id);
  const { data: sourceColumns = [] } = useSourceColumns(id);

  const approveMutation = useApproveDataSource(id);
  const retryMutation = useRetryDataSource(id);
  const acceptMappingsMut = useAcceptMappings(id);
  const resetMappingsMut = useResetMappingsAccepted(id);

  if (error) return <ErrorBanner message={error.message} />;
  if (dsLoading || !ds) {
    return <p className="text-[var(--muted-foreground)]">Loading...</p>;
  }

  const isReady = ds.status === "pending_review";
  const isFailed = ds.status === "processing_failed";
  const mappingsAccepted = ds.mappings_accepted;
  const currentStep: 1 | 2 = mappingsAccepted ? 2 : 1;

  return (
    <div>
      <PageHeader
        backHref={`/datasets/${id}`}
        backLabel="Back to Data Source"
        title={ds.name}
        badges={
          <Badge variant={sourceStatusVariant(ds.status)}>
            {formatSourceStatus(ds.status)}
          </Badge>
        }
        actions={
          isReady ? (
            <div className="flex items-center gap-2">
              {currentStep === 1 && (
                <Button
                  onClick={() => acceptMappingsMut.mutate(false)}
                  disabled={acceptMappingsMut.isPending}
                >
                  {acceptMappingsMut.isPending ? "Accepting..." : "Accept Mappings"}
                </Button>
              )}
              {currentStep === 2 && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => resetMappingsMut.mutate()}
                    disabled={resetMappingsMut.isPending}
                  >
                    Back to Mappings
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
                </>
              )}
            </div>
          ) : undefined
        }
      />

      {processing && (
        <ProcessingBanner
          status={ds.status}
          ds={{ dataset_type: ds.dataset_type, connector_name: ds.connector_name, bq_table: ds.bq_table }}
        />
      )}

      {isFailed && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-red-100 p-1.5 mt-0.5">
              <svg className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">Automated processing failed</p>
              <p className="text-sm text-red-700 mt-1">
                The pipeline encountered an error. You can retry the automation or map columns manually.
              </p>
              <div className="flex items-center gap-3 mt-3">
                <Button
                  size="sm"
                  onClick={() => retryMutation.mutate()}
                  disabled={retryMutation.isPending}
                >
                  {retryMutation.isPending ? "Retrying..." : "Retry Processing"}
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/datasets/${id}/mapping`}>Map Manually</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {ctx && (
        <>
          {isReady && <StepIndicator step={currentStep} mappingsAccepted={mappingsAccepted} />}

          {/* Step 1: Mappings */}
          {currentStep === 1 && (
            <>
              <MappingSummaryBanner summary={ctx.summary} />
              <MappingReviewSection
                mappings={ctx.mappings}
                sourceColumns={sourceColumns}
                dsId={id}
              />
              {isReady && (
                <div className="flex justify-end mt-4">
                  <Button
                    onClick={() => acceptMappingsMut.mutate(false)}
                    disabled={acceptMappingsMut.isPending}
                  >
                    {acceptMappingsMut.isPending ? "Accepting..." : "Accept Mappings & Continue"}
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Step 2: Labels */}
          {currentStep === 2 && (
            <>
              <LabelSummaryBanner summary={ctx.summary} />
              <LabelReviewSection
                columns={ctx.label_columns}
                datasetType={ds.dataset_type}
              />
              {isReady && (
                <div className="flex items-center justify-between mt-6">
                  <Button
                    variant="outline"
                    onClick={() => resetMappingsMut.mutate()}
                    disabled={resetMappingsMut.isPending}
                  >
                    Back to Mappings
                  </Button>
                  <Button
                    onClick={() =>
                      approveMutation.mutate(undefined, {
                        onSuccess: () => router.push(`/datasets/${id}`),
                      })
                    }
                    disabled={approveMutation.isPending}
                  >
                    {approveMutation.isPending ? "Approving..." : "Approve & Finish"}
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {!ctx && ctxLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          <span className="ml-3 text-[var(--muted-foreground)] text-sm">Loading review data...</span>
        </div>
      )}
    </div>
  );
};

export default ReviewPage;
