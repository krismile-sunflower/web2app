import { useEffect, useRef, useState } from 'react';
import { ActionSheet, ConfirmDialog, type ActionItem } from './components/ActionSheet';
import { GearIcon, PlusIcon, SearchIcon } from './components/icons';
import { SiteCard } from './components/SiteCard';
import { SiteEditor } from './components/SiteEditor';
import { SettingsSheet } from './components/SettingsSheet';
import { applyWebColorScheme, openSite } from './plugins/webopener';
import { applyDocumentTheme, resolveAppTheme, webColorScheme, type ColorScheme } from './settings';
import { useStore } from './store';
import type { Site } from './types';

type Modal =
  | { kind: 'editor'; site?: Site }
  | { kind: 'settings' }
  | { kind: 'actions'; site: Site }
  | { kind: 'confirm'; site: Site }
  | null;

export default function App() {
  const ready = useStore((s) => s.ready);
  const sites = useStore((s) => s.sites);
  const settings = useStore((s) => s.settings);
  const moveWithinSection = useStore((s) => s.moveWithinSection);

  const [modal, setModal] = useState<Modal>(null);
  const [query, setQuery] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [resolvedAppTheme, setResolvedAppTheme] = useState<'light' | 'dark'>(() =>
    resolveAppTheme(settings.appTheme),
  );
  const startRef = useRef({ x: 0, y: 0 });
  const movedRef = useRef(false);

  useEffect(() => {
    void useStore.getState().init();
  }, []);

  // 把应用主题写到 <html> 驱动 CSS 变量；「跟随系统」时监听系统主题变化
  useEffect(() => {
    const sync = () => setResolvedAppTheme(applyDocumentTheme(settings.appTheme));
    sync();
    if (settings.appTheme !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => sync();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [settings.appTheme]);

  // 主题与网页配色联动：设置或系统主题变化时，实时下发给已打开的原生 WebView
  const webScheme: ColorScheme = webColorScheme(settings, resolvedAppTheme);
  useEffect(() => {
    void applyWebColorScheme(webScheme);
  }, [webScheme]);

  // 长按进入拖拽：移动超过 12px 才算拖动，否则松手弹操作菜单
  useEffect(() => {
    if (!dragId) return;
    const onMove = (e: PointerEvent) => {
      const d = Math.hypot(e.clientX - startRef.current.x, e.clientY - startRef.current.y);
      if (d > 12) movedRef.current = true;
      if (!movedRef.current) return;
      const el = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest('[data-site-id]') as HTMLElement | null;
      const targetId = el?.dataset['siteId'];
      if (targetId && targetId !== dragId) moveWithinSection(dragId, targetId);
    };
    const onUp = () => {
      if (!movedRef.current) {
        const site = useStore.getState().sites.find((s) => s.id === dragId);
        if (site) setModal({ kind: 'actions', site });
      }
      setDragId(null);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragId, moveWithinSection]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? sites.filter((s) => [s.name, s.url, s.group].some((v) => v.toLowerCase().includes(q)))
    : sites;

  const pinned = filtered.filter((s) => s.pinned);
  const groups: { name: string; sites: Site[] }[] = [];
  for (const s of filtered.filter((s) => !s.pinned)) {
    const name = s.group || '未分组';
    let g = groups.find((x) => x.name === name);
    if (!g) {
      g = { name, sites: [] };
      groups.push(g);
    }
    g.sites.push(s);
  }

  const cardProps = {
    draggingId: dragId,
    onOpen: (site: Site) => void openSite(site),
    onLongPress: (site: Site, pointer: { x: number; y: number }) => {
      startRef.current = pointer;
      movedRef.current = false;
      setDragId(site.id);
    },
  };

  const actionItems: ActionItem[] =
    modal?.kind === 'actions'
      ? [
          { label: '打开', onPress: () => void openSite(modal.site) },
          { label: '编辑', onPress: () => setModal({ kind: 'editor', site: modal.site }) },
          {
            label: modal.site.pinned ? '取消置顶' : '置顶',
            onPress: () => useStore.getState().togglePin(modal.site.id),
          },
          {
            label: '删除',
            destructive: true,
            onPress: () => setModal({ kind: 'confirm', site: modal.site }),
          },
        ]
      : [];

  if (!ready) return null;

  return (
    <div className="screen">
      <header className="topbar">
        <div className="topbar-row">
          <div className="topbar-title">
            <h1>网页盒子</h1>
            <span className="topbar-count">{sites.length} 个网页</span>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-btn"
              aria-label="设置"
              onClick={() => setModal({ kind: 'settings' })}
            >
              <GearIcon />
            </button>
            <button
              className="icon-btn accent"
              aria-label="添加网页"
              onClick={() => setModal({ kind: 'editor' })}
            >
              <PlusIcon />
            </button>
          </div>
        </div>
        <div className="searchbar">
          <SearchIcon />
          <input
            type="search"
            placeholder="搜索名称、网址或分组"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </header>

      <main className="content">
        {sites.length === 0 ? (
          <div className="empty">
            <button
              className="empty-tile"
              onClick={() => setModal({ kind: 'editor' })}
              aria-label="添加网页"
            >
              <PlusIcon size={26} />
            </button>
            <h2>添加你的第一个网页</h2>
            <p>输入网址，它就会像 app 一样出现在这里</p>
          </div>
        ) : (
          <>
            {pinned.length > 0 && <Section title="置顶" sites={pinned} {...cardProps} />}
            {groups.map((g) => (
              <Section key={g.name} title={g.name} sites={g.sites} {...cardProps} />
            ))}
            {pinned.length + groups.reduce((n, g) => n + g.sites.length, 0) === 0 && (
              <p className="empty-search">没有匹配「{query}」的网页</p>
            )}
          </>
        )}
      </main>

      <SiteEditor
        open={modal?.kind === 'editor'}
        site={modal?.kind === 'editor' ? modal.site : undefined}
        onClose={() => setModal(null)}
        onDelete={(site) => setModal({ kind: 'confirm', site })}
      />
      <SettingsSheet open={modal?.kind === 'settings'} onClose={() => setModal(null)} />
      <ActionSheet
        open={modal?.kind === 'actions'}
        items={actionItems}
        onClose={() => setModal(null)}
      />
      <ConfirmDialog
        open={modal?.kind === 'confirm'}
        title="删除网页"
        message={`确定删除「${modal?.kind === 'confirm' ? modal.site.name : ''}」吗？此操作不可撤销。`}
        onConfirm={() => {
          if (modal?.kind === 'confirm') useStore.getState().removeSite(modal.site.id);
          setModal(null);
        }}
        onCancel={() => setModal(null)}
      />
    </div>
  );
}

interface SectionProps {
  title: string;
  sites: Site[];
  draggingId: string | null;
  onOpen: (site: Site) => void;
  onLongPress: (site: Site, pointer: { x: number; y: number }) => void;
}

function Section({ title, sites, draggingId, onOpen, onLongPress }: SectionProps) {
  return (
    <section className="group">
      <h2 className="group-title">{title}</h2>
      <div className="grid">
        {sites.map((site) => (
          <SiteCard
            key={site.id}
            site={site}
            dragging={draggingId === site.id}
            onOpen={onOpen}
            onLongPress={onLongPress}
          />
        ))}
      </div>
    </section>
  );
}
