// SettingsPage — playback / accessibility prefs (persisted in localStorage
// via settingsStore) plus destructive actions like clearing the run history.
//
// Layout:
//   - Playback section (default replay speed + skip-animations toggle)
//   - Data section (clear run history with confirm)
//   - Keyboard shortcuts reference (read-only)

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowLeft, Check, FastForward, Keyboard, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { ApiError } from "@/api/client";
import { clearRunHistory } from "@/api/runs";
import { cn } from "@/lib/cn";
import { type PlaybackSpeed, useSettingsStore } from "@/store/settingsStore";

const SPEEDS: PlaybackSpeed[] = [1, 2, 4];

const SHORTCUTS: { section: string; keys: string[]; label: string }[] = [
  { section: "Shop", keys: ["R"], label: "Reroll the shop" },
  { section: "Shop", keys: ["F"], label: "Freeze / unfreeze hovered shop item" },
  { section: "Shop", keys: ["Space"], label: "Start combat" },
  { section: "Shop", keys: ["Right-click"], label: "Sell hovered board or bench item" },
  { section: "Combat", keys: ["Space"], label: "Play / pause replay" },
  { section: "Combat", keys: ["S"], label: "Skip replay to end" },
  { section: "Combat", keys: ["R"], label: "Restart replay" },
  { section: "Combat", keys: ["←", "→"], label: "Seek replay one tick" },
  { section: "Global", keys: ["?"], label: "Show keyboard shortcuts" },
  { section: "Global", keys: ["Esc"], label: "Close overlays" },
];

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-50">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header className="flex items-center justify-between gap-3">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-slate-400 text-sm hover:text-amber-200"
          >
            <ArrowLeft className="h-4 w-4" /> back to menu
          </Link>
          <h1 className="font-bold text-2xl tracking-wide">Settings</h1>
          <span aria-hidden="true" className="w-24" />
        </header>

        <PlaybackSection />
        <DataSection />
        <ShortcutsSection />
      </div>
    </main>
  );
}

function PlaybackSection() {
  const playbackSpeed = useSettingsStore((s) => s.playbackSpeed);
  const skipAnimations = useSettingsStore((s) => s.skipAnimations);
  const setPlaybackSpeed = useSettingsStore((s) => s.setPlaybackSpeed);
  const setSkipAnimations = useSettingsStore((s) => s.setSkipAnimations);

  return (
    <Section
      title="Playback"
      icon={<FastForward className="h-4 w-4 text-amber-300" />}
      description="How combat replays behave by default."
    >
      <Row label="Default playback speed">
        <div className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/60 p-0.5">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setPlaybackSpeed(s)}
              aria-pressed={playbackSpeed === s}
              className={cn(
                "rounded px-3 py-1 font-mono text-sm",
                playbackSpeed === s
                  ? "bg-amber-600/40 text-amber-100"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200",
              )}
            >
              {s}x
            </button>
          ))}
        </div>
      </Row>
      <Row
        label="Skip animations"
        hint="Jump straight from the shop into the results screen, bypassing combat playback. Useful for fast-forward sessions or screen-reader play."
      >
        <Toggle checked={skipAnimations} onChange={setSkipAnimations} />
      </Row>
    </Section>
  );
}

function DataSection() {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clear = useMutation({
    mutationFn: clearRunHistory,
    onSuccess: () => {
      setDone(true);
      setError(null);
      setConfirming(false);
      qc.invalidateQueries({ queryKey: ["run-history"] });
      // Auto-dismiss the success badge so it doesn't sit forever.
      setTimeout(() => setDone(false), 2_400);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Failed to clear history");
      setConfirming(false);
    },
    throwOnError: false,
  });

  return (
    <Section
      title="Data"
      icon={<Trash2 className="h-4 w-4 text-rose-300" />}
      description="Manage stored runs. These actions only affect this browser's local SQLite (single-player)."
    >
      <Row
        label="Run history"
        hint="Permanently deletes every finished run from the database. Active runs are unaffected."
      >
        <div className="flex items-center gap-2">
          {done ? (
            <span className="flex items-center gap-1 rounded-md border border-emerald-700 bg-emerald-950/60 px-3 py-1.5 text-emerald-200 text-xs">
              <Check className="h-3.5 w-3.5" /> Cleared
            </span>
          ) : confirming ? (
            <>
              <button
                type="button"
                onClick={() => clear.mutate()}
                disabled={clear.isPending}
                className="flex items-center gap-1 rounded-md border border-rose-700 bg-rose-900/40 px-3 py-1.5 text-rose-100 text-sm hover:bg-rose-900/60 disabled:opacity-50"
              >
                <AlertTriangle className="h-4 w-4" />
                {clear.isPending ? "Clearing…" : "Confirm clear"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={clear.isPending}
                className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-slate-200 text-sm hover:bg-slate-800 disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setConfirming(true);
              }}
              className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-slate-200 text-sm hover:border-rose-700 hover:text-rose-200"
            >
              <Trash2 className="h-4 w-4" /> Clear run history
            </button>
          )}
        </div>
      </Row>
      {error ? <p className="text-rose-300 text-xs">{error}</p> : null}
    </Section>
  );
}

function ShortcutsSection() {
  const sections = Array.from(new Set(SHORTCUTS.map((s) => s.section)));
  return (
    <Section
      title="Keyboard shortcuts"
      icon={<Keyboard className="h-4 w-4 text-slate-300" />}
      description="Press ? in-game for a context-specific overlay."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {sections.map((sec) => (
          <div key={sec}>
            <h4 className="mb-2 text-slate-400 text-xs uppercase tracking-wider">{sec}</h4>
            <ul className="flex flex-col gap-1.5">
              {SHORTCUTS.filter((s) => s.section === sec).map((s) => (
                <li
                  key={s.label}
                  className="flex items-center justify-between gap-3 rounded border border-slate-800 bg-slate-950/40 px-2 py-1.5 text-xs"
                >
                  <span className="text-slate-200">{s.label}</span>
                  <span className="flex items-center gap-1">
                    {s.keys.map((k) => (
                      <kbd
                        key={k}
                        className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 font-mono text-[0.65rem] text-slate-100"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Section({
  title,
  icon,
  description,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-lg border border-slate-800 bg-slate-900/40 p-5"
    >
      <header className="mb-4 flex items-center gap-2">
        {icon}
        <h2 className="font-semibold text-lg">{title}</h2>
      </header>
      {description ? <p className="mb-4 text-slate-400 text-sm">{description}</p> : null}
      <div className="flex flex-col gap-4">{children}</div>
    </motion.section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex-1">
        <p className="font-medium text-slate-100 text-sm">{label}</p>
        {hint ? <p className="mt-0.5 text-slate-500 text-xs">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full border transition-colors",
        checked
          ? "border-amber-500 bg-amber-500/40"
          : "border-slate-700 bg-slate-800 hover:bg-slate-700",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-slate-100 shadow transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}
