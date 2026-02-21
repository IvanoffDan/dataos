import { Card, CardContent } from "@/components/ui/card";

interface KpiCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  loading?: boolean;
}

export function KpiCard({ label, value, subtext, loading }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-[var(--muted-foreground)]">{label}</p>
        {loading ? (
          <div className="h-8 w-24 bg-[var(--muted)] rounded animate-pulse mt-1" />
        ) : (
          <p className="text-2xl font-bold mt-1">{value}</p>
        )}
        {subtext && (
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            {subtext}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
