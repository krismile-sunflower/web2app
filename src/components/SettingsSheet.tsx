import { useEffect, useRef, useState } from 'react';
import { THEME_MODE_OPTIONS, WEB_THEME_OPTIONS } from '../settings';
import { sanitizeSites, useStore } from '../store';
import { Sheet } from './Sheet';

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsSheet({ open, onClose }: SettingsSheetProps) {
  const sites = useStore((s) => s.sites);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const [exported, setExported] = useState('');
  const [importText, setImportText] = useState('');
  const [msg, setMsg] = useState('');
  const [clearArmed, setClearArmed] = useState(false);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setImportText('');
      setMsg('');
      setClearArmed(false);
    }
    wasOpen.current = open;
  }, [open]);

  const doExport = async () => {
    const json = JSON.stringify(sites, null, 2);
    setExported(json);
    setMsg('');
    try {
      await navigator.clipboard.writeText(json);
      setMsg(`已导出 ${sites.length} 个网页并复制到剪贴板`);
    } catch {
      setMsg('已生成 JSON，请在下方手动复制');
    }
  };

  const doImport = () => {
    const parsed = sanitizeSites(
      (() => {
        try {
          return JSON.parse(importText);
        } catch {
          return null;
        }
      })(),
    );
    if (!parsed) {
      setMsg('导入失败：JSON 无效或没有可用条目');
      return;
    }
    useStore.getState().replaceAll(parsed);
    setImportText('');
    setMsg(`已导入 ${parsed.length} 个网页`);
  };

  return (
    <Sheet open={open} title="设置" onClose={onClose}>
      <div className="form">
        <section className="settings-group">
          <h4>外观</h4>
          <p className="settings-hint">
            应用主题与内嵌网页的配色联动。修改后立即生效，已打开的网页会自动套用新配色。
          </p>

          <div className="form-row column">
            <span className="form-label">应用主题</span>
            <div className="segmented" role="tablist">
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

          <div className="switch-row">
            <span className="switch-text">
              <span className="switch-title">网页跟随应用主题</span>
              <span className="switch-desc">打开网页时自动套用当前主题配色（浅色 / 深色）</span>
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
            <div className="form-row column">
              <span className="form-label">网页配色</span>
              <div className="segmented" role="tablist">
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
        </section>

        <section className="settings-group">
          <h4>数据</h4>
          <p className="settings-hint">
            当前 {sites.length} 个网页，保存在本机。导出为 JSON 可备份或迁移到其他设备。
          </p>
          <button className="btn secondary" onClick={doExport}>
            导出数据
          </button>
          {exported && <textarea className="form-textarea mono" rows={5} readOnly value={exported} />}
        </section>

        <section className="settings-group">
          <h4>导入</h4>
          <textarea
            className="form-textarea mono"
            rows={5}
            placeholder="粘贴导出的 JSON"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <button className="btn secondary" disabled={!importText.trim()} onClick={doImport}>
            导入（覆盖现有数据）
          </button>
        </section>

        <section className="settings-group">
          <h4>危险操作</h4>
          <button
            className={`btn ${clearArmed ? 'danger' : 'danger-ghost'}`}
            onClick={() => {
              if (!clearArmed) {
                setClearArmed(true);
                window.setTimeout(() => setClearArmed(false), 3000);
                return;
              }
              useStore.getState().replaceAll([]);
              setMsg('已清空全部数据');
              setClearArmed(false);
            }}
          >
            {clearArmed ? '再点一次确认清空' : '清空全部数据'}
          </button>
        </section>

        <section className="settings-group">
          <h4>关于</h4>
          <p className="settings-hint">
            网页盒子 v0.1.0 —— 把网页变成你手机上的 app。所有数据仅保存在本地。
          </p>
        </section>

        {msg && <p className="form-ok">{msg}</p>}
      </div>
    </Sheet>
  );
}
