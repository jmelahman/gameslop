import { useEffect, useState } from "react";

export default function App() {
  const [message, setMessage] = useState<string>("…");

  useEffect(() => {
    fetch("/api/hello")
      .then((r) => r.json())
      .then((d: { message: string }) => setMessage(d.message))
      .catch(() => setMessage("(api unreachable)"));
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold">Gameslop</h1>
        <p className="text-slate-400">backend says: {message}</p>
      </div>
    </main>
  );
}
