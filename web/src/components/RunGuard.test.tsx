import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import { useRunStore } from "@/store/runStore";
import { RunGuard } from "./RunGuard";

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: "/", element: <div>menu</div> },
      {
        element: <RunGuard />,
        children: [
          { path: "/run", element: <div>shop</div> },
          { path: "/run/combat", element: <div>combat</div> },
          { path: "/run/results", element: <div>results</div> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

afterEach(() => {
  useRunStore.setState({ runId: null, phase: null, combat: null });
});

describe("RunGuard", () => {
  it("redirects to '/' when no run is active", () => {
    useRunStore.setState({ runId: null, phase: null });
    renderAt("/run");
    expect(screen.getByText("menu")).toBeInTheDocument();
    expect(screen.queryByText("shop")).not.toBeInTheDocument();
  });

  it("renders the matching phase route when a run is active", () => {
    useRunStore.setState({ runId: "42", phase: "shop" });
    renderAt("/run");
    expect(screen.getByText("shop")).toBeInTheDocument();
  });

  it("redirects to the route that matches the current phase", () => {
    useRunStore.setState({ runId: "42", phase: "combat" });
    renderAt("/run");
    expect(screen.getByText("combat")).toBeInTheDocument();
    expect(screen.queryByText("shop")).not.toBeInTheDocument();
  });

  it("defaults phase-less runs to /run", () => {
    useRunStore.setState({ runId: "7", phase: null });
    renderAt("/run/combat");
    expect(screen.getByText("shop")).toBeInTheDocument();
  });

  it("renders results when phase is results", () => {
    useRunStore.setState({ runId: "9", phase: "results" });
    renderAt("/run/results");
    expect(screen.getByText("results")).toBeInTheDocument();
  });
});
