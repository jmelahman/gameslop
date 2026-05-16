import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { abandonRun } from "@/api/runs";
import { RUN_QUERY_KEY, useRun } from "@/hooks/useRun";
import { useRunStore } from "@/store/runStore";

export default function ShopPage() {
  const navigate = useNavigate();
  const clearRun = useRunStore((s) => s.clearRun);
  const qc = useQueryClient();
  const { data, isLoading, isFetching } = useRun();

  useEffect(() => {
    if (!isLoading && data === null) {
      // sessionStorage held a stale runId — server says no active run.
      clearRun();
      navigate("/", { replace: true });
    }
  }, [data, isLoading, clearRun, navigate]);

  const abandon = useMutation({
    mutationFn: abandonRun,
    onSuccess: () => {
      clearRun();
      qc.removeQueries({ queryKey: RUN_QUERY_KEY });
      navigate("/", { replace: true });
    },
  });

  if (isLoading || data === null || data === undefined) {
    return <ShopSkeleton />;
  }

  const { run, state } = data;

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-slate-950 px-6 py-12 text-slate-50">
      <h2 className="font-semibold text-2xl tracking-wide">Shop</h2>
      <p className="text-slate-400 text-sm">placeholder layout — phase 4 fills this in</p>

      <dl className="grid w-full max-w-md grid-cols-2 gap-3 rounded-md border border-slate-800 bg-slate-900/60 p-5 text-sm">
        <Stat label="Run ID" value={run.id} />
        <Stat label="Hero" value={run.heroId} />
        <Stat label="Day" value={state.day} />
        <Stat label="Gold" value={state.gold} />
        <Stat label="HP" value={state.hp} />
        <Stat label="Shop Lv" value={state.shopLevel} />
      </dl>

      {isFetching ? <p className="text-slate-500 text-xs">refreshing…</p> : null}

      <button
        type="button"
        onClick={() => abandon.mutate()}
        disabled={abandon.isPending}
        className="rounded-md border border-rose-700 bg-rose-950/40 px-4 py-2 text-rose-200 text-sm hover:bg-rose-900/40 disabled:opacity-50"
      >
        {abandon.isPending ? "Abandoning…" : "Abandon run"}
      </button>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <>
      <dt className="text-slate-500 uppercase tracking-wider">{label}</dt>
      <dd className="text-right font-mono text-slate-100">{value}</dd>
    </>
  );
}

function ShopSkeleton() {
  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-slate-950 px-6 py-12 text-slate-50">
      <div className="h-7 w-32 animate-pulse rounded bg-slate-800" />
      <div className="grid w-full max-w-md grid-cols-2 gap-3 rounded-md border border-slate-800 bg-slate-900/60 p-5">
        {Array.from({ length: 6 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder
          <div key={i} className="h-5 animate-pulse rounded bg-slate-800" />
        ))}
      </div>
    </main>
  );
}
