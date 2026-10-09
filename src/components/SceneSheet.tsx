import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import {
  hasOverrides,
  sceneMatches,
  sceneSites,
  THEME_COLORS,
  UNGROUPED,
  type Scene,
  type SceneOverrides,
  type Site,
  type UAMode,
} from '../types';
import { ChevronRightIcon, LayersIcon, PaletteIcon, PlusIcon, SyncIcon } from './icons';
import { Sheet } from './Sheet';

interface SceneSheetProps {
  open: boolean;
  onClose: () => void;
}

/** 编辑中的草稿：结构与 Scene 一致，但 id/order 由 store 决定 */
interface Draft {
  id?: string;
  name: string;
  groups: string[];
  includeIds: string[];
  excludeIds: string[];
  overrides: SceneOverrides;
}

const EMPTY_OVERRIDES: SceneOverrides = {};

function draftScene(d: Draft): Scene {
  return {
    id: d.id ?? '',
    name: d.name,
    order: 0,
    groups: d.groups,
    includeIds: d.includeIds,
    excludeIds: d.excludeIds,
    overrides: hasOverrides(d.overrides) ? d.overrides : undefined,
  };
}

function draftSites(d: Draft, sites: Site[]): Site[] {
  const scene = draftScene(d);
  return sites.filter((s) => sceneMatches(scene, s));
}

/** 覆盖摘要，用于场景列表行 */
function overrideSummary(o: SceneOverrides | undefined): string {
  if (!hasOverrides(o)) return '';
  const parts: string[] = [];
  if (o?.ua === 'desktop') parts.push('桌面 UA');
  else if (o?.ua === 'custom') parts.push('自定义 UA');
  else if (o?.ua === 'default') parts.push('移动 UA');
  if (o?.themeColor) parts.push('主题色');
  if (o?.injectScript) parts.push('注入脚本');
  return parts.join(' · ');
}

const UA_OPTIONS = [
  ['', '不覆盖'],
  ['default', '默认'],
  ['desktop', '桌面'],
  ['custom', '自定义'],
] as const;

export function SceneSheet({ open, onClose }: SceneSheetProps) {
  const sites = useStore((s) => s.sites);
  const scenes = useStore((s) => s.scenes);
  const addScene = useStore((s) => s.addScene);
  const updateScene = useStore((s) => s.updateScene);
  const removeScene = useStore((s) => s.removeScene);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [showScript, setShowScript] = useState(false);

  // 抽屉常驻挂载（保住动画），每次打开回到列表
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setDraft(null);
      setShowScript(false);
    }
    wasOpen.current = open;
  }, [open]);

  const allGroups = [...new Set(sites.map((s) => s.group || UNGROUPED))];

  // 已被所选分组覆盖的站点 → 可作为「排除」候选；其余 → 可作为「额外加入」候选
  const coveredIds = new Set(
    sites.filter((s) => draft?.groups.includes(s.group || UNGROUPED)).map((s) => s.id),
  );
  const excludeCandidates = sites.filter((s) => coveredIds.has(s.id));
  const includeCandidates = sites.filter((s) => !coveredIds.has(s.id));

  const patchOverrides = (patch: Partial<SceneOverrides>) => {
    if (!draft) return;
    setDraft({ ...draft, overrides: { ...draft.overrides, ...patch } });
  };

  const setUa = (mode: '' | UAMode) => {
    if (!draft) return;
    const o = draft.overrides;
    // 离开「自定义」时一并清掉 UA 串，避免留下看不见的残留
    patchOverrides({ ua: mode || undefined, customUa: mode === 'custom' ? o.customUa : undefined });
  };

  const toggleGroup = (g: string) => {
    if (!draft) return;
    const groups = draft.groups.includes(g)
      ? draft.groups.filter((x) => x !== g)
      : [...draft.groups, g];
    setDraft({ ...draft, groups });
  };

  const toggleInclude = (id: string) => {
    if (!draft) return;
    const includeIds = draft.includeIds.includes(id)
      ? draft.includeIds.filter((x) => x !== id)
      : [...draft.includeIds, id];
    setDraft({ ...draft, includeIds });
  };

  const toggleExclude = (id: string) => {
    if (!draft) return;
    const excludeIds = draft.excludeIds.includes(id)
      ? draft.excludeIds.filter((x) => x !== id)
      : [...draft.excludeIds, id];
    setDraft({ ...draft, excludeIds });
  };

  const save = () => {
    if (!draft || !draft.name.trim()) return;
    // 清理冗余引用：被分组覆盖的站点无需再「额外加入」，未覆盖的站点也谈不上「排除」
    const covered = new Set(
      sites.filter((s) => draft.groups.includes(s.group || UNGROUPED)).map((s) => s.id),
    );
    const o = draft.overrides;
    const overrides: SceneOverrides = {
      ua: o.ua,
      customUa: o.ua === 'custom' ? o.customUa?.trim() || undefined : undefined,
      themeColor: o.themeColor || undefined,
      injectScript: o.injectScript?.trim() || undefined,
    };
    const payload = {
      name: draft.name.trim(),
      groups: draft.groups,
      includeIds: draft.includeIds.filter((id) => !covered.has(id)),
      excludeIds: draft.excludeIds.filter((id) => covered.has(id)),
      overrides: hasOverrides(overrides) ? overrides : undefined,
    };
    if (draft.id) {
      updateScene(draft.id, payload);
    } else {
      const created = addScene(payload.name);
      updateScene(created.id, payload);
    }
    setDraft(null);
  };

  const doRemove = () => {
    if (!draft?.id) return;
    removeScene(draft.id);
    setDraft(null);
  };

  return (
    <Sheet open={open} title="场景" onClose={onClose}>
      {draft === null ? (
        <div className="settings">
          <section className="settings-section">
            <h4 className="settings-caption">场景</h4>
            <div className="settings-card">
              {scenes.length === 0 && (
                <div className="srow">
                  <span className="srow-text">
                    <span className="srow-sub">
                      还没有场景。场景把一组站点组合成一个「工作环境」——例如「上班」只显示内部系统和工具站，
                      「看盘」只显示行情与资讯。
                    </span>
                  </span>
                </div>
              )}
              {scenes.map((sc) => {
                const summary = overrideSummary(sc.overrides);
                return (
                  <button
                    key={sc.id}
                    className="srow"
                    onClick={() => {
                      setDraft({
                        id: sc.id,
                        name: sc.name,
                        groups: [...sc.groups],
                        includeIds: [...sc.includeIds],
                        excludeIds: [...sc.excludeIds],
                        overrides: { ...sc.overrides },
                      });
                      setShowScript(Boolean(sc.overrides?.injectScript));
                    }}
                  >
                    <span className="srow-icon tone-purple">
                      <LayersIcon />
                    </span>
                    <span className="srow-text">
                      <span className="srow-label">{sc.name}</span>
                      <span className="srow-sub">
                        {sceneSites(sc, sites).length} 个站点
                        {summary && ` · 覆盖 ${summary}`}
                      </span>
                    </span>
                    <span className="srow-chevron">
                      <ChevronRightIcon size={15} />
                    </span>
                  </button>
                );
              })}
              <button
                className="srow"
                onClick={() => {
                  setDraft({
                    name: '',
                    groups: [],
                    includeIds: [],
                    excludeIds: [],
                    overrides: EMPTY_OVERRIDES,
                  });
                  setShowScript(false);
                }}
              >
                <span className="srow-icon tone-blue">
                  <PlusIcon />
                </span>
                <span className="srow-text">
                  <span className="srow-label">新建场景</span>
                </span>
              </button>
            </div>
          </section>
        </div>
      ) : (
        <div className="settings">
          <section className="settings-section">
            <h4 className="settings-caption">{draft.id ? '编辑场景' : '新建场景'}</h4>
            <div className="settings-card">
              <div className="srow srow-col">
                <span className="srow-label">名称</span>
                <input
                  className="form-input"
                  type="text"
                  autoComplete="off"
                  placeholder="例如：上班 / 看盘"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>

              <div className="srow srow-col">
                <span className="srow-head">
                  <span className="srow-icon tone-purple">
                    <LayersIcon />
                  </span>
                  <span className="srow-label">按分组纳入</span>
                </span>
                {allGroups.length === 0 ? (
                  <span className="srow-sub">还没有任何分组。先给站点设置分组，再回来组合场景。</span>
                ) : (
                  <div className="chip-row">
                    {allGroups.map((g) => (
                      <button
                        key={g}
                        type="button"
                        className={`chip${draft.groups.includes(g) ? ' active' : ''}`}
                        onClick={() => toggleGroup(g)}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {excludeCandidates.length > 0 && (
                <div className="srow srow-col">
                  <span className="srow-label">排除其中某些站点</span>
                  <span className="srow-sub">点一下把个别站点单独移出这个场景（红色为已排除）</span>
                  <div className="chip-row">
                    {excludeCandidates.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`chip${draft.excludeIds.includes(s.id) ? ' danger' : ''}`}
                        onClick={() => toggleExclude(s.id)}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {includeCandidates.length > 0 && (
                <div className="srow srow-col">
                  <span className="srow-label">额外加入站点</span>
                  <span className="srow-sub">不属于已选分组，但想放进这个场景的站点</span>
                  <div className="chip-row">
                    {includeCandidates.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`chip${draft.includeIds.includes(s.id) ? ' active' : ''}`}
                        onClick={() => toggleInclude(s.id)}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <p className="settings-note">
              当前包含 {draftSites(draft, sites).length} 个站点
              {sites.length > 0 && draftSites(draft, sites).length === 0 ? '（场景为空）' : ''}
            </p>
          </section>

          <section className="settings-section">
            <h4 className="settings-caption">场景覆盖</h4>
            <div className="settings-card">
              <div className="srow srow-col">
                <span className="srow-head">
                  <span className="srow-icon tone-blue">
                    <SyncIcon />
                  </span>
                  <span className="srow-label">User-Agent</span>
                </span>
                <div className="segmented" role="tablist">
                  {UA_OPTIONS.map(([mode, label]) => (
                    <button
                      key={mode || 'none'}
                      type="button"
                      role="tab"
                      aria-selected={(draft.overrides.ua ?? '') === mode}
                      className={`segment${(draft.overrides.ua ?? '') === mode ? ' on' : ''}`}
                      onClick={() => setUa(mode)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {draft.overrides.ua === 'custom' && (
                  <textarea
                    className="form-textarea mono"
                    rows={2}
                    placeholder="完整 User-Agent 字符串"
                    value={draft.overrides.customUa ?? ''}
                    onChange={(e) => patchOverrides({ customUa: e.target.value })}
                  />
                )}
              </div>

              <div className="srow srow-col">
                <span className="srow-head">
                  <span className="srow-icon tone-orange">
                    <PaletteIcon />
                  </span>
                  <span className="srow-label">主题色</span>
                </span>
                <span className="srow-sub">覆盖场景内所有站点的卡片颜色与原生工具栏底色</span>
                <div className="swatch-row">
                  <button
                    type="button"
                    aria-label="不覆盖"
                    className={`swatch none${draft.overrides.themeColor ? '' : ' on'}`}
                    onClick={() => patchOverrides({ themeColor: undefined })}
                  />
                  {THEME_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={c}
                      className={`swatch${draft.overrides.themeColor === c ? ' on' : ''}`}
                      style={{ backgroundColor: c }}
                      onClick={() => patchOverrides({ themeColor: c })}
                    />
                  ))}
                </div>
              </div>

              <div className="srow srow-col">
                <button
                  type="button"
                  className="disclosure"
                  onClick={() => setShowScript((v) => !v)}
                >
                  注入脚本 {showScript ? '−' : '+'}
                </button>
                <span className="srow-sub">
                  覆盖场景内所有站点打开时执行的 JavaScript；留空则沿用各站点自己的脚本
                </span>
                {showScript && (
                  <textarea
                    className="form-textarea mono"
                    rows={4}
                    placeholder="打开页面时执行的 JavaScript，例如隐藏广告元素"
                    value={draft.overrides.injectScript ?? ''}
                    onChange={(e) => patchOverrides({ injectScript: e.target.value })}
                  />
                )}
              </div>
            </div>
            <p className="settings-note">
              覆盖只作用于「打开网页」时的参数与首页卡片外观，不会改动站点自身的配置。
            </p>
          </section>

          <div className="form">
            <button className="btn primary" disabled={!draft.name.trim()} onClick={save}>
              保存
            </button>
            {draft.id && (
              <button className="btn danger-ghost" onClick={doRemove}>
                删除这个场景
              </button>
            )}
            <button className="btn secondary" onClick={() => setDraft(null)}>
              返回列表
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
