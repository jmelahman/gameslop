// PlaybackControls — Play / Pause / Reset for the combat replay. Speed and
// seek-bar controls are deferred to phase 11.

import type { ReplayState } from "@/lib/combat/replay";
import { cn } from "@/lib/cn";

type Props = {
  status: ReplayState["status"];
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
};

export function PlaybackControls({ status, onPlay, onPause, onReset }: Props) {
  const playing = status === "playing";
  const ended = status === "ended";
  return (
    <div className="flex items-center gap-2">
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
    </div>
  );
}
