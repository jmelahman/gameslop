// ShortcutsOverlay — modal-ish keyboard reference toggled by `?`. Lists the
// shop-phase shortcuts in a single column so players can ramp off the mouse
// without context-switching to docs.

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

export type Shortcut = {
  keys: string[];
  label: string;
};

export const SHOP_SHORTCUTS: Shortcut[] = [
  { keys: ["R"], label: "Reroll the shop" },
  { keys: ["F"], label: "Freeze / unfreeze hovered shop item" },
  { keys: ["Space"], label: "Start combat" },
  { keys: ["Right-click"], label: "Sell hovered board or bench item" },
  { keys: ["?"], label: "Show this help" },
  { keys: ["Esc"], label: "Close this help" },
];

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ShortcutsOverlay({ open, onClose }: Props) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="overlay"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <button
            type="button"
            aria-label="Dismiss"
            tabIndex={-1}
            className="absolute inset-0 cursor-default bg-slate-950/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-label="Keyboard shortcuts"
            className="relative w-full max-w-sm rounded-lg border border-slate-700 bg-slate-900/95 p-5 shadow-2xl"
            initial={{ y: 8, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 8, scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3 right-3 rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              aria-label="Close shortcuts"
            >
              <X className="h-4 w-4" />
            </button>
            <h2 className="font-semibold text-amber-200 text-lg">Keyboard Shortcuts</h2>
            <p className="mt-1 text-slate-400 text-xs">Shop phase</p>
            <ul className="mt-4 flex flex-col gap-2">
              {SHOP_SHORTCUTS.map((s) => (
                <li
                  key={s.label}
                  className="flex items-center justify-between gap-3 rounded border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm"
                >
                  <span className="text-slate-200">{s.label}</span>
                  <span className="flex items-center gap-1">
                    {s.keys.map((k) => (
                      <kbd
                        key={k}
                        className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 font-mono text-[0.7rem] text-slate-100"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-slate-500 text-xs">
              Tip: hover any shop card before pressing{" "}
              <kbd className="rounded bg-slate-800 px-1">F</kbd> to freeze it without reaching for
              the mouse.
            </p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
