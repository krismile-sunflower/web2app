import { sanitizeOverrides, sanitizeBackup, useStore, type Backup } from './store';
import {
  groupKey,
  normalizeGroup,
  normalizeUrl,
  sceneSites,
  type Scene,
  type SceneOverrides,
  type Site,
  type UAMode,
} from './types';

/**
 * 分享码：`W2A1.` + base64url(JSON)。
 * 单行、无空格、无会被聊天软件折行的字符，可以直接粘进微信发出去。
 */
const CODE_PREFIX = 'W2A1.';

/** 模板里的站点：不带 id，靠 URL 跨设备定位 */
export interface SiteTemplate {
  url: string;
  name: string;
  group: string;
  icon?: string;
  ua: UAMode;
  customUa?: string;
  themeColor?: string;
  injectScript?: string;
}

/**
 * 场景模板：可分享的「配方」。
 * 分组按**名字**匹配，纳入/排除按 **URL** 匹配——id 跨设备没有意义，必须换成稳定标识。
 */
export interface SceneTemplate {
  name: string;
  groups: string[];
  /** 额外纳入的站点 URL */
  includeUrls: string[];
  /** 排除的站点 URL */
  excludeUrls: string[];
  overrides?: SceneOverrides;
  /** 可选：连站点一起带走 */
  sites?: SiteTemplate[];
}

export type SharePayload =
  | { kind: 'scene'; version: 1; scene: SceneTemplate }
  | ({ kind: 'backup'; version: number } & Backup);

/** 导入模板后要做什么，交给 UI 预览确认 */
export interface TemplatePlan {
  name: string;
  /** 与本地已有场景重名时被改成什么 */
  renamedFrom?: string;
  groups: string[];
  overrides?: SceneOverrides;
  /** 本地没有、需要新建的站点 */
  create: SiteTemplate[];
  /** 能解析到的额外纳入 URL */
  includeUrls: string[];
  /** 能解析到的排除 URL */
  excludeUrls: string[];
  /** 引用不到任何站点的 URL */
  missing: string[];
}

// ---------- base64url ----------

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// ---------- 校验 ----------

const MAX_TEXT = 20000;

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function urlList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const url = normalizeUrl(raw);
    if (url && !out.includes(url)) out.push(url);
  }
  return out;
}

function nameList(input: unknown, max: number): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const name = raw.trim().slice(0, max);
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

export function sanitizeSiteTemplate(input: unknown): SiteTemplate | null {
  if (!input || typeof input !== 'object') return null;
  const r = input as Record<string, unknown>;
  const url = typeof r['url'] === 'string' ? normalizeUrl(r['url']) : null;
  if (!url) return null;
  const ua: UAMode = r['ua'] === 'desktop' || r['ua'] === 'custom' ? r['ua'] : 'default';
  const name = clip(r['name'], 60).trim();
  return {
    url,
    name: name || url,
    group: normalizeGroup(clip(r['group'], 40)),
    icon: clip(r['icon'], 500).trim() || undefined,
    ua,
    customUa: ua === 'custom' ? clip(r['customUa'], 500) || undefined : undefined,
    themeColor: clip(r['themeColor'], 20).trim() || undefined,
    injectScript: clip(r['injectScript'], MAX_TEXT).trim() || undefined,
  };
}

/** 校验粘贴来的场景模板；不可信的输入一律丢弃非法字段 */
export function sanitizeSceneTemplate(input: unknown): SceneTemplate | null {
  if (!input || typeof input !== 'object') return null;
  const r = input as Record<string, unknown>;
  const name = clip(r['name'], 60).trim();
  if (!name) return null;
  const sites = Array.isArray(r['sites'])
    ? r['sites'].map(sanitizeSiteTemplate).filter((x): x is SiteTemplate => x !== null)
    : [];
  return {
    name,
    groups: nameList(r['groups'], 40),
    includeUrls: urlList(r['includeUrls']),
    excludeUrls: urlList(r['excludeUrls']),
    overrides: sanitizeOverrides(r['overrides']),
    sites: sites.length ? sites : undefined,
  };
}

// ---------- 编解码 ----------

export function encodeShareCode(payload: SharePayload): string {
  return CODE_PREFIX + toBase64Url(JSON.stringify(payload));
}

function normalizePayload(input: unknown): SharePayload | null {
  if (!input || typeof input !== 'object') return null;
  const r = input as Record<string, unknown>;

  if (r['kind'] === 'scene') {
    const scene = sanitizeSceneTemplate(r['scene']);
    return scene ? { kind: 'scene', version: 1, scene } : null;
  }

  // 备份：既接受 v2 信封，也接受 v1 裸数组
  const backup: Backup | null = sanitizeBackup(input);
  if (!backup) return null;
  return {
    kind: 'backup',
    version: typeof r['version'] === 'number' ? r['version'] : Array.isArray(input) ? 1 : 2,
    ...backup,
  };
}

/**
 * 解析用户粘贴的内容。三种输入都认：
 * 分享码、直接粘贴的 JSON、旧版裸数组备份。
 */
export function parseShareText(raw: string): SharePayload | null {
  const text = raw.trim();
  if (!text) return null;
  if (text.startsWith(CODE_PREFIX)) {
    try {
      return normalizePayload(JSON.parse(fromBase64Url(text.slice(CODE_PREFIX.length))));
    } catch {
      return null;
    }
  }
  try {
    return normalizePayload(JSON.parse(text));
  } catch {
    return null;
  }
}

// ---------- 场景 ⇄ 模板 ----------

export function siteToTemplate(site: Site): SiteTemplate {
  return {
    url: site.url,
    name: site.name,
    group: site.group,
    icon: site.icon,
    ua: site.ua,
    customUa: site.customUa,
    themeColor: site.themeColor,
    injectScript: site.injectScript,
  };
}

export function sceneToTemplate(scene: Scene, sites: Site[], includeSites: boolean): SceneTemplate {
  const urlOf = (id: string) => sites.find((s) => s.id === id)?.url;
  const urls = (ids: string[]) =>
    ids.map(urlOf).filter((u): u is string => typeof u === 'string');

  return {
    name: scene.name,
    groups: [...scene.groups],
    includeUrls: urls(scene.includeIds),
    excludeUrls: urls(scene.excludeIds),
    overrides: scene.overrides,
    sites: includeSites ? sceneSites(scene, sites).map(siteToTemplate) : undefined,
  };
}

/**
 * 把模板落到当前设备上：站点按 URL 匹配本地已有数据，
 * 本地没有且模板带了站点的才需要新建；模板没带的只能标记为「引用不到」。
 */
export function resolveSceneTemplate(
  template: SceneTemplate,
  sites: Site[],
  existingSceneNames: string[],
): TemplatePlan {
  const known = new Set(sites.map((s) => normalizeUrl(s.url) ?? s.url));

  const create: SiteTemplate[] = [];
  for (const t of template.sites ?? []) {
    if (known.has(t.url)) continue;
    known.add(t.url);
    create.push(t);
  }

  let name = template.name;
  let renamedFrom: string | undefined;
  if (existingSceneNames.includes(name)) {
    renamedFrom = name;
    let n = 2;
    while (existingSceneNames.includes(`${template.name} ${n}`)) n += 1;
    name = `${template.name} ${n}`;
  }

  return {
    name,
    renamedFrom,
    groups: template.groups,
    overrides: template.overrides,
    create,
    includeUrls: template.includeUrls.filter((u) => known.has(u)),
    excludeUrls: template.excludeUrls.filter((u) => known.has(u)),
    missing: [...template.includeUrls, ...template.excludeUrls].filter((u) => !known.has(u)),
  };
}

/** 执行导入计划：先补齐站点，再建场景。返回新场景 id。 */
export function applySceneTemplate(plan: TemplatePlan): string {
  const store = useStore.getState();
  const idByUrl = new Map<string, string>();
  for (const s of store.sites) idByUrl.set(normalizeUrl(s.url) ?? s.url, s.id);

  for (const t of plan.create) {
    const created = store.addSite({
      url: t.url,
      name: t.name,
      icon: t.icon,
      group: t.group,
      pinned: false,
      ua: t.ua,
      customUa: t.customUa,
      themeColor: t.themeColor,
      injectScript: t.injectScript,
    });
    idByUrl.set(t.url, created.id);
  }

  const ids = (urls: string[]) =>
    urls.map((u) => idByUrl.get(u)).filter((x): x is string => typeof x === 'string');

  const scene = store.addScene(plan.name);
  store.updateScene(scene.id, {
    groups: plan.groups,
    includeIds: ids(plan.includeUrls),
    excludeIds: ids(plan.excludeUrls),
    overrides: plan.overrides,
  });
  return scene.id;
}

/** 模板是否只是「一个场景」，用于给用户一句人话的说明 */
export function describePlan(plan: TemplatePlan): string {
  const parts: string[] = [];
  if (plan.create.length) parts.push(`新建 ${plan.create.length} 个网页`);
  const reuse = plan.includeUrls.length + plan.excludeUrls.length;
  if (reuse) parts.push(`复用本机已有的 ${reuse} 个`);
  if (!plan.create.length && !reuse) parts.push('不涉及具体站点');
  return parts.join(' · ');
}

/** 分组里出现的名字，用于预览时提示「这些分组本机还没有」 */
export function missingGroups(plan: TemplatePlan, sites: Site[]): string[] {
  const local = new Set(sites.map(groupKey));
  return plan.groups.filter((g) => !local.has(g));
}
