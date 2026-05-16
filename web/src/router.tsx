import { createBrowserRouter } from "react-router";
import { RunGuard } from "@/components/RunGuard";
import CombatPage from "@/features/combat";
import HeroSelectPage from "@/features/hero-select";
import ResultsPage from "@/features/results";
import SettingsPage from "@/features/settings";
import ShopPage from "@/features/shop";
import StartMenuPage from "@/features/start-menu/StartMenuPage";

export const router = createBrowserRouter([
  { path: "/", element: <StartMenuPage /> },
  { path: "/hero-select", element: <HeroSelectPage /> },
  { path: "/settings", element: <SettingsPage /> },
  {
    element: <RunGuard />,
    children: [
      { path: "/run", element: <ShopPage /> },
      { path: "/run/combat", element: <CombatPage /> },
      { path: "/run/results", element: <ResultsPage /> },
    ],
  },
]);
