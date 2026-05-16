import { motion } from "framer-motion";
import { Link } from "react-router";
import { fadeDown, fadeUp, stagger } from "@/lib/animations";
import { cn } from "@/lib/cn";
import { useRunStore } from "@/store/runStore";

type MenuItem = {
  label: string;
  to: string;
  disabled?: boolean;
  hint?: string;
};

export default function StartMenuPage() {
  const runId = useRunStore((s) => s.runId);

  const items: MenuItem[] = [
    { label: "New Run", to: "/hero-select" },
    {
      label: "Continue",
      to: "/run",
      disabled: !runId,
      hint: runId ? undefined : "no active run",
    },
    { label: "Stats", to: "/settings" },
    { label: "Settings", to: "/settings" },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-50">
      <BackgroundGradient />
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-12 px-6">
        <motion.h1
          variants={fadeDown}
          initial="hidden"
          animate="visible"
          className="text-center font-black tracking-[0.2em] text-amber-100 text-6xl drop-shadow-[0_0_24px_rgba(251,191,36,0.35)] sm:text-7xl md:text-8xl"
        >
          GAMESLOP
        </motion.h1>

        <motion.ul
          variants={stagger(0.1, 0.4)}
          initial="hidden"
          animate="visible"
          className="flex w-72 flex-col gap-3"
        >
          {items.map((item) => (
            <motion.li key={item.label} variants={fadeUp}>
              <MenuButton item={item} />
            </motion.li>
          ))}
        </motion.ul>

        <motion.p
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.9 }}
          className="absolute bottom-6 text-slate-600 text-xs tracking-widest uppercase"
        >
          v0 · single-player prototype
        </motion.p>
      </div>
    </main>
  );
}

function MenuButton({ item }: { item: MenuItem }) {
  const baseClass = cn(
    "group relative block w-full overflow-hidden rounded-md border px-6 py-3 text-left font-medium text-lg tracking-wide transition-colors",
    item.disabled
      ? "cursor-not-allowed border-slate-900 bg-slate-950/60 text-slate-600"
      : "border-slate-800 bg-slate-900/60 text-slate-100 hover:border-amber-700 hover:bg-slate-900",
  );

  const indicator = (
    <span className="absolute top-0 left-0 h-full w-1 origin-bottom scale-y-0 bg-amber-500 transition-transform duration-200 group-hover:scale-y-100" />
  );

  const inner = (
    <>
      {indicator}
      <span className="flex items-baseline justify-between gap-3">
        <span>{item.label}</span>
        {item.hint ? (
          <span className="text-slate-500 text-xs uppercase tracking-wider">{item.hint}</span>
        ) : null}
      </span>
    </>
  );

  if (item.disabled) {
    return (
      <span className={baseClass} aria-disabled="true">
        {inner}
      </span>
    );
  }

  return (
    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
      <Link to={item.to} className={baseClass}>
        {inner}
      </Link>
    </motion.div>
  );
}

function BackgroundGradient() {
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          "radial-gradient(ellipse 70% 50% at 50% 30%, rgba(251,146,60,0.18), transparent 60%), radial-gradient(ellipse 80% 70% at 50% 100%, rgba(15,23,42,0.9), transparent 60%)",
      }}
      animate={{ opacity: [0.55, 1, 0.55] }}
      transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}
