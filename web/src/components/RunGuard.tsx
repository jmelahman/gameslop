import { Navigate, Outlet } from "react-router";
import { useRunStore } from "@/store/runStore";

export function RunGuard() {
  const runId = useRunStore((s) => s.runId);
  if (!runId) return <Navigate to="/" replace />;
  return <Outlet />;
}
