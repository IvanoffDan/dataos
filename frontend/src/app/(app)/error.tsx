"use client";

import { Button } from "@/components/ui/button";

const AppError = ({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) => (
  <div className="flex flex-col items-center justify-center py-20">
    <h2 className="text-2xl font-bold text-[var(--primary)] mb-2">Something went wrong</h2>
    <p className="text-[var(--muted-foreground)] text-sm mb-6 max-w-md text-center">
      {error.message || "An unexpected error occurred. Please try again."}
    </p>
    <Button onClick={reset}>Try Again</Button>
  </div>
);

export default AppError;
