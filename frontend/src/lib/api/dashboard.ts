import { apiFetch } from "@/lib/api";
import type { DashboardData } from "@/types";

export const fetchDashboard = (): Promise<DashboardData> =>
  apiFetch("/api/dashboard");
