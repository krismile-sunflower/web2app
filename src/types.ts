export type UAMode = 'default' | 'desktop' | 'custom';

export interface Site {
  id: string;
  url: string;
  name: string;
  /** 手动指定的图标 URL，留空则按 favicon.ico → DuckDuckGo 兜底链自动抓取 */
  icon?: string;
  /** 分组名，空字符串 = 未分组 */
  group: string;
  pinned: boolean;
  ua: UAMode;
  customUa?: string;
  /** 卡片/工具栏主题色，如 #0A84FF */
  themeColor?: string;
  /** 打开页面时注入的 JavaScript */
  injectScript?: string;
  createdAt: number;
}

/** 数组顺序即展示顺序：置顶在最前，其余按分组首次出现顺序 */
export type SiteList = Site[];

export const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

export const THEME_COLORS = [
  '#007AFF',
  '#5856D6',
  '#AF52DE',
  '#FF2D55',
  '#FF3B30',
  '#FF9500',
  '#FFCC00',
  '#34C759',
] as const;

/** 补全 URL 协议；非法返回 null */
export function normalizeUrl(raw: string): string | null {
  let v = raw.trim();
  if (!v) return null;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(v)) v = 'https://' + v;
  try {
    const u = new URL(v);
    if (!u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** 兜底图标链：手动 → 站点根 favicon.ico → DuckDuckGo */
export function faviconChain(site: Site): string[] {
  const chain: string[] = [];
  if (site.icon?.trim()) chain.push(site.icon.trim());
  try {
    const u = new URL(site.url);
    chain.push(`${u.origin}/favicon.ico`);
    chain.push(`https://icons.duckduckgo.com/ip3/${u.hostname}.ico`);
  } catch {
    /* ignore */
  }
  return chain;
}

export function siteInitial(site: Site): string {
  const n = site.name.trim();
  return (n || hostOf(site.url)).charAt(0).toUpperCase() || '?';
}
