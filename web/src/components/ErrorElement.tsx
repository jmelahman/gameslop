import { isRouteErrorResponse, Link, useRouteError } from "react-router";
import { ApiError } from "@/api/client";

export function ErrorElement() {
  const err = useRouteError();
  const { title, detail } = describe(err);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-6 py-12 text-slate-50">
      <h2 className="font-semibold text-2xl text-rose-300">{title}</h2>
      <p className="max-w-md text-center text-slate-300 text-sm">{detail}</p>
      <Link
        to="/"
        className="rounded-md border border-amber-600 px-4 py-2 text-amber-200 text-sm hover:bg-amber-500/10"
      >
        back to menu
      </Link>
    </main>
  );
}

function describe(err: unknown): { title: string; detail: string } {
  if (err instanceof ApiError) {
    return {
      title: err.status === 0 ? "Can't reach the server" : `Request failed (${err.status})`,
      detail: err.message,
    };
  }
  if (isRouteErrorResponse(err)) {
    return { title: `${err.status} ${err.statusText}`, detail: String(err.data ?? "") };
  }
  if (err instanceof Error) {
    return { title: "Something went wrong", detail: err.message };
  }
  return { title: "Something went wrong", detail: "Unknown error." };
}
