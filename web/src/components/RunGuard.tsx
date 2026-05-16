import { Navigate, Outlet, useLocation } from "react-router";
import { type RunPhase, useRunStore } from "@/store/runStore";

// expectedPhase maps each route under /run to the phase it requires. When the
// current phase doesn't match, RunGuard redirects to the route that does.
const PHASE_ROUTE: Record<RunPhase, string> = {
  shop: "/run",
  combat: "/run/combat",
  results: "/run/results",
};

export function RunGuard() {
  const runId = useRunStore((s) => s.runId);
  const phase = useRunStore((s) => s.phase);
  const location = useLocation();

  if (!runId) return <Navigate to="/" replace />;

  // No phase yet (fresh run) — default the URL to /run.
  const target = phase ? PHASE_ROUTE[phase] : "/run";
  if (location.pathname !== target) {
    return <Navigate to={target} replace />;
  }
  return <Outlet />;
}
