"use client";

import { Button } from "@/components/ui/button";

const RootError = ({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) => (
  <div className="flex min-h-screen flex-col items-center justify-center">
    <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
    <p className="text-gray-600 text-sm mb-6 max-w-md text-center">
      {error.message || "An unexpected error occurred."}
    </p>
    <Button onClick={reset}>Try Again</Button>
  </div>
);

export default RootError;
