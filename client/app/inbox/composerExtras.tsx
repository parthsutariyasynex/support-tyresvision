'use client';

import type { EmojiStyle, SkinTonePickerLocation, SuggestionMode, Theme } from 'emoji-picker-react';
import dynamic from 'next/dynamic';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CAPTION_MAX, checkFile, documentLabel, downloadFile, formatSize, mediaUrl } from '@/lib/media';
import { overLimit, tooLongText } from '@/lib/textLimits';
import { ZoomableImage } from './ZoomableImage';

// The full Unicode emoji set (emoji-picker-react): search, categories, skin tones and recently used (kept in this
// browser by the picker). Its data ships with the package, so nothing is fetched from another site; and it's only
// loaded the first time a picker opens, not with the page.
const Picker = dynamic(() => import('emoji-picker-react'), {
  ssr: false,
  loading: () => <div className="h-[400px] w-[340px] max-w-[calc(100vw-2rem)] animate-pulse rounded-xl bg-surface-strong" aria-busy="true" aria-label="Loading emojis" />,
});

// The picker in the app's own colours (its CSS variables, set on the picker itself so they win over its defaults)
const PICKER_THEME = {
  '--epr-bg-color': 'var(--color-surface)',
  '--epr-text-color': 'var(--color-ink)',
  '--epr-picker-border-color': 'var(--color-line)',
  '--epr-highlight-color': 'var(--color-primary)',
  '--epr-category-icon-active-color': 'var(--color-primary)',
  '--epr-hover-bg-color': 'var(--color-surface-strong)',
  '--epr-focus-bg-color': 'var(--color-surface-strong)',
  '--epr-search-input-bg-color': 'var(--color-surface-muted)',
  '--epr-search-input-bg-color-active': 'var(--color-surface)',
  '--epr-search-border-color': 'var(--color-primary)',
  '--epr-category-label-bg-color': 'var(--color-surface)',
  '--epr-picker-border-radius': '12px',
} as React.CSSProperties;

const PICKER_WIDTH = 340;
const PICKER_HEIGHT = 400;

// Emoji picker (message box, reactions, automation replies). Drawn on top of the page (a portal), so no scrolling
// panel or header can cut it: above where it's opened when there's room, otherwise below, always on screen.
// Esc or a click outside closes it.
export function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLSpanElement>(null); // where it opens from: the spot the picker used to take
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const box = anchorRef.current?.parentElement?.getBoundingClientRect();
      if (!box) return;
      const w = Math.min(PICKER_WIDTH, window.innerWidth - 32);
      const room = box.top - 8;
      const top = room >= PICKER_HEIGHT || box.top > window.innerHeight - box.bottom ? Math.max(8, box.top - PICKER_HEIGHT - 8) : Math.min(box.bottom + 8, window.innerHeight - PICKER_HEIGHT - 8);
      const left = Math.min(Math.max(8, box.left), window.innerWidth - w - 8);
      setPos({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true); // follow what it opened from
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, []);

  useEffect(() => {
    const onPointer = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!ref.current?.contains(t) && !t.closest('[data-emoji-toggle]')) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <>
      <span ref={anchorRef} className="hidden" aria-hidden="true" />
      {createPortal(
        <div
          ref={ref}
          role="dialog"
          aria-label="Emojis"
          data-emoji-picker
          className="fixed z-[70] rounded-xl shadow-xl"
          style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
        >
          <Picker
            onEmojiClick={(e) => onPick(e.emoji)}
            emojiStyle={'native' as EmojiStyle}
            theme={'light' as Theme}
            suggestedEmojisMode={'recent' as SuggestionMode}
            skinTonePickerLocation={'SEARCH' as SkinTonePickerLocation}
            searchPlaceholder="Search emoji"
            autoFocusSearch
            lazyLoadEmojis
            previewConfig={{ showPreview: false }}
            width={`min(${PICKER_WIDTH}px, calc(100vw - 2rem))`}
            height={PICKER_HEIGHT}
            style={PICKER_THEME}
          />
        </div>,
        document.body,
      )}
    </>
  );
}

// Up to this many files are chosen, dropped or pasted at once; each is sent as its own WhatsApp message (WhatsApp
// has no albums: the WhatsApp app sends several photos one after another, too)
export const SEND_FILES_MAX = 20;

// Preview of the chosen files (an image, a video, or a card for a document), with an optional caption on each,
// then Send. Several files: a strip of thumbnails to switch between them, remove one, or add more; Send sends them
// one after another in that order. Each one sent leaves the list (onSent); if one fails, sending stops there and the
// rest stay, so Send again carries on from the failed one.
export function FileSendDialog({
  files,
  onSend,
  onSent,
  onRemove,
  onAddMore,
  notice,
  onClose,
}: {
  files: File[];
  onSend: (file: File, caption: string) => Promise<void>;
  onSent: (file: File) => void;
  onRemove: (file: File) => void;
  onAddMore?: () => void;
  // Shown at the top as soon as files are chosen: why some were left out (e.g. more than SEND_FILES_MAX)
  notice?: string;
  onClose: () => void;
}) {
  const [captions, setCaptions] = useState(() => new Map<File, string>());
  const [selected, setSelected] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const file = selected && files.includes(selected) ? selected : files[0];
  const caption = (file && captions.get(file)) ?? '';
  const many = files.length > 1;
  const kinds = files.map((f) => {
    const r = checkFile(f, { video: true });
    return 'kind' in r ? r.kind : 'document';
  });
  const kind = kinds[files.indexOf(file)] ?? 'document';
  const noun = (k: string) => (k === 'image' ? 'image' : k === 'video' ? 'video' : 'document');
  const title = many ? `Send ${files.length} ${kinds.every((k) => k === kinds[0]) ? `${noun(kinds[0])}s` : 'files'}` : `Send ${noun(kind)}`;
  const url = useObjectUrl(kind === 'document' ? null : file);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const setCaption = (text: string) =>
    setCaptions((m) => {
      const next = new Map(m);
      next.set(file, text);
      return next;
    });

  async function send() {
    // A caption over WhatsApp's limit: kept as typed, nothing sent until it's shortened (that file is shown)
    const tooLong = files.find((f) => overLimit(captions.get(f) ?? '', CAPTION_MAX));
    if (tooLong) {
      setSelected(tooLong);
      return setError(tooLongText(captions.get(tooLong) ?? '', CAPTION_MAX, 'WhatsApp allows a caption of up to'));
    }
    setBusy(true);
    setError('');
    const queue = [...files];
    for (let i = 0; i < queue.length; i++) {
      const f = queue[i];
      setProgress({ done: i, total: queue.length });
      try {
        await onSend(f, captions.get(f) ?? '');
        onSent(f);
      } catch (e) {
        setSelected(f);
        const left = queue.length - i;
        setError(`${queue.length > 1 ? `${f.name}: ` : ''}${(e as Error).message}${left > 1 ? ` (${left} not sent yet: press Send to try again)` : ''}`);
        setProgress(null);
        setBusy(false);
        return;
      }
    }
  }

  if (typeof document === 'undefined' || !file) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div role="dialog" aria-label={title} className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line-soft px-5 py-3">
          <h2 className="shrink-0 text-sm font-bold text-ink">{title}</h2>
          <span className="truncate pl-3 text-[11px] text-muted">
            {file.name} · {formatSize(file.size)}
          </span>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-surface-muted p-4">
          {kind === 'image' ? (
            url && <img src={url} alt="Image to send" className="max-h-[50vh] max-w-full rounded-lg object-contain shadow-xs" />
          ) : kind === 'video' ? (
            url && <video key={url} src={url} controls preload="metadata" className="max-h-[50vh] max-w-full rounded-lg bg-ink shadow-xs" aria-label="Video to send" />
          ) : (
            <div className="flex w-full max-w-sm items-center gap-3 rounded-xl bg-surface px-4 py-3.5 shadow-xs">
              <DocIcon label={documentLabel(file.type, file.name)} />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-ink" title={file.name}>
                  {file.name}
                </p>
                <p className="text-[11px] text-muted">
                  {documentLabel(file.type, file.name)} · {formatSize(file.size)}
                </p>
              </div>
            </div>
          )}
        </div>
        {/* The chosen files: click one to see it and write its caption; ✕ leaves it out; + adds more */}
        {(many || onAddMore) && (
          <div className="border-t border-line-soft px-4 pb-2.5 pt-2">
          {/* How many of the most that can go at once */}
          <p className="mb-2 flex items-center justify-between text-[11px] text-muted">
            <span>Up to {SEND_FILES_MAX} files at a time</span>
            <span className={`font-semibold tabular-nums ${files.length >= SEND_FILES_MAX ? 'text-warning' : ''}`}>
              {files.length} / {SEND_FILES_MAX}
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {files.map((f, i) => (
              <div key={`${f.name}-${f.size}-${f.lastModified}-${i}`} className="group relative shrink-0">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setSelected(f)}
                  title={f.name}
                  aria-label={`Show ${f.name}`}
                  aria-pressed={f === file}
                  className={`block h-12 w-12 overflow-hidden rounded-lg border-2 bg-surface-muted ${f === file ? 'border-primary' : 'border-transparent hover:border-line-strong'}`}
                >
                  <Thumb file={f} kind={kinds[i]} />
                </button>
                {many && !busy && (
                  <button
                    type="button"
                    onClick={() => onRemove(f)}
                    title="Leave this one out"
                    aria-label={`Remove ${f.name}`}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[10px] text-on-primary opacity-0 shadow transition group-hover:opacity-100 focus:opacity-100"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {onAddMore && files.length < SEND_FILES_MAX && (
              <button
                type="button"
                disabled={busy}
                onClick={onAddMore}
                title={`Add more (up to ${SEND_FILES_MAX})`}
                aria-label="Add more files"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-line-strong text-lg text-muted hover:border-primary hover:text-primary disabled:opacity-50"
              >
                +
              </button>
            )}
          </div>
          </div>
        )}
        {notice && (
          <p role="status" className="mx-4 mt-1 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
            {notice}
          </p>
        )}
        <div className="border-t border-line-soft p-4">
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (!busy) send();
              }
            }}
            rows={2}
            autoFocus
            disabled={busy}
            placeholder={many ? 'Add a caption to this one (optional)' : 'Add a caption (optional)'}
            aria-label="Caption"
            className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink outline-hidden placeholder:text-faint focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60"
          />
          {error && <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}
          {!error && overLimit(caption, CAPTION_MAX) && (
            <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger" role="status">
              {tooLongText(caption, CAPTION_MAX, 'WhatsApp allows a caption of up to')}
            </p>
          )}
          <div className="mt-3 flex items-center justify-end gap-2">
            <button type="button" disabled={busy} onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs text-body-soft hover:bg-surface-muted disabled:opacity-50">
              Cancel
            </button>
            <button type="button" disabled={busy} onClick={send} className="rounded-lg bg-primary px-5 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-60">
              {busy ? (progress && progress.total > 1 ? `Sending ${progress.done + 1} of ${progress.total}…` : 'Sending…') : many ? `Send ${files.length}` : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// A temporary address for showing a chosen file (released when it changes or leaves)
function useObjectUrl(file: File | null | undefined) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!file) return setUrl('');
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

// A thumbnail in the file strip: the picture, a ▶ for a video, the document's type for a document
function Thumb({ file, kind }: { file: File; kind: string }) {
  const url = useObjectUrl(kind === 'image' ? file : null);
  if (kind === 'image') return url ? <img src={url} alt="" className="h-full w-full object-cover" /> : null;
  if (kind === 'video') return <span className="flex h-full w-full items-center justify-center bg-ink/80 text-sm text-on-primary">▶</span>;
  return <span className="flex h-full w-full items-center justify-center px-0.5 text-center text-[9px] font-bold uppercase text-muted">{documentLabel(file.type, file.name).split(' ')[0]}</span>;
}

// An image message in a chat bubble: loaded with the sign-in token; click opens it full size
export function ChatImage({ messageId }: { messageId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [full, setFull] = useState(false);
  useEffect(() => {
    let cancelled = false;
    mediaUrl(messageId)
      .then((u) => !cancelled && setSrc(u))
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [messageId]);

  if (error) return <p className="py-1 text-[12px] italic text-muted">📷 {error}</p>;
  if (!src) return <div className="h-40 w-56 animate-pulse rounded-lg bg-surface-strong" aria-label="Loading image" />;
  return (
    <>
      <button type="button" onClick={() => setFull(true)} title="View full size" className="block overflow-hidden rounded-lg">
        <img src={src} alt="Image" className="max-h-64 max-w-[260px] object-cover" />
      </button>
      {full &&
        createPortal(
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/80 p-6" role="dialog" aria-label="Image">
            {/* Zoom with the wheel, a pinch or a double-click/tap; a click beside the picture closes */}
            <ZoomableImage src={src} alt="Image, full size" onBackdropClick={() => setFull(false)} />
            <button type="button" onClick={() => setFull(false)} aria-label="Close" className="absolute right-5 top-5 z-10 rounded-full bg-ink/70 px-3 py-1.5 text-sm text-on-primary shadow-lg hover:bg-ink/90">
              ✕
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}

// File-type badge for documents (PDF red, Word blue, Excel green, PowerPoint orange, text grey)
const DOC_COLOURS: Record<string, string> = { PDF: '#dc2626', DOC: '#2563eb', DOCX: '#2563eb', XLS: '#16a34a', XLSX: '#16a34a', PPT: '#ea580c', PPTX: '#ea580c' };
export function DocIcon({ label }: { label: string }) {
  return (
    <span className="relative flex h-11 w-9 shrink-0 items-end justify-center rounded-md border border-line bg-surface pb-1" aria-hidden="true">
      <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-bl-sm border-b border-l border-line bg-surface-muted" />
      <span className="rounded px-1 text-[8px] font-bold text-on-primary" style={{ backgroundColor: DOC_COLOURS[label] ?? '#64748b' }}>
        {label.slice(0, 4)}
      </span>
    </span>
  );
}

// A document message in a chat bubble: name, type and size; click downloads it under its own name
export function DocumentCard({ messageId, name, mime, size }: { messageId: string; name: string; mime: string | null | undefined; size: number | null | undefined }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const label = documentLabel(mime, name);
  return (
    <div className="w-64 max-w-full">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await downloadFile(messageId, name);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
        title={`Download ${name}`}
        className="flex w-full items-center gap-3 rounded-lg bg-surface/70 px-3 py-2.5 text-left transition hover:bg-surface"
      >
        <DocIcon label={label} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-ink">{name}</span>
          <span className="block text-[11px] text-muted">
            {label}
            {size ? ` · ${formatSize(size)}` : ''}
          </span>
        </span>
        <svg className="h-4 w-4 shrink-0 text-body-soft" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {busy ? <circle cx="12" cy="12" r="8" strokeDasharray="12 40" /> : <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />}
        </svg>
      </button>
      {error && <p className="mt-1 text-[11px] text-danger">{error}</p>}
    </div>
  );
}

// A video or audio/voice message in a chat bubble: loaded with the sign-in token, played in place
export function ChatPlayer({ messageId, kind }: { messageId: string; kind: 'video' | 'audio' }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    mediaUrl(messageId)
      .then((u) => !cancelled && setSrc(u))
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [messageId]);
  if (error) return <p className="py-1 text-[12px] italic text-muted">{kind === 'video' ? '🎥' : '🎤'} {error}</p>;
  if (!src) return <div className={`animate-pulse rounded-lg bg-surface-strong ${kind === 'video' ? 'h-40 w-56' : 'h-10 w-60'}`} aria-label={`Loading ${kind}`} />;
  return kind === 'video' ? (
    <video src={src} controls preload="metadata" className="max-h-64 max-w-[260px] rounded-lg bg-ink" aria-label="Video" />
  ) : (
    <audio src={src} controls preload="metadata" className="w-60 max-w-full" aria-label="Audio" />
  );
}

// Full-screen view of any file from the Media tab: picture, video or audio player; documents download
export function MediaViewer({ file, onClose }: { file: { id: string; type: string; mediaName?: string | null; createdAt?: string }; onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    mediaUrl(file.id)
      .then((u) => !cancelled && setSrc(u))
      .catch((e) => !cancelled && setError((e as Error).message));
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      document.removeEventListener('keydown', onKey);
    };
  }, [file.id, onClose]);
  if (typeof document === 'undefined') return null;
  const kind = file.type === 'image' || file.type === 'sticker' ? 'image' : file.type === 'video' ? 'video' : file.type === 'audio' || file.type === 'voice' ? 'audio' : 'other';
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/85 p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-label="File viewer">
      <button type="button" onClick={onClose} aria-label="Close" className="absolute right-5 top-5 z-10 rounded-full bg-ink/70 px-3 py-1.5 text-sm text-on-primary shadow-lg hover:bg-ink/90">
        ✕
      </button>
      {error ? (
        <p className="rounded-lg bg-surface px-4 py-3 text-sm text-danger">{error}</p>
      ) : !src ? (
        <p className="text-sm text-on-primary/80">Loading…</p>
      ) : kind === 'image' ? (
        <ZoomableImage src={src} alt={file.mediaName ?? 'Image'} onBackdropClick={onClose} />
      ) : kind === 'video' ? (
        <video src={src} controls autoPlay className="max-h-full max-w-full rounded-lg bg-ink" aria-label="Video" />
      ) : kind === 'audio' ? (
        <div className="rounded-2xl bg-surface p-6">
          <audio src={src} controls autoPlay className="w-80" aria-label="Audio" />
        </div>
      ) : (
        <div className="rounded-2xl bg-surface p-6 text-center">
          <p className="text-sm font-semibold text-ink">{file.mediaName ?? 'File'}</p>
          <a href={src} download={file.mediaName ?? 'file'} className="mt-3 inline-block rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary">
            Download
          </a>
        </div>
      )}
    </div>,
    document.body,
  );
}
