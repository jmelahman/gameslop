import { createBrowserRouter } from "react-router";
import { ErrorElement } from "@/components/ErrorElement";
import { RunGuard } from "@/components/RunGuard";
import CombatPage from "@/features/combat/CombatPage";
import HeroSelectPage from "@/features/hero-select";
import ResultsPage from "@/features/results/ResultsPage";
import SettingsPage from "@/features/settings/SettingsPage";
import ShopPage from "@/features/shop";
import StartMenuPage from "@/features/start-menu/StartMenuPage";
import StatsPage from "@/features/stats/StatsPage";

export const router = createBrowserRouter([
  { path: "/", element: <StartMenuPage />, errorElement: <ErrorElement /> },
  { path: "/hero-select", element: <HeroSelectPage />, errorElement: <ErrorElement /> },
  { path: "/settings", element: <SettingsPage />, errorElement: <ErrorElement /> },
  { path: "/stats", element: <StatsPage />, errorElement: <ErrorElement /> },
  {
    element: <RunGuard />,
    errorElement: <ErrorElement />,
    children: [
      { path: "/run", element: <ShopPage /> },
      { path: "/run/combat", element: <CombatPage /> },
      { path: "/run/results", element: <ResultsPage /> },
    ],
  },
]);
