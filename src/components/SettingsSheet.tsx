import { useEffect, useMemo, useRef, useState } from 'react';
import { copyText, shareText } from '../plugins/sharer';
import { encodeShareCode, parseShareText } from '../share';
import { THEME_MODE_OPTIONS, WEB_THEME_OPTIONS } from '../settings';
import { useStore } from '../store';
import {
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  InfoIcon,
  LayersIcon,
  PaletteIcon,
  ShareIcon,
  SyncIcon,
  TrashIcon,
  UploadIcon,
} from './icons';
import { Sheet } from './Sheet';

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  onManageScenes: () => void;
}

/** 备份的两种外壳：分享码方便发聊天，JSON 方便存文件 */
type ExportFormat = 'code' | 'json';

const FORMAT_OPTIONS: Array<{ value: ExportFormat; label: string }> = [
  { value: 'code', label: '分享码' },
  { value: 'json', label: 'JSON' },
];

export function SettingsSheet({ open, onClose, onManageScenes }: SettingsSheetProps) {
  const sites = useStore((s) => s.sites);
  const scenes = useStore((s) => s.scenes);
  const notes = useStore((s) => s.notes);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);

  const [format, setFormat] = useState<ExportFormat>('code');
  const [exported, setExported] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [msg, setMsg] = useState('');
  const [clearArmed, setClearArmed] = useState(false);

  // 抽屉常驻挂载（保住开关动画），每次打开时重置内部状态
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setFormat('code');
      setExported('');
      setExportOpen(false);
      setImportOpen(false);
      setImportText('');
      setMsg('');
      setClearArmed(false);
    }
    wasOpen.current = open;
  }, [open]);

  // 导入：边粘边解析，粘完立刻能看到「会导入什么」
  const parsed = useMemo(() => parseShareText(importText), [importText]);

  const buildExport = (next: ExportFormat) => {
    const payload = { kind: 'backup' as const, version: 2, sites, scenes, notes, settings };
    const text = next === 'code' ? encodeShareCode(payload) : JSON.stringify(payload, null, 2);
    setFormat(next);
    setExported(text);
    setExportOpen(true);
    setMsg('');
  };

  const doCopyExport = async () => {
    setMsg(
      (await copyText(exported))
        ? `已复制${format === 'code' ? '分享码' : ' JSON'}到剪贴板`
        : '复制失败，请手动选中复制',
    );
  };

  const doShareExport = async () => {
    const result = await shareText({
      text: exported,
      title: `网页盒子备份（${sites.length} 个网页 / ${scenes.length} 个场景）`,
    });
    setMsg(result === 'shared' ? '已分享' : result === 'copied' ? '分享不可用，已复制到剪贴板' : '');
  };

  const doImport = () => {
    if (parsed?.kind !== 'backup') return;
    const { sites: nextSites, scenes: nextScenes, settings: nextSettings, notes: nextNotes } = parsed;
    useStore.getState().importData({
      sites: nextSites,
      scenes: nextScenes,
      settings: nextSettings,
      notes: nextNotes,
    });
    setImportText('');
    setImportOpen(false);
    const notePart = nextNotes ? `、${nextNotes.length} 条文本` : '';
    setMsg(
      nextScenes
        ? `已导入 ${nextSites.length} 个网页、${nextScenes.length} 个场景${notePart}`
        : `已导入 ${nextSites.length} 个网页${notePart}（旧版备份不含场景）`,
    );
  };

  const onClear = () => {
    if (!clearArmed) {
      setClearArmed(true);
      window.setTimeout(() => setClearArmed(false), 3000);
      return;
    }
    useStore.getState().importData({ sites: [], scenes: [], notes: [] });
    setClearArmed(false);
    setMsg('已清空全部网页、场景与文本数据');
  };

  return (
    <Sheet open={open} title="设置" onClose={onClose}>
      <div className="settings">
        <section className="settings-section">
          <h4 className="settings-caption">外观</h4>
          <div className="settings-card">
            <div className="srow srow-col">
              <span className="srow-head">
                <span className="srow-icon tone-purple">
                  <PaletteIcon />
                </span>
                <span className="srow-label">应用主题</span>
              </span>
              <div className="segmented" role="tablist" aria-label="应用主题">
                {THEME_MODE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    role="tab"
                    aria-selected={settings.appTheme === o.value}
                    className={`segment${settings.appTheme === o.value ? ' on' : ''}`}
                    onClick={() => updateSettings({ appTheme: o.value })}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="srow">
              <span className="srow-icon tone-blue">
                <SyncIcon />
              </span>
              <span className="srow-text">
                <span className="srow-label">网页跟随应用主题</span>
                <span className="srow-sub">打开网页时自动套用当前主题配色</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={settings.syncWebTheme}
                aria-label="网页跟随应用主题"
                className={`switch${settings.syncWebTheme ? ' on' : ''}`}
                onClick={() => updateSettings({ syncWebTheme: !settings.syncWebTheme })}
              />
            </div>

            {settings.syncWebTheme && (
              <div className="srow srow-col">
                <span className="srow-head">
                  <span className="srow-icon tone-orange">
                    <PaletteIcon />
                  </span>
                  <span className="srow-label">网页配色</span>
                </span>
                <div className="segmented" role="tablist" aria-label="网页配色">
                  {WEB_THEME_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      role="tab"
                      aria-selected={settings.webTheme === o.value}
                      className={`segment${settings.webTheme === o.value ? ' on' : ''}`}
                      onClick={() => updateSettings({ webTheme: o.value })}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="settings-section">
          <h4 className="settings-caption">场景</h4>
          <div className="settings-card">
            <button className="srow" onClick={onManageScenes}>
              <span className="srow-icon tone-purple">
                <LayersIcon />
              </span>
              <span className="srow-text">
                <span className="srow-label">管理场景</span>
                <span className="srow-sub">
                  {scenes.length > 0
                    ? `${scenes.length} 个场景 · 把一组站点组合成工作环境`
                    : '把一组站点组合成一个「工作环境」'}
                </span>
              </span>
              <span className="srow-chevron">
                <ChevronRightIcon size={15} />
              </span>
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h4 className="settings-caption">数据</h4>
          <div className="settings-card">
            <button
              className="srow"
              onClick={() => {
                if (exportOpen) {
                  setExportOpen(false);
                  return;
                }
                buildExport(format);
              }}
            >
              <span className="srow-icon tone-green">
                <DownloadIcon />
              </span>
              <span className="srow-text">
                <span className="srow-label">导出数据</span>
                <span className="srow-sub">
                  {sites.length} 个网页 · {scenes.length} 个场景 · {notes.length} 条文本 · 分享码或
                  JSON
                </span>
              </span>
              <span className={`srow-chevron${exportOpen ? ' open' : ''}`}>
                <ChevronRightIcon size={15} />
              </span>
            </button>
            {exportOpen && exported && (
              <div className="srow-detail">
                <div className="segmented" role="tablist" aria-label="导出格式">
                  {FORMAT_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      role="tab"
                      aria-selected={format === o.value}
                      className={`segment${format === o.value ? ' on' : ''}`}
                      onClick={() => buildExport(o.value)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <textarea className="form-textarea mono" rows={5} readOnly value={exported} />
                <div className="srow-actions">
                  <button className="btn secondary" onClick={() => void doCopyExport()}>
                    <CopyIcon size={15} />
                    复制
                  </button>
                  <button className="btn secondary" onClick={() => void doShareExport()}>
                    <ShareIcon size={15} />
                    分享
                  </button>
                </div>
              </div>
            )}

            <button
              className="srow"
              onClick={() => {
                setImportOpen((v) => !v);
                setMsg('');
              }}
            >
              <span className="srow-icon tone-blue">
                <UploadIcon />
              </span>
              <span className="srow-text">
                <span className="srow-label">导入数据</span>
                <span className="srow-sub">粘贴分享码或 JSON，覆盖现有网页、场景与文本</span>
              </span>
              <span className={`srow-chevron${importOpen ? ' open' : ''}`}>
                <ChevronRightIcon size={15} />
              </span>
            </button>
            {importOpen && (
              <div className="srow-detail">
                <textarea
                  className="form-textarea mono"
                  rows={5}
                  placeholder="W2A1.… 或粘贴导出的 JSON"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />
                {importText.trim() && !parsed && (
                  <span className="srow-sub">
                    认不出这段内容——请确认分享码是完整复制的，或 JSON 没有被截断。
                  </span>
                )}
                {parsed?.kind === 'backup' && (
                  <span className="srow-sub">
                    将覆盖为 {parsed.sites.length} 个网页、
                    {parsed.scenes ? `${parsed.scenes.length} 个场景` : '场景沿用当前'}、
                    {parsed.notes ? `${parsed.notes.length} 条文本` : '文本沿用当前'}
                  </span>
                )}
                {parsed?.kind === 'scene' && (
                  <span className="srow-sub">
                    这是一份「场景模板」，不是完整备份。请到「场景 → 导入场景模板」里粘贴。
                  </span>
                )}
                {parsed?.kind === 'scene' ? (
                  <button className="btn secondary" onClick={onManageScenes}>
                    去场景管理
                  </button>
                ) : (
                  <button
                    className="btn secondary"
                    disabled={parsed?.kind !== 'backup'}
                    onClick={doImport}
                  >
                    导入并覆盖
                  </button>
                )}
              </div>
            )}
          </div>
          {msg && <p className="settings-msg">{msg}</p>}
        </section>

        <section className="settings-section">
          <h4 className="settings-caption">危险操作</h4>
          <div className="settings-card">
            <button className="srow srow-danger" onClick={onClear}>
              <span className="srow-icon tone-red">
                <TrashIcon />
              </span>
              <span className="srow-text">
                <span className="srow-label">
                  {clearArmed ? '再点一次确认清空' : '清空全部数据'}
                </span>
                <span className="srow-sub">
                  仅删除网页、场景与文本列表，不影响各网页内已保存的登录状态
                </span>
              </span>
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h4 className="settings-caption">关于</h4>
          <div className="settings-card">
            <div className="srow">
              <span className="srow-icon tone-blue">
                <InfoIcon />
              </span>
              <span className="srow-text">
                <span className="srow-label">网页盒子 v0.1.0</span>
                <span className="srow-sub">
                  把网页变成你手机上的 app。所有数据仅保存在本机，不上传服务器。
                </span>
              </span>
            </div>
          </div>
        </section>
      </div>
    </Sheet>
  );
}
