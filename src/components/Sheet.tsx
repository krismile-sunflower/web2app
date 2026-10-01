import { useEffect, useState, type ReactNode } from 'react';

/** 打开保持挂载、关闭延迟卸载，让退场动画播完 */
export function useDelayedUnmount(open: boolean, ms = 320): boolean {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const t = window.setTimeout(() => setMounted(false), ms);
    return () => window.clearTimeout(t);
  }, [open, ms]);
  return mounted;
}

interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Sheet({ open, title, onClose, children }: SheetProps) {
  const mounted = useDelayedUnmount(open);
  if (!mounted) return null;
  return (
    <div className={`sheet-layer${open ? ' open' : ''}`}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label={title}>
        <div className="sheet-grabber" />
        <div className="sheet-head">
          <span className="sheet-title">{title}</span>
          <button className="icon-btn sheet-close" onClick={onClose} aria-label="关闭">
            <CloseGlyph />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

function CloseGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
