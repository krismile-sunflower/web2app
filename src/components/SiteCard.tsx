import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { faviconChain, hostOf, siteInitial, THEME_COLORS, type Site } from '../types';

interface SiteCardProps {
  site: Site;
  dragging: boolean;
  onOpen: (site: Site) => void;
  /** 长按触发（400ms）；拖拽与操作菜单都从这里开始 */
  onLongPress: (site: Site, pointer: { x: number; y: number }) => void;
}

function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return THEME_COLORS[Math.abs(h) % THEME_COLORS.length];
}

export function SiteCard({ site, dragging, onOpen, onLongPress }: SiteCardProps) {
  const chain = useMemo(() => faviconChain(site), [site.icon, site.url]);
  const [iconStep, setIconStep] = useState(0);
  const timerRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  const color = site.themeColor || hashColor(site.name);
  const iconSrc = chain[iconStep];

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
      onLongPress(site, { x: clientX, y: clientY });
    }, 400);
  };

  const onPointerUp = () => {
    clearTimer();
    // 长按后的 click 不应触发打开
    if (firedRef.current) {
      const f = firedRef;
      window.setTimeout(() => (f.current = false), 400);
    }
  };

  return (
    <button
      className={`card${dragging ? ' dragging' : ''}`}
      data-site-id={site.id}
      onClick={() => {
        if (!firedRef.current) onOpen(site);
      }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={clearTimer}
      onPointerCancel={clearTimer}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="card-tile" style={{ backgroundColor: color }}>
        {iconSrc ? (
          <img
            className="card-favicon"
            src={iconSrc}
            alt=""
            loading="lazy"
            draggable={false}
            onError={() => setIconStep((s) => s + 1)}
          />
        ) : (
          <span className="card-letter">{siteInitial(site)}</span>
        )}
      </span>
      <span className="card-name">{site.name || hostOf(site.url)}</span>
    </button>
  );
}
