import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import {
  hostOf,
  normalizeUrl,
  THEME_COLORS,
  type Site,
  type UAMode,
} from '../types';
import { Sheet } from './Sheet';

interface SiteEditorProps {
  open: boolean;
  /** 编辑已有站点；undefined = 新建 */
  site?: Site;
  onClose: () => void;
  onDelete: (site: Site) => void;
}

export function SiteEditor({ open, site, onClose, onDelete }: SiteEditorProps) {
  const sites = useStore((s) => s.sites);
  const groups = [...new Set(sites.map((x) => x.group).filter(Boolean))];

  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [icon, setIcon] = useState('');
  const [group, setGroup] = useState('');
  const [ua, setUa] = useState<UAMode>('default');
  const [customUa, setCustomUa] = useState('');
  const [themeColor, setThemeColor] = useState('');
  const [injectScript, setInjectScript] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState('');

  // 组件常驻挂载（保住抽屉动画），每次打开时按目标站点重置表单
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setUrl(site?.url ?? '');
      setName(site?.name ?? '');
      setNameTouched(Boolean(site));
      setIcon(site?.icon ?? '');
      setGroup(site?.group ?? '');
      setUa(site?.ua ?? 'default');
      setCustomUa(site?.customUa ?? '');
      setThemeColor(site?.themeColor ?? '');
      setInjectScript(site?.injectScript ?? '');
      setShowAdvanced(Boolean(site?.injectScript));
      setError('');
    }
    wasOpen.current = open;
  }, [open, site]);

  const onUrlChange = (v: string) => {
    setUrl(v);
    if (!nameTouched) {
      const norm = normalizeUrl(v);
      setName(norm ? hostOf(norm) : '');
    }
  };

  const save = () => {
    const norm = normalizeUrl(url);
    if (!norm) {
      setError('请输入有效的网址，例如 example.com');
      return;
    }
    const payload = {
      url: norm,
      name: name.trim() || hostOf(norm),
      icon: icon.trim() || undefined,
      group: group.trim(),
      pinned: site?.pinned ?? false,
      ua,
      customUa: ua === 'custom' ? customUa.trim() : undefined,
      themeColor: themeColor || undefined,
      injectScript: injectScript.trim() || undefined,
    };
    if (site) useStore.getState().updateSite(site.id, payload);
    else useStore.getState().addSite(payload);
    onClose();
  };

  return (
    <Sheet open={open} title={site ? '编辑网页' : '添加网页'} onClose={onClose}>
      <div className="form">
        <label className="form-row">
          <span className="form-label">网址</span>
          <input
            className="form-input"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="example.com"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
          />
        </label>
        <label className="form-row">
          <span className="form-label">名称</span>
          <input
            className="form-input"
            type="text"
            autoComplete="off"
            placeholder="显示在图标下方"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameTouched(true);
            }}
          />
        </label>
        <label className="form-row">
          <span className="form-label">图标</span>
          <input
            className="form-input"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="留空自动抓取 favicon"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
          />
        </label>
        <div className="form-row">
          <span className="form-label">分组</span>
          <input
            className="form-input"
            type="text"
            autoComplete="off"
            placeholder="未分组"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          />
        </div>
        {groups.length > 0 && (
          <div className="chip-row indented">
            {groups.map((g) => (
              <button
                key={g}
                type="button"
                className={`chip${group === g ? ' active' : ''}`}
                onClick={() => setGroup(group === g ? '' : g)}
              >
                {g}
              </button>
            ))}
          </div>
        )}

        <div className="form-row column">
          <span className="form-label">User-Agent</span>
          <div className="segmented" role="tablist">
            {(
              [
                ['default', '默认'],
                ['desktop', '桌面版'],
                ['custom', '自定义'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                role="tab"
                aria-selected={ua === mode}
                className={`segment${ua === mode ? ' on' : ''}`}
                onClick={() => setUa(mode)}
              >
                {label}
              </button>
            ))}
          </div>
          {ua === 'custom' && (
            <textarea
              className="form-textarea"
              rows={2}
              placeholder="完整 User-Agent 字符串"
              value={customUa}
              onChange={(e) => setCustomUa(e.target.value)}
            />
          )}
        </div>

        <div className="form-row column">
          <span className="form-label">主题色</span>
          <div className="swatch-row">
            <button
              type="button"
              aria-label="自动"
              className={`swatch auto${!themeColor ? ' on' : ''}`}
              onClick={() => setThemeColor('')}
            />
            {THEME_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                className={`swatch${themeColor === c ? ' on' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => setThemeColor(c)}
              />
            ))}
          </div>
        </div>

        <button type="button" className="disclosure" onClick={() => setShowAdvanced((v) => !v)}>
          注入脚本 {showAdvanced ? '−' : '+'}
        </button>
        {showAdvanced && (
          <textarea
            className="form-textarea mono"
            rows={4}
            placeholder="打开页面时执行的 JavaScript，例如隐藏广告元素"
            value={injectScript}
            onChange={(e) => setInjectScript(e.target.value)}
          />
        )}

        {error && <p className="form-error">{error}</p>}

        <button className="btn primary" onClick={save}>
          {site ? '保存修改' : '添加'}
        </button>
        {site && (
          <button className="btn danger-ghost" onClick={() => onDelete(site)}>
            删除这个网页
          </button>
        )}
      </div>
    </Sheet>
  );
}
