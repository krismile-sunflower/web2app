import { useEffect, useMemo, useRef, useState } from 'react';
import { copyText, shareText } from '../plugins/sharer';
import {
  applySceneTemplate,
  describePlan,
  encodeShareCode,
  missingGroups,
  parseShareText,
  resolveSceneTemplate,
  sceneToTemplate,
} from '../share';
import { useStore } from '../store';
import {
  groupKey,
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
import {
  ChevronRightIcon,
  CopyIcon,
  LayersIcon,
  PaletteIcon,
  PlusIcon,
  ShareIcon,
  SyncIcon,
  TemplateIcon,
  UploadIcon,
} from './icons';
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
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [includeSites, setIncludeSites] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportCode, setExportCode] = useState('');
  const [msg, setMsg] = useState('');

  // 抽屉常驻挂载（保住动画），每次打开回到列表
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setDraft(null);
      setShowScript(false);
      setImporting(false);
      setImportText('');
      setIncludeSites(false);
      setExportOpen(false);
      setExportCode('');
      setMsg('');
    }
    wasOpen.current = open;
  }, [open]);

  // 「分组」只列真实分组：未分组是空分组在界面上的显示名，不是可勾选的分组，
  // 它单独用一个开关表达，避免同一件事既当分区标题又当分组选项。
  const realGroups = [...new Set(sites.map((s) => s.group).filter(Boolean))];
  const ungroupedCount = sites.filter((s) => !s.group).length;
  const includeUngrouped = draft?.groups.includes(UNGROUPED) ?? false;

  // 已被所选分组覆盖的站点 → 可作为「排除」候选；其余 → 可作为「额外加入」候选
  const coveredIds = new Set(
    sites.filter((s) => draft?.groups.includes(groupKey(s))).map((s) => s.id),
  );
  const excludeCandidates = sites.filter((s) => coveredIds.has(s.id));
  const includeCandidates = sites.filter((s) => !coveredIds.has(s.id));

  // 导入：边粘边解析，粘完立刻能看到「会发生什么」
  const parsed = useMemo(() => parseShareText(importText), [importText]);
  const plan = useMemo(
    () =>
      parsed?.kind === 'scene'
        ? resolveSceneTemplate(
            parsed.scene,
            sites,
            scenes.map((s) => s.name),
          )
        : null,
    [parsed, sites, scenes],
  );
  // 未分组不参与「本机还没有这个分组」的提醒，它有自己的一行说明
  const unknownGroups = useMemo(
    () => (plan ? missingGroups(plan, sites).filter((g) => g !== UNGROUPED) : []),
    [plan, sites],
  );
  const planGroups = useMemo(
    () => (plan ? plan.groups.filter((g) => g !== UNGROUPED) : []),
    [plan],
  );
  const planHasUngrouped = plan?.groups.includes(UNGROUPED) ?? false;

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

  const toggleUngrouped = () => {
    if (!draft) return;
    toggleGroup(UNGROUPED);
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
    const covered = new Set(sites.filter((s) => draft.groups.includes(groupKey(s))).map((s) => s.id));
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

  // ---------- 导出模板 ----------

  const doExportTemplate = () => {
    if (!draft) return;
    const template = sceneToTemplate(draftScene(draft), sites, includeSites);
    setExportCode(encodeShareCode({ kind: 'scene', version: 1, scene: template }));
    setExportOpen(true);
    setMsg('');
  };

  const doCopy = async () => {
    setMsg((await copyText(exportCode)) ? '分享码已复制到剪贴板' : '复制失败，请手动选中复制');
  };

  const doShare = async () => {
    const result = await shareText({
      text: exportCode,
      title: `网页盒子场景：${draft?.name ?? ''}`,
    });
    setMsg(result === 'shared' ? '已分享' : result === 'copied' ? '分享不可用，已复制到剪贴板' : '');
  };

  // ---------- 导入模板 ----------

  const doApplyTemplate = () => {
    if (!plan) return;
    applySceneTemplate(plan);
    const created = plan.create.length;
    setImporting(false);
    setImportText('');
    setMsg(
      `已导入场景「${plan.name}」${created ? `，新增 ${created} 个网页` : ''}${
        plan.renamedFrom ? `（原名「${plan.renamedFrom}」已存在，自动改名）` : ''
      }`,
    );
  };

  const closeImport = () => {
    setImporting(false);
    setImportText('');
  };

  return (
    <Sheet open={open} title="场景" onClose={onClose}>
      {importing ? (
        <div className="settings">
          <section className="settings-section">
            <h4 className="settings-caption">导入场景模板</h4>
            <div className="settings-card">
              <div className="srow srow-col">
                <span className="srow-head">
                  <span className="srow-icon tone-blue">
                    <TemplateIcon />
                  </span>
                  <span className="srow-label">分享码</span>
                </span>
                <span className="srow-sub">
                  粘贴别人发来的分享码（<code>W2A1.</code> 开头），也可以直接粘 JSON
                </span>
                <textarea
                  className="form-textarea mono"
                  rows={4}
                  placeholder="W2A1.…"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />
              </div>

              {importText.trim() && !parsed && (
                <div className="srow">
                  <span className="srow-text">
                    <span className="srow-sub">认不出这段内容——请确认分享码是完整复制的</span>
                  </span>
                </div>
              )}

              {parsed?.kind === 'backup' && (
                <div className="srow">
                  <span className="srow-text">
                    <span className="srow-sub">
                      这是一份完整备份，不是场景模板。请到「设置 → 数据 → 导入数据」恢复。
                    </span>
                  </span>
                </div>
              )}

              {plan && (
                <>
                  <div className="srow">
                    <span className="srow-icon tone-purple">
                      <LayersIcon />
                    </span>
                    <span className="srow-text">
                      <span className="srow-label">{plan.name}</span>
                      <span className="srow-sub">{describePlan(plan)}</span>
                    </span>
                  </div>
                  {plan.renamedFrom && (
                    <div className="srow">
                      <span className="srow-text">
                        <span className="srow-sub">
                          本机已有同名场景「{plan.renamedFrom}」，导入后会叫「{plan.name}」
                        </span>
                      </span>
                    </div>
                  )}
                  {planGroups.length > 0 && (
                    <div className="srow srow-col">
                      <span className="srow-label">按分组纳入</span>
                      <div className="chip-row">
                        {planGroups.map((g) => (
                          <span
                            key={g}
                            className={`chip${unknownGroups.includes(g) ? ' danger' : ' active'}`}
                          >
                            {g}
                          </span>
                        ))}
                      </div>
                      {unknownGroups.length > 0 && (
                        <span className="srow-sub">
                          红色分组本机还没有站点，先建好同名分组它才会生效
                        </span>
                      )}
                    </div>
                  )}
                  {planHasUngrouped && (
                    <div className="srow">
                      <span className="srow-text">
                        <span className="srow-label">包含未分组的站点</span>
                        <span className="srow-sub">
                          {ungroupedCount > 0
                            ? '会带上本机所有没有设置分组的站点'
                            : '本机目前没有未分组的站点，这一条暂时不生效'}
                        </span>
                      </span>
                    </div>
                  )}
                  {plan.create.length > 0 && (
                    <div className="srow srow-col">
                      <span className="srow-label">将新建的网页</span>
                      <div className="chip-row">
                        {plan.create.map((s) => (
                          <span key={s.url} className="chip">
                            {s.name}
                          </span>
                        ))}
                      </div>
                      {plan.create.some((s) => s.injectScript) && (
                        <span className="srow-sub">
                          其中部分站点带有注入脚本，导入后会在打开页面时执行
                        </span>
                      )}
                    </div>
                  )}
                  {plan.missing.length > 0 && (
                    <div className="srow srow-col">
                      <span className="srow-label">引用不到 {plan.missing.length} 个站点</span>
                      <span className="srow-sub">
                        模板按网址找站点，这些网址本机没有（模板也没带），会被跳过：
                        {plan.missing.join('、')}
                      </span>
                    </div>
                  )}
                  {plan.overrides && (
                    <div className="srow">
                      <span className="srow-icon tone-orange">
                        <PaletteIcon />
                      </span>
                      <span className="srow-text">
                        <span className="srow-label">带场景覆盖</span>
                        <span className="srow-sub">{overrideSummary(plan.overrides)}</span>
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="form">
              <button className="btn primary" disabled={!plan} onClick={doApplyTemplate}>
                导入
              </button>
              <button className="btn secondary" onClick={closeImport}>
                返回列表
              </button>
            </div>
          </section>
        </div>
      ) : draft === null ? (
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
                      setIncludeSites(false);
                      setExportOpen(false);
                      setExportCode('');
                      setMsg('');
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
                  setIncludeSites(false);
                  setExportOpen(false);
                  setExportCode('');
                  setMsg('');
                }}
              >
                <span className="srow-icon tone-blue">
                  <PlusIcon />
                </span>
                <span className="srow-text">
                  <span className="srow-label">新建场景</span>
                </span>
              </button>
              <button
                className="srow"
                onClick={() => {
                  setImporting(true);
                  setImportText('');
                  setMsg('');
                }}
              >
                <span className="srow-icon tone-green">
                  <UploadIcon />
                </span>
                <span className="srow-text">
                  <span className="srow-label">导入场景模板</span>
                  <span className="srow-sub">粘贴别人发来的分享码</span>
                </span>
              </button>
            </div>
            {msg && <p className="settings-msg">{msg}</p>}
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
                {realGroups.length === 0 ? (
                  <span className="srow-sub">还没有任何分组。先给站点设置分组，再回来组合场景。</span>
                ) : (
                  <div className="chip-row">
                    {realGroups.map((g) => (
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

              <div className="srow">
                <span className="srow-icon tone-blue">
                  <LayersIcon />
                </span>
                <span className="srow-text">
                  <span className="srow-label">包含未分组的站点</span>
                  <span className="srow-sub">
                    {ungroupedCount > 0
                      ? `把 ${ungroupedCount} 个没有设置分组的站点也纳入`
                      : '目前没有未分组的站点'}
                  </span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={includeUngrouped}
                  aria-label="包含未分组的站点"
                  className={`switch${includeUngrouped ? ' on' : ''}`}
                  onClick={toggleUngrouped}
                />
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

          <section className="settings-section">
            <h4 className="settings-caption">分享模板</h4>
            <div className="settings-card">
              <div className="srow">
                <span className="srow-icon tone-purple">
                  <ShareIcon />
                </span>
                <span className="srow-text">
                  <span className="srow-label">连站点一起打包</span>
                  <span className="srow-sub">
                    带上场景内站点的网址与配置，对方导入后直接能用；关掉则只分享分组规则
                  </span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={includeSites}
                  aria-label="连站点一起打包"
                  className={`switch${includeSites ? ' on' : ''}`}
                  onClick={() => {
                    setIncludeSites((v) => !v);
                    setExportOpen(false);
                    setExportCode('');
                  }}
                />
              </div>
              <button className="srow" onClick={doExportTemplate}>
                <span className="srow-icon tone-green">
                  <TemplateIcon />
                </span>
                <span className="srow-text">
                  <span className="srow-label">生成分享码</span>
                  <span className="srow-sub">一段可直接粘贴发送的文本</span>
                </span>
                <span className={`srow-chevron${exportOpen ? ' open' : ''}`}>
                  <ChevronRightIcon size={15} />
                </span>
              </button>
              {exportOpen && exportCode && (
                <div className="srow-detail">
                  <textarea className="form-textarea mono" rows={4} readOnly value={exportCode} />
                  <div className="srow-actions">
                    <button className="btn secondary" onClick={() => void doCopy()}>
                      <CopyIcon size={15} />
                      复制
                    </button>
                    <button className="btn secondary" onClick={() => void doShare()}>
                      <ShareIcon size={15} />
                      分享
                    </button>
                  </div>
                </div>
              )}
            </div>
            {msg && <p className="settings-msg">{msg}</p>}
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
