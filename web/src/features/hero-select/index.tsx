import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { startRun } from "@/api/runs";
import { ApiError } from "@/api/client";
import { RUN_QUERY_KEY } from "@/hooks/useRun";
import { cn } from "@/lib/cn";
import { useRunStore } from "@/store/runStore";
import { HEROES, type HeroCard } from "./heroes";

export default function HeroSelectPage() {
  const navigate = useNavigate();
  const setRun = useRunStore((s) => s.setRun);
  const qc = useQueryClient();
  const [selected, setSelected] = useState<HeroCard | null>(null);

  const mutation = useMutation({
    mutationFn: (heroId: string) => startRun(heroId),
    onSuccess: (active) => {
      setRun(String(active.run.id), "shop");
      qc.setQueryData(RUN_QUERY_KEY, active);
      navigate("/run");
    },
    throwOnError: false,
  });

  const errMessage = mutation.error instanceof ApiError ? mutation.error.message : null;

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 bg-slate-950 px-6 py-12 text-slate-50">
      <header className="flex flex-col items-center gap-2">
        <Link to="/" className="text-amber-400 text-sm hover:underline">
          ← back to menu
        </Link>
        <h2 className="font-semibold text-3xl tracking-wide">Choose your hero</h2>
        <p className="text-slate-400 text-sm">pick once — you keep them for the whole run</p>
      </header>

      <ul className="grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {HEROES.map((hero) => {
          const isSelected = selected?.id === hero.id;
          return (
            <li key={hero.id}>
              <button
                type="button"
                onClick={() => setSelected(hero)}
                disabled={mutation.isPending}
                className={cn(
                  "group flex h-full w-full flex-col gap-3 rounded-lg border-2 bg-slate-900/60 p-5 text-left transition-colors",
                  hero.accent,
                  isSelected
                    ? "bg-slate-800 ring-2 ring-amber-400"
                    : "border-opacity-40 hover:bg-slate-900",
                  mutation.isPending && "cursor-wait opacity-60",
                )}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold text-xl">{hero.name}</span>
                  <span className="text-slate-400 text-xs uppercase tracking-wider">
                    {hero.startingHp} hp
                  </span>
                </div>
                <p className="text-slate-300 text-sm leading-relaxed">{hero.description}</p>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex w-full max-w-md flex-col items-stretch gap-3">
        <button
          type="button"
          disabled={!selected || mutation.isPending}
          onClick={() => selected && mutation.mutate(selected.id)}
          className={cn(
            "rounded-md border border-amber-600 bg-amber-500/10 px-6 py-3 font-medium tracking-wide transition-colors",
            !selected || mutation.isPending
              ? "cursor-not-allowed text-slate-500"
              : "text-amber-100 hover:bg-amber-500/20",
          )}
        >
          {mutation.isPending
            ? "Starting…"
            : selected
              ? `Begin with ${selected.name}`
              : "Select a hero"}
        </button>
        {errMessage ? (
          <p
            role="alert"
            className="rounded-md border border-rose-700 bg-rose-950/50 px-4 py-2 text-rose-200 text-sm"
          >
            {errMessage}
          </p>
        ) : null}
      </div>
    </main>
  );
}
