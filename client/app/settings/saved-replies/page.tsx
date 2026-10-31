'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchPermissions } from '@/lib/labels';
import { type QuickReply, type SavedReply, canManageQuickReplies, createQuickReply, deleteQuickReply, fetchSavedReplies, updateQuickReply } from '@/lib/quickReplies';
import { formatDateTime } from '@/lib/time';
import { showToast } from '@/lib/toasts';
import { AppShell } from '../../AppShell';
import { inputClass } from '../../AuthShell';
import { ConfirmDialog } from '../../ConfirmDialog';
import { SettingsShell } from '../SettingsShell';
import { TableSkeleton } from '../Skeleton';

// Settings → Saved replies: this workspace's quick replies (type / in a chat to use one). Searchable here.
// Owners, admins and supervisors can also create, edit and delete them (the server checks the same).
export default function SavedRepliesPage() {
  return (
    <AppShell>
      {(me) => (
        <SettingsShell me={me} section="Inbox settings" title="Saved replies">
          <SavedReplies />
        </SettingsShell>
      )}
    </AppShell>
  );
}

function SavedReplies() {
  const [search, setSearch] = useState('');
  const [replies, setReplies] = useState<SavedReply[] | null>(null);
  const [error, setError] = useState('');
  const [canManage, setCanManage] = useState(false);
  const [editor, setEditor] = useState<{ reply: QuickReply | null } | null>(null);
  const [deleting, setDeleting] = useState<QuickReply | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    (term: string) =>
      fetchSavedReplies(term.trim())
        .then((r) => {
          setReplies(r);
          setError('');
        })
        .catch((e) => setError((e as Error).message)),
    [],
  );
  useEffect(() => {
    const t = setTimeout(() => load(search), 250);
    return () => clearTimeout(t);
  }, [search, load]);
  useEffect(() => {
    fetchPermissions()
      .then((p) => setCanManage(canManageQuickReplies(p.role)))
      .catch(() => {});
  }, []);

  async function remove(reply: QuickReply) {
    setBusy(true);
    setError('');
    try {
      await deleteQuickReply(reply.id);
      showToast(`saved-replies:${Date.now()}`, '', `Saved reply /${reply.shortcut} deleted.`, 'Saved replies');
      await load(search);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  }

  const iconButton = 'flex h-8 w-8 items-center justify-center rounded-lg text-body-soft transition hover:bg-surface-muted hover:text-ink';
  return (
    <div className="max-w-4xl">
      <p className="text-xs text-muted">
        Type <span className="rounded bg-surface-strong px-1 font-mono">/</span> in a chat's message box to insert one of these.
        {!canManage && ' Creating, editing and deleting saved replies is for owners, admins and supervisors.'}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by shortcut, text or category" aria-label="Search saved replies" className={`${inputClass} max-w-md`} />
        {canManage && (
          <button
            type="button"
            onClick={() => setEditor({ reply: null })}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-[13px] font-semibold text-on-primary transition hover:bg-primary-hover"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add Reply
          </button>
        )}
      </div>
      {error && <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}
      {replies === null ? (
        <TableSkeleton rows={4} />
      ) : replies.length === 0 ? (
        <p className="mt-6 text-sm text-muted">{search.trim() ? `No saved reply matches “${search.trim()}”.` : 'No saved replies yet.'}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line-soft rounded-xl border border-line bg-surface">
          {replies.map((r) => (
            <li key={r.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[13px] font-semibold text-primary">/{r.shortcut}</span>
                  {r.category && <span className="rounded-full bg-surface-strong px-2 py-0.5 text-[10px] font-semibold text-body-soft">{r.category.replace(/_/g, ' ')}</span>}
                </div>
                {r.description && <p className="mt-1 whitespace-pre-wrap text-[13px] text-body">{r.description}</p>}
                <AuditLine reply={r} />
              </div>
              {canManage && (
                <span className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => setEditor({ reply: r })} aria-label={`Edit /${r.shortcut}`} title="Edit" className={iconButton}>
                    <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z" />
                    </svg>
                  </button>
                  <button type="button" onClick={() => setDeleting(r)} aria-label={`Delete /${r.shortcut}`} title="Delete" className={`${iconButton} hover:text-danger`}>
                    <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
                    </svg>
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {replies && replies.length >= 100 && <p className="mt-2 text-[11px] text-faint">Showing the first 100. Search to find others.</p>}

      {editor && (
        <ReplyEditor
          reply={editor.reply}
          onClose={() => setEditor(null)}
          onSaved={(message) => {
            setEditor(null);
            load(search);
            showToast(`saved-replies:${Date.now()}`, '', message, 'Saved replies');
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete the saved reply /${deleting.shortcut}?`}
          body="It will no longer be offered when typing / in a chat."
          yes="Delete"
          no="Cancel"
          danger
          busy={busy}
          onYes={() => remove(deleting)}
          onNo={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

// "Added by Priya · 10 Oct 2026, 14:16 · Edited by Ravi · 12 Oct 2026, 09:05" (imported replies show only dates)
function AuditLine({ reply }: { reply: SavedReply }) {
  const parts: string[] = [];
  if (reply.createdAt) parts.push(`Added${reply.createdByName ? ` by ${reply.createdByName}` : ''} · ${formatDateTime(reply.createdAt)}`);
  // Only when edited after it was added (a fresh reply has the same time for both)
  const edited = reply.updatedAt && (!reply.createdAt || new Date(reply.updatedAt).getTime() - new Date(reply.createdAt).getTime() > 1000);
  if (edited) parts.push(`Edited${reply.updatedByName ? ` by ${reply.updatedByName}` : ''} · ${formatDateTime(reply.updatedAt!)}`);
  if (!parts.length) return null;
  return <p className="mt-1.5 text-[11px] text-faint">{parts.join('  ·  ')}</p>;
}

// Create or edit: shortcut, message text and an optional category
function ReplyEditor({ reply, onClose, onSaved }: { reply: QuickReply | null; onClose: () => void; onSaved: (message: string) => void }) {
  const [shortcut, setShortcut] = useState(reply?.shortcut ?? '');
  const [description, setDescription] = useState(reply?.description ?? '');
  const [category, setCategory] = useState(reply?.category?.replace(/_/g, ' ') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const s = shortcut.trim().replace(/^\/+/, '');
    const d = description.trim();
    if (!s) return setError('Enter a shortcut');
    if (/\s/.test(s)) return setError('The shortcut cannot contain spaces');
    if (!d) return setError('Enter the message text');
    setBusy(true);
    setError('');
    try {
      const input = { shortcut: s, description: d, category: category.trim() || null };
      if (reply) await updateQuickReply(reply.id, input);
      else await createQuickReply(input);
      onSaved(reply ? `Saved reply /${s} updated.` : `Saved reply /${s} created.`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const fieldLabel = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form role="dialog" aria-modal="true" aria-labelledby="reply-editor-title" onSubmit={save} className="w-full max-w-lg rounded-2xl bg-surface p-7 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 id="reply-editor-title" className="text-lg font-bold text-ink">
            {reply ? 'Edit saved reply' : 'Add saved reply'}
          </h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-lg text-body-soft hover:bg-surface-muted">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <label htmlFor="reply-shortcut" className={`mt-5 ${fieldLabel}`}>
          Shortcut
        </label>
        <div className="flex items-center gap-1">
          <span className="font-mono text-[15px] font-semibold text-primary">/</span>
          <input id="reply-shortcut" autoFocus value={shortcut} onChange={(e) => setShortcut(e.target.value)} maxLength={50} placeholder="e.g. hours" className={inputClass} />
        </div>
        <label htmlFor="reply-text" className={`mt-4 ${fieldLabel}`}>
          Message
        </label>
        <textarea id="reply-text" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4096} rows={6} placeholder="The text inserted into the message box" className={`${inputClass} resize-y`} />
        <p className="mt-1 text-right text-[11px] text-faint">{description.length}/4096</p>
        <label htmlFor="reply-category" className={`mt-2 ${fieldLabel}`}>
          Category <span className="normal-case font-normal text-faint">(optional)</span>
        </label>
        <input id="reply-category" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={50} placeholder="e.g. car tyres" className={inputClass} />
        {error && <p className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}
        <div className="mt-7 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg px-4 py-2 text-[13px] text-body-soft hover:bg-surface-muted">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="rounded-lg bg-primary px-6 py-2 text-[13px] font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-60">
            {busy ? 'Saving…' : reply ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}
