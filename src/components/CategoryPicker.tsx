"use client";

import { useState } from "react";
import type { LocalCategory } from "@/lib/db";
import { STARTER_CATEGORIES } from "@/lib/sync";

type Props = {
  categories: LocalCategory[];
  value: string | null;
  onChange: (id: string | null) => void;
  onCreate: (name: string) => Promise<string>;
  // Adds the starter set (Food, Transport…) as real categories
  onAddStarter?: () => Promise<void>;
  // Viewers can see categories but not create or manage them
  canEdit: boolean;
  onManage?: () => void;
  compact?: boolean;
};

// NOTE: this lives inside the add-entry <form>, so it must not contain a
// <form> of its own (nested forms are invalid) — every button is type="button"
// and Enter in the name field is handled by hand.
export default function CategoryPicker({
  categories,
  value,
  onChange,
  onCreate,
  onAddStarter,
  canEdit,
  onManage,
  compact = false,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const chip = compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm";

  async function create(name: string) {
    const clean = name.trim();
    if (!clean || busy) return;
    setBusy(true);
    const id = await onCreate(clean); // returns the existing one if the name is taken
    onChange(id);
    setDraft("");
    setAdding(false);
    setBusy(false);
  }

  async function addStarter() {
    if (!onAddStarter || busy) return;
    setBusy(true);
    await onAddStarter();
    setBusy(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-muted">Category (optional)</span>
        {canEdit && categories.length > 0 && onManage && (
          <button type="button" onClick={onManage} className="text-xs text-ledger font-medium">
            Manage
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {categories.map((c) => {
          const selected = value === c.id;
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(selected ? null : c.id)}
              className={`rounded-full border font-medium transition ${chip} ${
                selected ? "bg-ink text-paper border-ink" : "bg-white text-ink border-line"
              }`}
            >
              {c.name}
            </button>
          );
        })}

        {canEdit && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={`rounded-full border border-dashed border-ledger/50 text-ledger font-medium transition ${chip}`}
          >
            + New
          </button>
        )}
      </div>

      {canEdit && categories.length === 0 && onAddStarter && (
        <button
          type="button"
          disabled={busy}
          onClick={addStarter}
          className="mt-2 w-full text-left rounded-lg border border-dashed border-line px-3 py-2 disabled:opacity-50 active:bg-ledger-light/40 transition"
        >
          <span className="block text-sm font-medium text-ink">{busy ? "Adding…" : "Add starter categories"}</span>
          <span className="block text-xs text-muted">{STARTER_CATEGORIES.join(" · ")}</span>
        </button>
      )}

      {canEdit && adding && (
        <div className="flex gap-2 mt-2">
          <input
            autoFocus
            value={draft}
            maxLength={30}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault(); // don't submit the entry form
                create(draft);
              }
              if (e.key === "Escape") {
                setAdding(false);
                setDraft("");
              }
            }}
            placeholder="Category name"
            aria-label="New category name"
            className="min-w-0 flex-1 border border-line bg-white rounded-lg px-3 py-1.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ledger/40 focus:border-ledger"
          />
          <button
            type="button"
            onClick={() => create(draft)}
            disabled={!draft.trim() || busy}
            className="bg-ledger text-paper text-sm font-medium px-3 rounded-lg disabled:opacity-40 active:scale-95 transition"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setDraft("");
            }}
            className="text-xs text-muted px-1"
          >
            Cancel
          </button>
        </div>
      )}

      {!canEdit && categories.length === 0 && <p className="text-xs text-muted">No categories yet.</p>}
    </div>
  );
}
