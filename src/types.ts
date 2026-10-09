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

/** 未分组站点的分组名 */
export const UNGROUPED = '未分组';

/**
 * 场景级覆盖：叠加在场景内所有站点之上的上下文。
 * 字段缺省（undefined / 空串）表示「不覆盖」，沿用站点自身的配置。
 */
export interface SceneOverrides {
  /** 覆盖 UA 模式；undefined = 不覆盖 */
  ua?: UAMode;
  /** ua === 'custom' 时生效 */
  customUa?: string;
  /** 覆盖卡片磁贴与原生工具栏主题色 */
  themeColor?: string;
  /** 覆盖打开页面时注入的 JS */
  injectScript?: string;
}

/**
 * 场景：把一组站点组合成一个「工作环境」。
 * 它不改动站点本身，只是叠加在站点之上的一层「过滤 + 上下文」：
 * 默认按分组批量纳入，再允许额外纳入 / 排除个别站点，并可整体覆盖 UA / 主题色 / 注入脚本。
 */
export interface Scene {
  id: string;
  name: string;
  order: number;
  /** 按分组批量纳入（分组名，空分组用 UNGROUPED） */
  groups: string[];
  /** 额外纳入的站点 id */
  includeIds: string[];
  /** 从已纳入分组中排除的站点 id（优先级高于纳入） */
  excludeIds: string[];
  /** 场景级覆盖；全部字段为空时省略 */
  overrides?: SceneOverrides;
}

/** 站点是否属于该场景 */
export function sceneMatches(scene: Scene, site: Site): boolean {
  if (scene.excludeIds.includes(site.id)) return false;
  return scene.groups.includes(site.group || UNGROUPED) || scene.includeIds.includes(site.id);
}

/** 场景内的站点（保持传入顺序） */
export function sceneSites(scene: Scene, sites: Site[]): Site[] {
  return sites.filter((s) => sceneMatches(scene, s));
}

/** 覆盖里是否有任一有效字段 */
export function hasOverrides(o: SceneOverrides | undefined): boolean {
  if (!o) return false;
  return Boolean(o.ua || o.customUa || o.themeColor || o.injectScript);
}

/**
 * 应用场景覆盖后的站点，用于「打开页面」与「卡片外观」。
 * 返回新对象，绝不改动原始数据——站点自身的配置始终以编辑页里看到的为准。
 */
export function withSceneOverrides(site: Site, scene: Scene | null): Site {
  const o = scene?.overrides;
  if (!o || !hasOverrides(o)) return site;

  const ua = o.ua ?? site.ua;
  // customUa 只在最终生效的模式是「自定义」时才有意义：
  // 覆盖成 custom 用覆盖值，站点本身就是 custom 则沿用站点的，其余情况一律清空
  const customUa =
    ua === 'custom' ? (o.ua === 'custom' ? (o.customUa || site.customUa) : site.customUa) : undefined;

  return {
    ...site,
    ua,
    customUa,
    themeColor: o.themeColor || site.themeColor,
    injectScript: o.injectScript || site.injectScript,
  };
}

