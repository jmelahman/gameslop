import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useRunStore } from "@/store/runStore";
import { useRunGuard } from "./useRunGuard";

afterEach(() => {
  useRunStore.setState({ runId: null, phase: null, combat: null });
});

describe("useRunGuard", () => {
  it("returns null when there's no active run", () => {
    useRunStore.setState({ runId: null });
    const { result } = renderHook(() => useRunGuard());
    expect(result.current).toBeNull();
  });

  it("returns the run id when one is active", () => {
    useRunStore.setState({ runId: "abc-123" });
    const { result } = renderHook(() => useRunGuard());
    expect(result.current).toBe("abc-123");
  });
});
