import Link from "next/link";
import type { ReactNode } from "react";

interface PageHeaderProps {
  backHref?: string;
  backLabel?: string;
  title: string;
  badges?: ReactNode;
  actions?: ReactNode;
  description?: string;
}

export const PageHeader = ({
  backHref,
  backLabel,
  title,
  badges,
  actions,
  description,
}: PageHeaderProps) => (
  <div>
    {backHref && (
      <div className="mb-4">
        <Link
          href={backHref}
          className="text-[var(--primary)] hover:underline text-sm"
        >
          &larr; {backLabel ?? "Back"}
        </Link>
      </div>
    )}
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-[var(--primary)]">{title}</h1>
        {badges}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
    {description && (
      <p className="text-sm text-[var(--muted-foreground)] -mt-4 mb-6">
        {description}
      </p>
    )}
  </div>
);
