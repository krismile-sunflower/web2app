import { useEffect, useRef, useState } from 'react';
import { THEME_MODE_OPTIONS, WEB_THEME_OPTIONS } from '../settings';
import { sanitizeBackup, useStore } from '../store';
import {
  ChevronRightIcon,
  DownloadIcon,
  InfoIcon,
  LayersIcon,
  PaletteIcon,
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

export function SettingsSheet({ open, onClose, onManageScenes }: SettingsSheetProps) {
  const sites = useStore((s) => s.sites);
  const scenes = useStore((s) => s.scenes);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);

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
      setExported('');
      setExportOpen(false);
      setImportOpen(false);
      setImportText('');
      setMsg('');
      setClearArmed(false);
    }
    wasOpen.current = open;
  }, [open]);

  const doExport = async () => {
    const json = JSON.stringify({ version: 2, sites, scenes, settings }, null, 2);
    setExported(json);
    setExportOpen(true);
    setMsg('');
    try {
      await navigator.clipboard.writeText(json);
      setMsg(`已导出 ${sites.length} 个网页、${scenes.length} 个场景，并复制到剪贴板`);
    } catch {
      setMsg('已生成 JSON，请在下方手动复制');
    }
  };

  const doImport = () => {
    const backup = sanitizeBackup(
      (() => {
        try {
          return JSON.parse(importText);
        } catch {
          return null;
        }
      })(),
    );
    if (!backup) {
      setMsg('导入失败：JSON 无效或没有可用条目');
      return;
    }
    useStore.getState().importData(backup);
    setImportText('');
    setImportOpen(false);
    setMsg(
      backup.scenes
        ? `已导入 ${backup.sites.length} 个网页、${backup.scenes.length} 个场景`
        : `已导入 ${backup.sites.length} 个网页（旧版备份不含场景）`,
    );
  };

  const onClear = () => {
    if (!clearArmed) {
      setClearArmed(true);
      window.setTimeout(() => setClearArmed(false), 3000);
      return;
    }
    useStore.getState().importData({ sites: [], scenes: [] });
    setClearArmed(false);
    setMsg('已清空全部站点与场景数据');
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
            <button className="srow" onClick={() => void doExport()}>
              <span className="srow-icon tone-green">
                <DownloadIcon />
              </span>
              <span className="srow-text">
                <span className="srow-label">导出数据</span>
                <span className="srow-sub">
                  {sites.length} 个网页 · {scenes.length} 个场景 · 生成 JSON 备份
                </span>
              </span>
              <span className={`srow-chevron${exportOpen ? ' open' : ''}`}>
                <ChevronRightIcon size={15} />
              </span>
            </button>
            {exportOpen && exported && (
              <div className="srow-detail">
                <textarea className="form-textarea mono" rows={5} readOnly value={exported} />
              </div>
            )}

            <button className="srow" onClick={() => setImportOpen((v) => !v)}>
              <span className="srow-icon tone-blue">
                <UploadIcon />
              </span>
              <span className="srow-text">
                <span className="srow-label">导入数据</span>
                <span className="srow-sub">粘贴 JSON，覆盖现有站点与场景</span>
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
                  placeholder="粘贴导出的 JSON"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />
                <button className="btn secondary" disabled={!importText.trim()} onClick={doImport}>
                  导入并覆盖
                </button>
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
                <span className="srow-sub">仅删除站点与场景列表，不影响各网页内已保存的登录状态</span>
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
