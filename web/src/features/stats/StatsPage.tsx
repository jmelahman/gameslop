// StatsPage — read-only ledger of completed runs. Backed by
// GET /api/runs/history?limit=&offset= which now returns a paginated page
// with total counts. The page lets the player flip through history without
// leaking the active run, so the route is unguarded.

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { getRunHistory, type RunHistoryEntry, type RunHistoryPage } from "@/api/runs";
import { HEROES } from "@/features/hero-select/heroes";
import { cn } from "@/lib/cn";
import { MAX_DAY } from "@/lib/progression";

const PAGE_SIZE = 15;

export default function StatsPage() {
  const [page, setPage] = useState(0);
  const offset = page * PAGE_SIZE;
  const query = useQuery<RunHistoryPage>({
    queryKey: ["run-history", { limit: PAGE_SIZE, offset }],
    queryFn: () => getRunHistory(PAGE_SIZE, offset),
    staleTime: 5_000,
  });

  const total = query.data?.total ?? 0;
  const entries = query.data?.entries ?? [];
  const wins = entries.filter((e) => e.outcome === "won").length;
  const lastPage = total === 0 ? 0 : Math.floor((total - 1) / PAGE_SIZE);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-50">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="flex items-center justify-between gap-3">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-slate-400 text-sm hover:text-amber-200"
          >
            <ArrowLeft className="h-4 w-4" /> back to menu
          </Link>
          <h1 className="font-bold text-2xl tracking-wide">Run History</h1>
          <span className="font-mono text-slate-500 text-xs">{total} runs</span>
        </header>

        <SummaryStrip total={total} winsOnPage={wins} />

        {query.isLoading ? (
          <SkeletonRows />
        ) : query.error ? (
          <ErrorBox message={(query.error as Error).message} />
        ) : entries.length === 0 ? (
          <EmptyState />
        ) : (
          <HistoryTable entries={entries} />
        )}

        {total > PAGE_SIZE ? (
          <Pager
            page={page}
            lastPage={lastPage}
            onPrev={() => setPage((p) => Math.max(0, p - 1))}
            onNext={() => setPage((p) => Math.min(lastPage, p + 1))}
          />
        ) : null}
      </div>
    </main>
  );
}

function SummaryStrip({ total, winsOnPage }: { total: number; winsOnPage: number }) {
  // Page-scoped win count avoids a second round-trip; the table is the
  // source of truth for any deeper breakdown.
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-wrap items-center gap-6 rounded-lg border border-slate-800 bg-slate-900/40 px-5 py-3 text-sm"
    >
      <span className="flex items-center gap-1.5">
        <Trophy className="h-4 w-4 text-amber-300" />
        <span className="text-slate-400 text-xs uppercase tracking-wider">total runs</span>
        <span className="font-mono text-base">{total}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-slate-400 text-xs uppercase tracking-wider">wins on page</span>
        <span className="font-mono text-base text-emerald-300">{winsOnPage}</span>
      </span>
    </motion.div>
  );
}

function HistoryTable({ entries }: { entries: RunHistoryEntry[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-900/80 text-slate-400 text-xs uppercase tracking-wider">
          <tr>
            <th className="px-4 py-2 text-left">Hero</th>
            <th className="px-4 py-2 text-left">Days</th>
            <th className="px-4 py-2 text-left">Outcome</th>
            <th className="px-4 py-2 text-right">Finished</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 bg-slate-950/40">
          {entries.map((entry) => (
            <tr key={entry.id} className="hover:bg-slate-900/40">
              <td className="px-4 py-2 capitalize">{heroLabel(entry.heroId)}</td>
              <td className="px-4 py-2 font-mono text-slate-300">
                {entry.daysReached}/{MAX_DAY}
              </td>
              <td className="px-4 py-2">
                <OutcomeBadge outcome={entry.outcome} />
              </td>
              <td className="px-4 py-2 text-right font-mono text-slate-400 text-xs">
                {formatTimestamp(entry.finishedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: RunHistoryEntry["outcome"] }) {
  return (
    <span
      className={cn(
        "rounded px-2 py-0.5 font-mono text-xs uppercase tracking-wider",
        outcome === "won" && "bg-emerald-500/15 text-emerald-300",
        outcome === "lost" && "bg-rose-500/15 text-rose-300",
        outcome === "abandoned" && "bg-slate-700/40 text-slate-300",
        outcome === "active" && "bg-amber-500/15 text-amber-200",
      )}
    >
      {outcome}
    </span>
  );
}

function Pager({
  page,
  lastPage,
  onPrev,
  onNext,
}: {
  page: number;
  lastPage: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-3">
      <button
        type="button"
        onClick={onPrev}
        disabled={page === 0}
        className="flex items-center gap-1 rounded border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-sm hover:border-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronLeft className="h-4 w-4" /> Prev
      </button>
      <span className="font-mono text-slate-400 text-xs">
        Page {page + 1} / {lastPage + 1}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={page >= lastPage}
        className="flex items-center gap-1 rounded border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-sm hover:border-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-slate-800 border-dashed bg-slate-900/30 px-6 py-12 text-center">
      <p className="text-slate-300">No runs yet.</p>
      <p className="mt-1 text-slate-500 text-xs">
        Finish (or abandon) a run and it will show up here.
      </p>
      <Link
        to="/hero-select"
        className="mt-4 inline-block rounded-md border border-amber-700 bg-amber-500/10 px-4 py-1.5 text-amber-200 text-sm hover:bg-amber-500/20"
      >
        Start a run
      </Link>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-rose-900 bg-rose-950/40 px-4 py-3 text-rose-200 text-sm">
      Failed to load run history: {message}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-800">
      <div className="h-9 bg-slate-900/80" />
      <ul className="divide-y divide-slate-800 bg-slate-950/40">
        {Array.from({ length: 5 }, (_, i) => i).map((i) => (
          <li key={i} className="h-10 animate-pulse bg-slate-900/40" />
        ))}
      </ul>
    </div>
  );
}

function heroLabel(id: string) {
  return HEROES.find((h) => h.id === id)?.name ?? id;
}

function formatTimestamp(unixSeconds: number) {
  if (!unixSeconds) return "—";
  const d = new Date(unixSeconds * 1000);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
