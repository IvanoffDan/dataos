export const timeAgo = (dateStr: string): string => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

export const formatFrequency = (minutes: number | null): string => {
  if (!minutes) return "\u2014";
  if (minutes < 60) return `${minutes}m`;
  if (minutes === 60) return "1h";
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
};

export const formatFrequencyLong = (minutes: number | null): string => {
  if (!minutes) return "\u2014";
  if (minutes < 60) return `Every ${minutes} minutes`;
  if (minutes === 60) return "Every hour";
  if (minutes < 1440) return `Every ${Math.round(minutes / 60)} hours`;
  return `Every ${Math.round(minutes / 1440)} days`;
};

export const formatDateTime = (dateStr: string | null): string => {
  if (!dateStr) return "\u2014";
  return new Date(dateStr).toLocaleString();
};

export const statusBadgeVariant = (
  status: string
): "success" | "warning" | "error" | "secondary" => {
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
};

export const runBadgeVariant = (
  status: string
): "success" | "error" | "warning" | "secondary" => {
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
};

export const runBorderColor = (status: string): string => {
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
};

export const sourceStatusVariant = (
  status: string
): "success" | "warning" | "error" | "secondary" => {
  switch (status) {
    case "mapped":
      return "success";
    case "pending_mapping":
    case "pending_review":
      return "warning";
    case "auto_mapping":
    case "auto_labelling":
      return "secondary";
    case "error":
    case "processing_failed":
      return "error";
    default:
      return "secondary";
  }
};

export const formatSourceStatus = (status: string): string => {
  switch (status) {
    case "auto_mapping":
      return "Auto-Mapping";
    case "auto_labelling":
      return "Auto-Labelling";
    case "pending_mapping":
      return "Pending Mapping";
    case "pending_review":
      return "Pending Review";
    case "processing_failed":
      return "Failed";
    case "mapped":
      return "Mapped";
    default:
      return status;
  }
};

export const runStatusVariant = (
  status: string
): "success" | "warning" | "error" | "secondary" => {
  switch (status) {
    case "success":
      return "success";
    case "pending":
      return "warning";
    case "running":
      return "secondary";
    case "failed":
      return "error";
    default:
      return "secondary";
  }
};

export const formatMetricValue = (value: number, formatType: string): string => {
  if (formatType === "currency") {
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
};
