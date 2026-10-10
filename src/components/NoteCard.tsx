import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { TextNote } from '../types';

interface NoteCardProps {
  note: TextNote;
  onOpen: (note: TextNote) => void;
  /** 长按触发（400ms），与网页卡片一致：移动超过阈值算滚动，否则弹操作菜单 */
  onLongPress: (note: TextNote, pointer: { x: number; y: number }) => void;
}

/** 相对时间：文本是长期存放的，用户靠它认出「哪一条是最近存的」 */
function relativeTime(ts: number): string {
  const minutes = Math.floor((Date.now() - ts) / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function NoteCard({ note, onOpen, onLongPress }: NoteCardProps) {
  const timerRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    firedRef.current = false;
    const { clientX, clientY } = e;
    timerRef.current = window.setTimeout(() => {
      firedRef.current = true;
      navigator.vibrate?.(8);
      onLongPress(note, { x: clientX, y: clientY });
    }, 400);
  };

  const onPointerUp = () => {
    clearTimer();
    // 长按后的 click 不应再触发「打开」
    if (firedRef.current) {
      const f = firedRef;
      window.setTimeout(() => (f.current = false), 400);
    }
  };

  return (
    <button
      className="note-card"
      data-note-id={note.id}
      onClick={() => {
        if (!firedRef.current) onOpen(note);
      }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={clearTimer}
      onPointerCancel={clearTimer}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="note-body">{note.body}</span>
      <span className="note-meta">{relativeTime(note.createdAt)}</span>
    </button>
  );
}
