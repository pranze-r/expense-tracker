import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-6 gap-6 text-center">
      <h1 className="text-2xl font-bold">Expense Tracker</h1>
      <p className="text-slate-500">
        Track expenses across multiple shared books, from anywhere.
      </p>
      <Link
        href="/books"
        className="bg-slate-900 text-white px-6 py-3 rounded-xl font-medium active:scale-95 transition"
      >
        Go to my books
      </Link>
    </main>
  );
}
