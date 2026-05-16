// PlaybackControls — Play / Pause / Reset / Skip + speed selector + seek bar
// for the combat replay. The seek bar is a native range input so keyboard
// users get arrow-key scrubbing for free; speed buttons round-trip through
// SET_SPEED so settingsStore picks them up via the sequencer.

import type { ReplayState } from "@/lib/combat/replay";
import { cn } from "@/lib/cn";

type Props = {
  status: ReplayState["status"];
  currentTick: number;
  maxTick: number;
  speed: number;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onSkip: () => void;
  onSeek: (tick: number) => void;
  onSetSpeed: (speed: number) => void;
};

const SPEEDS = [1, 2, 4] as const;

export function PlaybackControls({
  status,
  currentTick,
  maxTick,
  speed,
  onPlay,
  onPause,
  onReset,
  onSkip,
  onSeek,
  onSetSpeed,
}: Props) {
  const playing = status === "playing";
  const ended = status === "ended";
  return (
    <div className="flex w-full max-w-2xl flex-col items-stretch gap-2">
      <div className="flex items-center gap-2">
        <span className="w-12 text-right font-mono text-slate-400 text-xs">{currentTick}</span>
        <input
          type="range"
          min={0}
          max={Math.max(0, maxTick)}
          step={1}
          value={Math.min(currentTick, maxTick)}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="Seek combat replay"
          className="h-1.5 flex-1 cursor-pointer accent-amber-400"
        />
        <span className="w-12 font-mono text-slate-400 text-xs">{maxTick}</span>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {playing ? (
          <button
            type="button"
            onClick={onPause}
            className={cn(
              "rounded-md border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-slate-100 text-sm",
              "hover:bg-slate-700",
            )}
          >
            Pause
          </button>
        ) : (
          <button
            type="button"
            onClick={onPlay}
            className={cn(
              "rounded-md border border-amber-700/60 bg-amber-700/30 px-3 py-1.5 text-amber-100 text-sm",
              "hover:bg-amber-700/50",
            )}
          >
            {ended ? "Replay" : "Play"}
          </button>
        )}
        <button
          type="button"
          onClick={onReset}
          className={cn(
            "rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-slate-200 text-sm",
            "hover:bg-slate-800",
          )}
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={ended}
          className={cn(
            "rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-slate-200 text-sm",
            "hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          Skip
        </button>
        <div className="ml-2 flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/60 p-0.5">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSetSpeed(s)}
              aria-pressed={speed === s}
              className={cn(
                "rounded px-2 py-1 font-mono text-xs",
                speed === s
                  ? "bg-amber-600/40 text-amber-100"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200",
              )}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
