"use client";

import Link from "next/link";
import { Plug, Database, Activity, Tag } from "lucide-react";
import { useDashboard } from "@/hooks/use-dashboard";
import { timeAgo, statusBadgeVariant, runBadgeVariant, runBorderColor } from "@/lib/format";
import type { ConnectorSummary } from "@/types";
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
import { SyncHealthDot } from "@/components/shared/sync-health-dot";
import { ErrorBanner } from "@/components/shared/error-banner";

const getGreeting = (): string => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
};

const MetricCard = ({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
}) => (
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
      <p className="text-xs text-[var(--muted-foreground)] mt-1">{subtitle}</p>
    </CardContent>
  </Card>
);

const SkeletonDashboard = () => (
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

const EmptyOnboarding = () => {
  const steps = [
    { num: 1, label: "Connect", desc: "Add a data source via Fivetran" },
    { num: 2, label: "Define data sources", desc: "Create logical data source schemas" },
    { num: 3, label: "Map columns", desc: "Map source columns to targets" },
    { num: 4, label: "Label values", desc: "Create rules to standardize data" },
  ];

  return (
    <Card className="max-w-2xl mx-auto mt-8">
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-2xl text-[var(--primary)]">
          Welcome to DataOS
        </CardTitle>
        <p className="text-[var(--muted-foreground)] text-sm mt-1">
          The next generation data ingestion platform. Get started in four steps.
        </p>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {steps.map((s) => (
            <div key={s.num} className="text-center p-4 rounded-lg bg-[var(--muted)]">
              <div className="h-8 w-8 rounded-full bg-[var(--accent)] text-white text-sm font-bold flex items-center justify-center mx-auto mb-2">
                {s.num}
              </div>
              <div className="font-medium text-sm text-[var(--primary)]">{s.label}</div>
              <div className="text-xs text-[var(--muted-foreground)] mt-1">{s.desc}</div>
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
};

const DashboardContent = () => {
  const { data, isLoading, error } = useDashboard();

  if (isLoading) return <SkeletonDashboard />;
  if (error) return <ErrorBanner message={error.message} />;
  if (!data) return <ErrorBanner message="Failed to load dashboard." />;

  const isEmpty = data.connector_count === 0 && data.data_source_count === 0;
  if (isEmpty) return <EmptyOnboarding />;

  const pipelineSubtitle =
    data.total_runs > 0
      ? `${Math.round((data.runs_succeeded / data.total_runs) * 100)}% success rate`
      : "No runs yet";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--primary)]">{getGreeting()}!</h1>
        <p className="text-[var(--muted-foreground)] text-sm mt-1">
          Here&apos;s your platform at a glance.
        </p>
      </div>

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
          icon={<Plug size={16} />}
        />
        <MetricCard
          title="Data Sources"
          value={data.data_source_count}
          subtitle={`${data.data_sources.length} configured`}
          icon={<Database size={16} />}
        />
        <MetricCard
          title="Pipeline"
          value={`${data.total_runs} runs`}
          subtitle={pipelineSubtitle}
          icon={<Activity size={16} />}
        />
        <MetricCard
          title="Labels"
          value={`${data.total_label_rules} rules`}
          subtitle={
            data.types_with_rules > 0
              ? `across ${data.types_with_rules} type${data.types_with_rules > 1 ? "s" : ""}`
              : "No rules yet"
          }
          icon={<Tag size={16} />}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Connectors</CardTitle>
              <Link href="/connectors" className="text-xs text-[var(--accent)] hover:underline">
                View all &rarr;
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {data.connectors.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)] py-4">
                No connectors yet.{" "}
                <Link href="/connectors/new" className="text-[var(--accent)] hover:underline">
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
                    {data.connectors.slice(0, 5).map((c: ConnectorSummary) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Link href={`/connectors/${c.id}`} className="text-[var(--primary)] font-medium hover:underline">
                            {c.name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-[var(--muted-foreground)] text-sm">
                          {c.service || "\u2014"}
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
                        href={`/datasets/${run.data_source_id}`}
                        className="text-sm font-medium text-[var(--primary)] hover:underline truncate block"
                      >
                        {run.data_source_name}
                      </Link>
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {run.rows_processed.toLocaleString()} rows
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <Badge variant={runBadgeVariant(run.status)}>{run.status}</Badge>
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

      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Data Sources</CardTitle>
            <Link href="/datasets" className="text-xs text-[var(--accent)] hover:underline">
              View all &rarr;
            </Link>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {data.data_sources.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)] py-4">
              No data sources yet.{" "}
              <Link href="/datasets" className="text-[var(--accent)] hover:underline">
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
                    <TableHead>Connector</TableHead>
                    <TableHead>Latest Run</TableHead>
                    <TableHead className="text-center">Label Rules</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data_sources.map((ds) => (
                    <TableRow key={ds.id}>
                      <TableCell>
                        <Link href={`/datasets/${ds.id}`} className="text-[var(--primary)] font-medium hover:underline">
                          {ds.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{ds.dataset_type || "\u2014"}</Badge>
                      </TableCell>
                      <TableCell className="text-[var(--muted-foreground)] text-sm">
                        {ds.connector_name || "\u2014"}
                      </TableCell>
                      <TableCell>
                        {ds.latest_run_status ? (
                          <Badge variant={runBadgeVariant(ds.latest_run_status)}>
                            {ds.latest_run_status}
                          </Badge>
                        ) : (
                          <span className="text-xs text-[var(--muted-foreground)]">&mdash;</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-sm">{ds.rule_count}</TableCell>
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
};

const Home = () => <DashboardContent />;
export default Home;
