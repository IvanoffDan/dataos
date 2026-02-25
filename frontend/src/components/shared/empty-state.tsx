import type { ReactNode } from "react";

interface EmptyStateProps {
  message: string;
  action?: ReactNode;
}

export const EmptyState = ({ message, action }: EmptyStateProps) => (
  <div className="text-center py-12">
    <p className="text-[var(--muted-foreground)] text-sm">{message}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>
);
