"use client";

import { useEffect, useState } from "react";
import type { LocalCategory } from "@/lib/db";
import {
  STARTER_CATEGORIES,
  addStarterCategories,
  renameCategoryLocal,
  deleteCategoryLocal,
} from "@/lib/sync";

type Props = {
  bookId: string;
  categories: LocalCategory[];
  onClose: () => void;
};

export default function CategoriesDialog({ bookId, categories, onClose }: Props) {
  // Escape closes the card, and the page behind doesn't scroll under it
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const missingStarters = STARTER_CATEGORIES.filter(
    (name) => !categories.some((c) => c.name.toLowerCase() === name.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 pb-[12dvh]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="categories-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white border border-line rounded-2xl p-6 shadow-2xl"
      >
        <h2 id="categories-title" className="font-display text-2xl text-ink mb-1">
          Categories
        </h2>
        <p className="text-sm text-muted mb-4">
          Rename a category, or remove ones you don&rsquo;t use. Removing one only clears the label &mdash;
          entries keep their amounts and notes.
        </p>

        {categories.length === 0 ? (
          <p className="text-sm text-muted py-4 text-center">No categories left.</p>
        ) : (
          <ul className="max-h-[50dvh] overflow-y-auto -mx-1 px-1">
            {categories.map((c) => (
              <CategoryRow key={c.id} bookId={bookId} category={c} />
            ))}
          </ul>
        )}

        {missingStarters.length > 0 && (
          <button
            type="button"
            onClick={() => addStarterCategories(bookId)}
            className="w-full mt-3 text-left rounded-lg border border-dashed border-line px-3 py-2 active:bg-ledger-light/40 transition"
          >
            <span className="block text-sm font-medium text-ink">Add starter categories</span>
            <span className="block text-xs text-muted">{missingStarters.join(" · ")}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full mt-4 border border-line bg-white text-ink px-4 py-2.5 rounded-lg text-sm font-medium active:scale-95 transition"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function CategoryRow({ bookId, category }: { bookId: string; category: LocalCategory }) {
  const [name, setName] = useState(category.name);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const trimmed = name.trim().replace(/\s+/g, " ");
  const changed = trimmed !== "" && trimmed !== category.name;

  async function save() {
    const ok = await renameCategoryLocal(bookId, category.id, trimmed);
    setError(ok ? null : "Another category already has that name.");
  }

  if (confirming) {
    return (
      <li className="ledger-row py-3">
        <p className="text-sm text-ink mb-2">
          Remove &ldquo;{category.name}&rdquo;? Entries using it become uncategorised.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="flex-1 border border-line bg-white text-ink px-3 py-1.5 rounded-lg text-xs font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => deleteCategoryLocal(bookId, category.id)}
            className="flex-1 bg-rust text-paper px-3 py-1.5 rounded-lg text-xs font-medium"
          >
            Remove
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="ledger-row py-3">
      <div className="flex gap-2 items-center">
        <input
          value={name}
          maxLength={30}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && changed) save();
          }}
          aria-label={`Name for ${category.name}`}
          className="min-w-0 flex-1 border border-line bg-paper rounded-lg px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ledger/40 focus:border-ledger"
        />
        {changed && (
          <button
            type="button"
            onClick={save}
            className="bg-ledger text-paper text-xs font-medium px-3 py-2 rounded-lg active:scale-95 transition"
          >
            Save
          </button>
        )}
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Remove ${category.name}`}
          className="text-xs text-rust px-2 py-2 rounded-md hover:bg-rust/10 transition"
        >
          Remove
        </button>
      </div>
      {error && <p className="text-xs text-rust mt-1">{error}</p>}
    </li>
  );
}
