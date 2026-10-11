import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { faviconChain, hashColor, hostOf, siteInitial, type Site } from '../types';

interface SiteCardProps {
  site: Site;
  dragging: boolean;
  /** tile = 分组里的方形磁贴；row = 置顶区的横排行卡 */
  variant?: 'tile' | 'row';
  onOpen: (site: Site) => void;
  /** 长按触发（400ms）；拖拽与操作菜单都从这里开始 */
  onLongPress: (site: Site, pointer: { x: number; y: number }) => void;
}

export function SiteCard({ site, dragging, variant = 'tile', onOpen, onLongPress }: SiteCardProps) {
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

  // 渐变与同色投影都由 CSS 从 --tile 派生，这里只给基色
  const tileStyle = { '--tile': color } as CSSProperties;

  const tile = (
    <span className="card-tile" style={tileStyle}>
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
  );

  const handlers = {
    onClick: () => {
      if (!firedRef.current) onOpen(site);
    },
    onPointerDown,
    onPointerUp,
    onPointerLeave: clearTimer,
    onPointerCancel: clearTimer,
    onContextMenu: (e: ReactMouseEvent) => e.preventDefault(),
  };

  if (variant === 'row') {
    return (
      <button className={`card-row${dragging ? ' dragging' : ''}`} data-site-id={site.id} {...handlers}>
        {tile}
        <span className="card-row-text">
          <span className="card-row-name">{site.name || hostOf(site.url)}</span>
          <span className="card-row-host">{hostOf(site.url)}</span>
        </span>
      </button>
    );
  }

  return (
    <button className={`card${dragging ? ' dragging' : ''}`} data-site-id={site.id} {...handlers}>
      {tile}
      <span className="card-name">{site.name || hostOf(site.url)}</span>
    </button>
  );
}
