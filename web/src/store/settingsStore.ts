// settingsStore — user-facing playback / accessibility prefs persisted to
// localStorage so they survive across runs (unlike runStore which uses
// sessionStorage).

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type PlaybackSpeed = 1 | 2 | 4;

type SettingsStore = {
  playbackSpeed: PlaybackSpeed;
  skipAnimations: boolean;
  setPlaybackSpeed: (speed: PlaybackSpeed) => void;
  setSkipAnimations: (skip: boolean) => void;
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      playbackSpeed: 1,
      skipAnimations: false,
      setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
      setSkipAnimations: (skipAnimations) => set({ skipAnimations }),
    }),
    {
      name: "gameslop-settings",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
