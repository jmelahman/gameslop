import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "./client";

function mockResponse(init: { status: number; body?: unknown; bodyText?: string }): Response {
  const status = init.status;
  const headers = new Headers({ "Content-Type": "application/json" });
  const body =
    init.bodyText !== undefined
      ? init.bodyText
      : init.body === undefined
        ? ""
        : JSON.stringify(init.body);
  return new Response(body, { status, headers });
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("parses JSON success responses", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, body: { hello: "world" } }));
    const result = await apiFetch<{ hello: string }>("/api/hello");
    expect(result).toEqual({ hello: "world" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/hello",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("returns undefined for 204 No Content", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const result = await apiFetch<void>("/api/runs/active", { method: "DELETE" });
    expect(result).toBeUndefined();
  });

  it("serializes the body as JSON and sets the content-type", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, body: { ok: true } }));
    await apiFetch("/api/runs", { method: "POST", body: { hero_id: "warrior" } });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ hero_id: "warrior" }));
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
  });

  it("surfaces the server error envelope as an ApiError", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ status: 400, body: { error: "bad hero", code: "invalid_hero" } }),
    );

    await expect(apiFetch("/api/runs", { method: "POST" })).rejects.toMatchObject({
      name: "ApiError",
      message: "bad hero",
      status: 400,
      code: "invalid_hero",
    });
  });

  it("falls back to a generic message when the envelope is missing", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 500, bodyText: "" }));
    const err = await apiFetch("/api/x").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(500);
    expect((err as ApiError).message).toBe("request failed (500)");
    expect((err as ApiError).code).toBeUndefined();
  });

  it("ignores unparseable error bodies", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 502, bodyText: "<html>nope</html>" }));
    const err = await apiFetch("/api/x").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe("request failed (502)");
  });

  it("wraps network errors as ApiError with status 0", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network down"));
    const err = await apiFetch("/api/x").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
    expect((err as ApiError).message).toBe("network down");
  });

  it("forwards the abort signal", async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, body: { ok: true } }));
    await apiFetch("/api/x", { signal: controller.signal });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });
});
