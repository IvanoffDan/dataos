"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

// --- Types ---

interface ConnectorSummary {
  id: number;
  name: string;
  service: string;
  status: string;
  paused: boolean;
  succeeded_at: string | null;
  failed_at: string | null;
  sync_state: string | null;
  created_at: string;
}

interface DatasetSummary {
  id: number;
  name: string;
  type: string;
  source_count: number;
  latest_run_status: string | null;
  latest_run_at: string | null;
  rule_count: number;
}

interface RecentRunItem {
  id: number;
  dataset_id: number;
  dataset_name: string;
  status: string;
  rows_processed: number;
  completed_at: string | null;
  created_at: string;
}

interface DashboardData {
  connector_count: number;
  connectors_healthy: number;
  connectors_failing: number;
  connectors_syncing: number;
  latest_sync: string | null;
  dataset_count: number;
  total_runs: number;
  runs_succeeded: number;
  runs_failed: number;
  total_rows_processed: number;
  total_label_rules: number;
  datasets_with_rules: number;
  connectors: ConnectorSummary[];
  datasets: DatasetSummary[];
  recent_runs: RecentRunItem[];
}

// --- Helpers ---

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function statusBadgeVariant(
  status: string
): "success" | "warning" | "error" | "secondary" {
  switch (status) {
    case "connected":
      return "success";
    case "setup_incomplete":
      return "warning";
    case "broken":
      return "error";
    default:
      return "secondary";
  }
}

function runBadgeVariant(
  status: string
): "success" | "error" | "warning" | "secondary" {
  switch (status) {
    case "success":
      return "success";
    case "failed":
      return "error";
    case "running":
      return "warning";
    default:
      return "secondary";
  }
}

function runBorderColor(status: string): string {
  switch (status) {
    case "success":
      return "border-l-green-500";
    case "failed":
      return "border-l-red-500";
    case "running":
      return "border-l-yellow-500";
    default:
      return "border-l-gray-300";
  }
}

// --- Sub-components ---

function SyncHealthDot({ connector }: { connector: ConnectorSummary }) {
  if (connector.paused) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
        <span className="h-2 w-2 rounded-full bg-gray-400" />
        Paused
      </span>
    );
  }
  if (connector.sync_state === "syncing") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-yellow-700">
        <span className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
        Syncing
      </span>
    );
  }
  const lastSuccess = connector.succeeded_at
    ? new Date(connector.succeeded_at).getTime()
    : 0;
  const lastFailure = connector.failed_at
    ? new Date(connector.failed_at).getTime()
    : 0;
  if (lastFailure > lastSuccess) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-red-700">
        <span className="h-2 w-2 rounded-full bg-red-500" />
        Failed {timeAgo(connector.failed_at!)}
      </span>
    );
  }
  if (lastSuccess > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-green-700">
        <span className="h-2 w-2 rounded-full bg-green-500" />
        {timeAgo(connector.succeeded_at!)}
      </span>
    );
  }
  return (
    <span className="text-xs text-[var(--muted-foreground)]">&mdash;</span>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="border-t-2 border-t-[var(--accent)] hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
            {title}
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-pink-50 text-[var(--accent)]">
            {icon}
          </span>
        </div>
        <div className="text-3xl font-bold text-[var(--primary)]">{value}</div>
        <p className="text-xs text-[var(--muted-foreground)] mt-1">
          {subtitle}
        </p>
      </CardContent>
    </Card>
  );
}

function SkeletonDashboard() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-80 bg-gray-200 rounded" />
      <div className="h-4 w-56 bg-gray-200 rounded" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 bg-gray-200 rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="h-64 bg-gray-200 rounded-lg" />
        <div className="h-64 bg-gray-200 rounded-lg" />
      </div>
      <div className="h-48 bg-gray-200 rounded-lg" />
    </div>
  );
}

function EmptyOnboarding() {
  const steps = [
    {
      num: 1,
      label: "Connect",
      desc: "Add a data source via Fivetran",
    },
    {
      num: 2,
      label: "Define data sources",
      desc: "Create logical data source schemas",
    },
    {
      num: 3,
      label: "Map columns",
      desc: "Map source columns to targets",
    },
    {
      num: 4,
      label: "Label values",
      desc: "Create rules to standardize data",
    },
  ];

  return (
    <Card className="max-w-2xl mx-auto mt-8">
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-2xl text-[var(--primary)]">
          Welcome to DataOS
        </CardTitle>
        <p className="text-[var(--muted-foreground)] text-sm mt-1">
          The next generation data ingestion platform. Get started in four
          steps.
        </p>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {steps.map((s) => (
            <div
              key={s.num}
              className="text-center p-4 rounded-lg bg-[var(--muted)]"
            >
              <div className="h-8 w-8 rounded-full bg-[var(--accent)] text-white text-sm font-bold flex items-center justify-center mx-auto mb-2">
                {s.num}
              </div>
              <div className="font-medium text-sm text-[var(--primary)]">
                {s.label}
              </div>
              <div className="text-xs text-[var(--muted-foreground)] mt-1">
                {s.desc}
              </div>
            </div>
          ))}
        </div>
        <div className="text-center">
          <Button asChild>
            <Link href="/connectors/new">Add your first connector</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Icons (inline SVGs to avoid extra deps) ---

function PlugIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22v-5" />
      <path d="M9 8V2" />
      <path d="M15 8V2" />
      <path d="M18 8v5a6 6 0 0 1-6 6a6 6 0 0 1-6-6V8Z" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5V19A9 3 0 0 0 21 19V5" />
      <path d="M3 12A9 3 0 0 0 21 12" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
    </svg>
  );
}

// --- Main dashboard ---

function DashboardContent() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/api/dashboard")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <SkeletonDashboard />;
  if (!data) return <p className="text-red-600">Failed to load dashboard.</p>;

  const isEmpty = data.connector_count === 0 && data.dataset_count === 0;
  if (isEmpty) return <EmptyOnboarding />;

  const pipelineSubtitle =
    data.total_runs > 0
      ? `${Math.round((data.runs_succeeded / data.total_runs) * 100)}% success rate`
      : "No runs yet";

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--primary)]">
          {getGreeting()}!
        </h1>
        <p className="text-[var(--muted-foreground)] text-sm mt-1">
          Here&apos;s your platform at a glance.
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Connectors"
          value={data.connector_count}
          subtitle={
            data.connectors_healthy > 0
              ? `${data.connectors_healthy} healthy`
              : data.connector_count > 0
                ? "None synced yet"
                : "No connectors"
          }
          icon={<PlugIcon />}
        />
        <MetricCard
          title="Data Sources"
          value={data.dataset_count}
          subtitle={
            data.datasets.filter((d) => d.source_count > 0).length > 0
              ? `${data.datasets.filter((d) => d.source_count > 0).length} with connectors`
              : "No connectors mapped"
          }
          icon={<DatabaseIcon />}
        />
        <MetricCard
          title="Pipeline"
          value={`${data.total_runs} runs`}
          subtitle={pipelineSubtitle}
          icon={<ActivityIcon />}
        />
        <MetricCard
          title="Labels"
          value={`${data.total_label_rules} rules`}
          subtitle={
            data.datasets_with_rules > 0
              ? `across ${data.datasets_with_rules} data source${data.datasets_with_rules > 1 ? "s" : ""}`
              : "No rules yet"
          }
          icon={<TagIcon />}
        />
      </div>

      {/* Connectors mini-table + Recent activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Connectors */}
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Connectors</CardTitle>
              <Link
                href="/connectors"
                className="text-xs text-[var(--accent)] hover:underline"
              >
                View all &rarr;
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {data.connectors.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)] py-4">
                No connectors yet.{" "}
                <Link
                  href="/connectors/new"
                  className="text-[var(--accent)] hover:underline"
                >
                  Add one
                </Link>
              </p>
            ) : (
              <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Service</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Sync</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.connectors.slice(0, 5).map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Link
                            href={`/connectors/${c.id}`}
                            className="text-[var(--primary)] font-medium hover:underline"
                          >
                            {c.name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-[var(--muted-foreground)] text-sm">
                          {c.service || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(c.status)}>
                            {c.status.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <SyncHealthDot connector={c} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {data.recent_runs.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)] py-4">
                No pipeline runs yet.
              </p>
            ) : (
              <div className="space-y-2">
                {data.recent_runs.map((run) => (
                  <div
                    key={run.id}
                    className={`flex items-center justify-between rounded-md border-l-4 ${runBorderColor(run.status)} bg-white px-3 py-2 border border-[var(--border)]`}
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/datasets/${run.dataset_id}`}
                        className="text-sm font-medium text-[var(--primary)] hover:underline truncate block"
                      >
                        {run.dataset_name}
                      </Link>
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {run.rows_processed.toLocaleString()} rows
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <Badge variant={runBadgeVariant(run.status)}>
                        {run.status}
                      </Badge>
                      <span className="text-xs text-[var(--muted-foreground)] w-14 text-right">
                        {timeAgo(run.completed_at || run.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Data Sources table */}
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Data Sources</CardTitle>
            <Link
              href="/datasets"
              className="text-xs text-[var(--accent)] hover:underline"
            >
              View all &rarr;
            </Link>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {data.datasets.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)] py-4">
              No data sources yet.{" "}
              <Link
                href="/datasets"
                className="text-[var(--accent)] hover:underline"
              >
                Create one
              </Link>
            </p>
          ) : (
            <div className="rounded-lg border border-[var(--border)] overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-center">Connectors</TableHead>
                    <TableHead>Latest Run</TableHead>
                    <TableHead className="text-center">Label Rules</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.datasets.map((ds) => (
                    <TableRow key={ds.id}>
                      <TableCell>
                        <Link
                          href={`/datasets/${ds.id}`}
                          className="text-[var(--primary)] font-medium hover:underline"
                        >
                          {ds.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{ds.type || "—"}</Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {ds.source_count}
                      </TableCell>
                      <TableCell>
                        {ds.latest_run_status ? (
                          <Badge variant={runBadgeVariant(ds.latest_run_status)}>
                            {ds.latest_run_status}
                          </Badge>
                        ) : (
                          <span className="text-xs text-[var(--muted-foreground)]">
                            &mdash;
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {ds.rule_count}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Home() {
  return <DashboardContent />;
}
