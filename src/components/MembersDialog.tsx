"use client";

import { useCallback, useEffect, useState } from "react";
import type { BookRole, LocalBook } from "@/lib/db";
import { flushOutbox, forgetBookLocal, pullBooks } from "@/lib/sync";

type Member = {
  userId: string;
  email: string;
  name: string | null;
  role: BookRole;
  isMe: boolean;
};

type Confirm =
  | { kind: "remove"; userId: string }
  | { kind: "owner"; userId: string }
  | { kind: "leave" }
  | { kind: "revoke" };

type Props = {
  book: LocalBook;
  onClose: () => void;
  // Called after you leave — e.g. to step out of the book's own page
  onLeft?: () => void;
};

const ROLE_LABEL: Record<BookRole, string> = { OWNER: "Owner", EDITOR: "Editor", VIEWER: "Viewer" };

// Membership changes affect other people, so they happen live on the server
// rather than being queued offline. This wraps a request and turns a failed
// connection into a readable message instead of an exception.
async function api(url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, init);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: { error: "Couldn't reach the server. Check your connection and try again." } };
  }
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export default function MembersDialog({ book, onClose, onLeft }: Props) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);

  const [inviteRole, setInviteRole] = useState<"EDITOR" | "VIEWER">("EDITOR");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeNote, setRevokeNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api(`/api/books/${book.id}/members`);
    if (r.ok) {
      setMembers(r.data);
      setLoadError(null);
    } else {
      setLoadError(r.data.error || "Couldn't load the members.");
    }
  }, [book.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Escape closes the card, the page behind doesn't scroll under it, and we
  // keep track of whether there's a connection (these actions need one).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const goOnline = () => {
      setOnline(true);
      load();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, load]);

  const me = members?.find((m) => m.isMe);
  const myRole: BookRole | undefined = me?.role ?? book.myRole;
  const isOwner = myRole === "OWNER";
  const canInvite = myRole !== undefined && myRole !== "VIEWER";
  const blocked = !online || busy !== null;
  const label = (m: Member) => m.name || m.email;

  // Run one action: show errors in the card, refresh the list and the
  // book's counts/roles afterwards.
  async function run(key: string, request: () => ReturnType<typeof api>, fallbackError: string) {
    setBusy(key);
    setActionError(null);
    const r = await request();
    setBusy(null);
    if (!r.ok) {
      setActionError(r.data.error || fallbackError);
      await load();
      return false;
    }
    setConfirm(null);
    await Promise.all([load(), pullBooks({ fresh: true })]);
    return true;
  }

  const changeRole = (m: Member, role: "EDITOR" | "VIEWER" | "OWNER") =>
    run(
      `role:${m.userId}`,
      () =>
        api(`/api/books/${book.id}/members/${m.userId}`, {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify({ role }),
        }),
      "Couldn't change that role."
    );

  const removeMember = (m: Member) =>
    run(`remove:${m.userId}`, () => api(`/api/books/${book.id}/members/${m.userId}`, { method: "DELETE" }), "Couldn't remove them.");

  async function leave() {
    if (!me) return;
    setBusy("leave");
    setActionError(null);
    // Send anything you've added but not yet synced, before access is gone
    await flushOutbox();
    const r = await api(`/api/books/${book.id}/members/${me.userId}`, { method: "DELETE" });
    if (!r.ok) {
      setBusy(null);
      setActionError(r.data.error || "Couldn't leave the book.");
      return;
    }
    await forgetBookLocal(book.id);
    onLeft?.();
    onClose();
  }

  async function createInvite() {
    setBusy("invite");
    setActionError(null);
    setCopied(false);
    const r = await api(`/api/books/${book.id}/invites`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ role: inviteRole }),
    });
    setBusy(null);
    if (!r.ok) {
      setActionError(r.data.error || "Couldn't create the invite link.");
      return;
    }
    const link = `${window.location.origin}/invite/${r.data.token}`;
    setInviteLink(link);
    setRevokeNote(null);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link).then(() => setCopied(true)).catch(() => {});
    }
  }

  async function copyLink() {
    if (!inviteLink || !navigator.clipboard) return;
    await navigator.clipboard.writeText(inviteLink).catch(() => {});
    setCopied(true);
  }

  async function revokeLinks() {
    const ok = await run(
      "revoke",
      async () => {
        const r = await api(`/api/books/${book.id}/invites`, { method: "DELETE" });
        if (r.ok) {
          setInviteLink(null);
          setRevokeNote(
            r.data.revoked === 0
              ? "There were no active invite links."
              : `Revoked ${r.data.revoked} invite link${r.data.revoked === 1 ? "" : "s"}. Old links no longer work.`
          );
        }
        return r;
      },
      "Couldn't revoke the links."
    );
    return ok;
  }

  const linkButton = "text-xs px-3 py-1.5 rounded-md font-medium active:scale-95 transition disabled:opacity-40";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 pb-[8dvh]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="members-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm max-h-[82dvh] overflow-y-auto bg-white border border-line rounded-2xl p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 id="members-title" className="font-display text-2xl text-ink">
            Members
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 -mr-2 w-9 h-9 flex items-center justify-center text-muted hover:text-ink text-lg leading-none"
          >
            ✕
          </button>
        </div>
        <p className="text-sm text-muted mb-4">
          {members
            ? `${members.length} ${members.length === 1 ? "person has" : "people have"} access to “${book.name}”.`
            : loadError
            ? ""
            : "Loading…"}
        </p>

        {!online && (
          <p className="text-sm text-rust bg-rust/10 rounded-lg px-3 py-2 mb-3" role="status">
            You&rsquo;re offline. Members can only be viewed and changed while you&rsquo;re online.
          </p>
        )}
        {actionError && (
          <p className="text-sm text-rust bg-rust/10 rounded-lg px-3 py-2 mb-3" role="alert">
            {actionError}
          </p>
        )}
        {loadError && !members && <p className="text-sm text-rust mb-3">{loadError}</p>}

        {members && (
          <ul>
            {members.map((m) => {
              const canManage = isOwner && !m.isMe;
              const pending = confirm && "userId" in confirm && confirm.userId === m.userId ? confirm : null;
              return (
                <li key={m.userId} className="ledger-row py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-ink truncate">
                        {label(m)}
                        {m.isMe && <span className="text-muted"> (you)</span>}
                      </p>
                      {m.name && <p className="text-xs text-muted truncate">{m.email}</p>}
                    </div>

                    {canManage ? (
                      <select
                        value={m.role}
                        disabled={blocked}
                        aria-label={`Role for ${label(m)}`}
                        onChange={(e) => {
                          const next = e.target.value as BookRole;
                          if (next === "OWNER") setConfirm({ kind: "owner", userId: m.userId });
                          else changeRole(m, next);
                        }}
                        className="border border-line bg-paper rounded-lg px-2 py-1.5 text-sm text-ink disabled:opacity-50"
                      >
                        <option value="EDITOR">Editor</option>
                        <option value="VIEWER">Viewer</option>
                        <option value="OWNER">Owner…</option>
                      </select>
                    ) : (
                      <span
                        className={`text-xs px-2 py-1 rounded-md flex-shrink-0 ${
                          m.role === "OWNER" ? "bg-ledger-light text-ledger-dark font-medium" : "border border-line text-muted"
                        }`}
                      >
                        {ROLE_LABEL[m.role]}
                      </span>
                    )}
                  </div>

                  {canManage && !pending && (
                    <button
                      type="button"
                      disabled={blocked}
                      onClick={() => setConfirm({ kind: "remove", userId: m.userId })}
                      className="text-xs text-rust mt-1 disabled:opacity-40"
                    >
                      Remove from book
                    </button>
                  )}

                  {pending?.kind === "remove" && (
                    <div className="mt-2 rounded-lg bg-paper p-3">
                      <p className="text-sm text-ink mb-1">Remove {label(m)}?</p>
                      <p className="text-xs text-muted mb-3">
                        They lose access, but the entries they added stay in the book. If they still have an
                        invite link they could rejoin — revoke old links below to stop that.
                      </p>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setConfirm(null)} className={`${linkButton} flex-1 border border-line bg-white text-ink`}>
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={blocked}
                          onClick={() => removeMember(m)}
                          className={`${linkButton} flex-1 bg-rust text-paper`}
                        >
                          {busy === `remove:${m.userId}` ? "Removing…" : "Remove"}
                        </button>
                      </div>
                    </div>
                  )}

                  {pending?.kind === "owner" && (
                    <div className="mt-2 rounded-lg bg-paper p-3">
                      <p className="text-sm text-ink mb-1">Make {label(m)} the owner?</p>
                      <p className="text-xs text-muted mb-3">
                        They&rsquo;ll be able to rename or delete this book and manage its members. You&rsquo;ll
                        become an editor, and only they can undo this.
                      </p>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setConfirm(null)} className={`${linkButton} flex-1 border border-line bg-white text-ink`}>
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={blocked}
                          onClick={() => changeRole(m, "OWNER")}
                          className={`${linkButton} flex-1 bg-ink text-paper`}
                        >
                          {busy === `role:${m.userId}` ? "Handing over…" : "Make owner"}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {members && canInvite && (
          <div className="border-t border-line mt-4 pt-5">
            <p className="text-sm font-medium text-ink mb-2">Invite someone</p>
            <div role="group" aria-label="Invite as" className="flex gap-2 mb-2">
              {(["EDITOR", "VIEWER"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={inviteRole === r}
                  onClick={() => {
                    setInviteRole(r);
                    setInviteLink(null);
                  }}
                  className={`flex-1 rounded-lg border-2 px-3 py-1.5 text-sm font-medium transition ${
                    inviteRole === r ? "bg-ink text-paper border-ink" : "bg-white text-muted border-line"
                  }`}
                >
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted mb-3">
              {inviteRole === "EDITOR"
                ? "Editors can add and change entries and categories."
                : "Viewers can look at everything but can't change anything."}
            </p>
            <button
              type="button"
              disabled={blocked}
              onClick={createInvite}
              className="w-full bg-ledger text-paper px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40 active:scale-95 transition"
            >
              {busy === "invite" ? "Creating…" : "Create invite link"}
            </button>

            {inviteLink && (
              <div className="mt-3">
                <p className="font-mono text-xs text-ledger-dark bg-ledger-light rounded-md px-2 py-1.5 break-all">
                  {inviteLink}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-muted">Works for 7 days. Anyone with the link can join.</p>
                  <button type="button" onClick={copyLink} className="text-xs text-ledger font-medium">
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            )}
            {revokeNote && <p className="text-xs text-muted mt-3">{revokeNote}</p>}

            {isOwner && (
              <div className="mt-3">
                {confirm?.kind === "revoke" ? (
                  <div className="rounded-lg bg-paper p-3">
                    <p className="text-sm text-ink mb-1">Revoke every invite link?</p>
                    <p className="text-xs text-muted mb-3">
                      Links you&rsquo;ve already shared will stop working. People already in the book stay.
                    </p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setConfirm(null)} className={`${linkButton} flex-1 border border-line bg-white text-ink`}>
                        Cancel
                      </button>
                      <button type="button" disabled={blocked} onClick={revokeLinks} className={`${linkButton} flex-1 bg-rust text-paper`}>
                        {busy === "revoke" ? "Revoking…" : "Revoke all"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() => setConfirm({ kind: "revoke" })}
                    className="text-xs text-rust disabled:opacity-40"
                  >
                    Revoke all invite links
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {members && me && (
          <div className="border-t border-line mt-5 pt-5">
            {isOwner ? (
              <p className="text-xs text-muted">
                You own this book, so you can&rsquo;t leave it. To step away, make someone else the owner
                (choose &ldquo;Owner…&rdquo; next to their name) &mdash; or delete the book from its ⋯ menu.
              </p>
            ) : confirm?.kind === "leave" ? (
              <div className="rounded-lg bg-paper p-3">
                <p className="text-sm text-ink mb-1">Leave &ldquo;{book.name}&rdquo;?</p>
                <p className="text-xs text-muted mb-3">
                  You&rsquo;ll lose access to this book and its entries. Anything you added that hasn&rsquo;t
                  synced yet is sent first. You&rsquo;d need a new invite to come back.
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setConfirm(null)} className={`${linkButton} flex-1 border border-line bg-white text-ink`}>
                    Cancel
                  </button>
                  <button type="button" disabled={blocked} onClick={leave} className={`${linkButton} flex-1 bg-rust text-paper`}>
                    {busy === "leave" ? "Leaving…" : "Leave book"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={blocked}
                onClick={() => setConfirm({ kind: "leave" })}
                className="w-full border border-rust/40 text-rust px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-rust/10 active:scale-95 transition disabled:opacity-40"
              >
                Leave this book…
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full mt-5 border border-line bg-white text-ink px-4 py-2.5 rounded-lg text-sm font-medium active:scale-95 transition"
        >
          Done
        </button>
      </div>
    </div>
  );
}
