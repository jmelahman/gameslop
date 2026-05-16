import { Link } from "react-router";

export default function ResultsPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-slate-50">
      <h2 className="text-2xl font-semibold">Results</h2>
      <p className="text-slate-400">placeholder — phase 5/13</p>
      <Link to="/" className="text-amber-400 hover:underline">
        ← back to menu
      </Link>
    </main>
  );
}
