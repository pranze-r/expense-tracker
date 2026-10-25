import Link from "next/link";

export default function Home() {
  return (
    <main className="ruled-page flex flex-col min-h-dvh">
      <div className="flex-1 flex flex-col justify-center px-8 py-10">
        <p className="font-mono text-xs tracking-[0.2em] uppercase text-muted mb-4">
           · Shared Expense Tracker
        </p>
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] text-ink mb-6">
          Every expense,
          <br />
          <span className="italic text-ledger">accounted for.</span>
        </h1>
        <p className="text-muted text-base leading-relaxed max-w-xs">
          Keep separate books for trips, households, or teams — shared with
          whoever needs to see them, updated from anywhere.
        </p>
      </div>

      <div className="px-8 pb-10">
        <Link
          href="/books"
          className="group flex items-center justify-between bg-ledger text-paper px-6 py-4 rounded-xl font-medium active:scale-[0.98] transition"
        >
          <span>Open my books</span>
          <span className="font-mono transition-transform group-active:translate-x-0.5">
            →
          </span>
        </Link>
      </div>
    </main>
  );
}