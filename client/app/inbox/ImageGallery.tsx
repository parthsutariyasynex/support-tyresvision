'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isMediaPlaceholder, mediaUrl } from '@/lib/media';
import { formatDateTime } from '@/lib/time';
import { ZoomableImage } from './ZoomableImage';

// The open chat's photos, oldest first, for the full-size viewer: a click on one photo shows it with every other
// photo of the chat in a strip below, and ‹ › (or the ← → keys) go to the previous and next one, without closing
// the viewer. Provided by the chat (page.tsx) from the messages loaded on screen.
export type GalleryItem = { id: string; caption: string; from: string; at: string };
export const ImageGalleryContext = createContext<GalleryItem[] | null>(null);

// The chat's image messages (not deleted, with a file) as gallery items, in the order they were sent
export function galleryItems(
  messages: { id: string; type: string; body: string; createdAt: string; deletedAt?: string | null; mediaMime?: string | null; direction: string; senderName: string | null }[],
  customerName: string,
): GalleryItem[] {
  return messages
    .filter((m) => m.type === 'image' && !m.deletedAt && m.mediaMime)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
    .map((m) => ({
      id: m.id,
      caption: m.body && !isMediaPlaceholder(m.body) ? m.body : '',
      from: m.direction === 'in' ? customerName : (m.senderName ?? 'You'),
      at: m.createdAt,
    }));
}

// A photo's address (loaded with the sign-in token, kept for the session), or an error
function useMediaUrl(id: string | null) {
  const [state, setState] = useState<{ id: string; url?: string; error?: string } | null>(null);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    mediaUrl(id)
      .then((url) => !cancelled && setState({ id, url }))
      .catch((e) => !cancelled && setState({ id, error: (e as Error).message }));
    return () => {
      cancelled = true;
    };
  }, [id]);
  return state?.id === id ? state : null;
}

// Full-size viewer, opened on startId. Without the chat's photo list (or when this photo isn't in it) it shows just
// that photo, as before.
export function ImageViewer({ startId, onClose }: { startId: string; onClose: () => void }) {
  const gallery = useContext(ImageGalleryContext);
  const items: GalleryItem[] = gallery?.some((g) => g.id === startId) ? gallery : [{ id: startId, caption: '', from: '', at: '' }];
  const [currentId, setCurrentId] = useState(startId);
  const index = Math.max(0, items.findIndex((g) => g.id === currentId));
  const item = items[index];
  const many = items.length > 1;
  const media = useMediaUrl(item.id);
  const go = (step: number) => setCurrentId(items[Math.min(items.length - 1, Math.max(0, index + step))].id);
  const stripRef = useRef<HTMLDivElement>(null);

  // ← → previous / next, Esc closes (only this viewer: the chat behind stays open)
  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goRef.current(-1);
      else if (e.key === 'ArrowRight') goRef.current(1);
      else if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // The current photo's thumbnail stays in view as you move through them
  useEffect(() => {
    stripRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(item.id)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [item.id]);

  const arrow = 'absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[rgb(255_255_255/0.15)] text-2xl text-[#fff] shadow-lg transition hover:bg-[rgb(255_255_255/0.25)] disabled:pointer-events-none disabled:opacity-0';
  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-[rgb(0_0_0/0.9)]" role="dialog" aria-modal="true" aria-label={many ? `Photo ${index + 1} of ${items.length}` : 'Image'}>
      {/* Top: which photo, who sent it and when; close */}
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-3 text-[#fff]">
        <div className="min-w-0 text-xs">
          {many && <span className="mr-2 font-bold tabular-nums">{index + 1} / {items.length}</span>}
          {item.from && <span className="font-semibold">{item.from}</span>}
          {item.at && <span className="ml-2 opacity-75">{formatDateTime(item.at, 'en-US')}</span>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded-full bg-[rgb(255_255_255/0.15)] px-3 py-1.5 text-sm shadow-lg hover:bg-[rgb(255_255_255/0.25)]">
          ✕
        </button>
      </div>

      {/* The photo (zoom with the wheel, a pinch or a double-click; a click beside it closes), ‹ › at the sides */}
      <div className="relative min-h-0 flex-1 px-16 pb-2">
        {media?.url ? (
          <ZoomableImage key={item.id} src={media.url} alt={item.caption || 'Image, full size'} onBackdropClick={onClose} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[rgb(255_255_255/0.8)]" onClick={onClose}>
            {media?.error ? `📷 ${media.error}` : 'Loading…'}
          </div>
        )}
        {many && (
          <>
            <button type="button" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous photo" title="Previous (←)" className={`${arrow} left-3`}>
              ‹
            </button>
            <button type="button" onClick={() => go(1)} disabled={index === items.length - 1} aria-label="Next photo" title="Next (→)" className={`${arrow} right-3`}>
              ›
            </button>
          </>
        )}
      </div>

      {item.caption && <p className="mx-auto max-w-2xl shrink-0 px-5 pb-2 text-center text-[13px] text-[#fff]">{item.caption}</p>}

      {/* Every photo in this chat: click one to show it */}
      {many && (
        <div ref={stripRef} className="flex shrink-0 gap-2 overflow-x-auto px-5 pb-4 pt-1" aria-label="Photos in this chat">
          <div className="mx-auto flex gap-2">
            {items.map((g, i) => (
              <button
                key={g.id}
                type="button"
                data-id={g.id}
                onClick={() => setCurrentId(g.id)}
                aria-label={`Photo ${i + 1}`}
                aria-current={g.id === item.id ? 'true' : undefined}
                className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 bg-[rgb(255_255_255/0.1)] transition ${g.id === item.id ? 'border-[#fff]' : 'border-transparent opacity-60 hover:opacity-100'}`}
              >
                <GalleryThumb id={g.id} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

// A thumbnail in the strip, loaded only when it scrolls into view (a chat can have many photos)
function GalleryThumb({ id }: { id: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);
  const media = useMediaUrl(visible ? id : null);
  return (
    <span ref={ref} className="block h-full w-full">
      {media?.url ? <img src={media.url} alt="" className="h-full w-full object-cover" /> : <span className="block h-full w-full animate-pulse bg-[rgb(255_255_255/0.1)]" />}
    </span>
  );
}
