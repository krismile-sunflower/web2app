import { create } from 'zustand';
import { Preferences } from '@capacitor/preferences';
import { DEFAULT_SETTINGS, sanitizeSettings, type AppSettings } from './settings';
import { hasOverrides, type Scene, type SceneOverrides, type Site } from './types';

const STORAGE_KEY = 'web2app.sites.v1';
const SETTINGS_KEY = 'web2app.settings.v1';
const SCENES_KEY = 'web2app.scenes.v1';

/** 场景集合与当前激活场景（null = 全部）一起持久化 */
interface SceneState {
  scenes: Scene[];
  activeSceneId: string | null;
}

/** 备份信封：v1 是裸的 Site[]，v2 起为对象；scenes/settings 缺省表示"沿用当前" */
export interface Backup {
  sites: Site[];
  scenes?: Scene[];
  settings?: AppSettings;
}

interface AppState extends SceneState {
  ready: boolean;
  sites: Site[];
  settings: AppSettings;
  init: () => Promise<void>;
  addSite: (s: Omit<Site, 'id' | 'createdAt'>) => Site;
  updateSite: (id: string, patch: Partial<Omit<Site, 'id'>>) => void;
  removeSite: (id: string) => void;
  togglePin: (id: string) => void;
  /** 在同一分区内拖拽排序（置顶同理）；跨分区调用会被忽略 */
  moveWithinSection: (fromId: string, toId: string) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  addScene: (name: string) => Scene;
  updateScene: (id: string, patch: Partial<Omit<Scene, 'id'>>) => void;
  removeScene: (id: string) => void;
  setActiveScene: (id: string | null) => void;
  /** 恢复备份：未提供的字段沿用当前值 */
  importData: (payload: Backup) => void;
}

async function persistSites(sites: Site[]) {
  await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(sites) });
}

async function persistSettings(settings: AppSettings) {
  await Preferences.set({ key: SETTINGS_KEY, value: JSON.stringify(settings) });
}

async function persistScenes(scenes: Scene[], activeSceneId: string | null) {
  const payload: SceneState = { scenes, activeSceneId };
  await Preferences.set({ key: SCENES_KEY, value: JSON.stringify(payload) });
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 校验并补全导入的站点数据 */
export function sanitizeSites(input: unknown): Site[] | null {
  if (!Array.isArray(input)) return null;
  const seen = new Set<string>();
  const out: Site[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const url = typeof r.url === 'string' ? r.url.trim() : '';
    if (!/^https?:\/\//.test(url)) continue;
    let id = typeof r.id === 'string' && r.id ? r.id : newId();
    while (seen.has(id)) id = newId();
    seen.add(id);
    out.push({
      id,
      url,
      name: typeof r.name === 'string' && r.name.trim() ? r.name.trim() : url,
      icon: typeof r.icon === 'string' ? r.icon : undefined,
      group: typeof r.group === 'string' ? r.group : '',
      pinned: r.pinned === true,
      ua: r.ua === 'desktop' || r.ua === 'custom' ? r.ua : 'default',
      customUa: typeof r.customUa === 'string' ? r.customUa : undefined,
      themeColor: typeof r.themeColor === 'string' ? r.themeColor : undefined,
      injectScript: typeof r.injectScript === 'string' ? r.injectScript : undefined,
      createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
    });
  }
  return out;
}

function stringArray(input: unknown): string[] {
  return Array.isArray(input) ? input.filter((v): v is string => typeof v === 'string') : [];
}

/** 校验场景覆盖；全部字段为空时返回 undefined，避免存下无意义的空对象 */
export function sanitizeOverrides(input: unknown): SceneOverrides | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const r = input as Record<string, unknown>;
  const ua = r['ua'] === 'default' || r['ua'] === 'desktop' || r['ua'] === 'custom' ? r['ua'] : undefined;
  const customUa = typeof r['customUa'] === 'string' && r['customUa'].trim() ? r['customUa'] : undefined;
  const themeColor = typeof r['themeColor'] === 'string' && r['themeColor'].trim() ? r['themeColor'] : undefined;
  const injectScript =
    typeof r['injectScript'] === 'string' && r['injectScript'].trim() ? r['injectScript'] : undefined;
  const out: SceneOverrides = { ua, customUa, themeColor, injectScript };
  return hasOverrides(out) ? out : undefined;
}

/** 校验并补全导入的场景数据；非法条目直接丢弃 */
export function sanitizeScenes(input: unknown): Scene[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: Scene[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!name) continue;
    let id = typeof r.id === 'string' && r.id ? r.id : newId();
    while (seen.has(id)) id = newId();
    seen.add(id);
    out.push({
      id,
      name,
      order: typeof r.order === 'number' ? r.order : out.length,
      groups: stringArray(r.groups),
      includeIds: stringArray(r.includeIds),
      excludeIds: stringArray(r.excludeIds),
      overrides: sanitizeOverrides(r['overrides']),
    });
  }
  return out.sort((a, b) => a.order - b.order);
}

/**
 * 校验备份数据。兼容三种输入：
 * - v1 裸数组 Site[]（仅站点，场景/设置沿用当前）
 * - v2 信封 { version, sites, scenes, settings }
 * - 只有 sites 的对象
 */
export function sanitizeBackup(input: unknown): Backup | null {
  if (Array.isArray(input)) {
    const sites = sanitizeSites(input);
    return sites ? { sites } : null;
  }
  if (!input || typeof input !== 'object') return null;
  const r = input as Record<string, unknown>;
  const sites = sanitizeSites(r['sites']);
  if (!sites) return null;
  return {
    sites,
    scenes: Array.isArray(r['scenes']) ? sanitizeScenes(r['scenes']) : undefined,
    settings: r['settings'] ? sanitizeSettings(r['settings']) : undefined,
  };
}

function sanitizeSceneState(input: unknown): SceneState {
  if (!input || typeof input !== 'object') return { scenes: [], activeSceneId: null };
  const r = input as Record<string, unknown>;
  const scenes = sanitizeScenes(r['scenes']);
  const rawActive = typeof r['activeSceneId'] === 'string' ? r['activeSceneId'] : null;
  const activeSceneId = scenes.some((s) => s.id === rawActive) ? rawActive : null;
  return { scenes, activeSceneId };
}

export const useStore = create<AppState>((set, get) => ({
  ready: false,
  sites: [],
  settings: DEFAULT_SETTINGS,
  scenes: [],
  activeSceneId: null,

  init: async () => {
    const [{ value }, { value: settingsValue }, { value: scenesValue }] = await Promise.all([
      Preferences.get({ key: STORAGE_KEY }),
      Preferences.get({ key: SETTINGS_KEY }),
      Preferences.get({ key: SCENES_KEY }),
    ]);
    let sites: Site[] = [];
    if (value) {
      try {
        sites = sanitizeSites(JSON.parse(value)) ?? [];
      } catch {
        sites = [];
      }
    }
    let settings = DEFAULT_SETTINGS;
    if (settingsValue) {
      try {
        settings = sanitizeSettings(JSON.parse(settingsValue));
      } catch {
        settings = DEFAULT_SETTINGS;
      }
    }
    let sceneState: SceneState = { scenes: [], activeSceneId: null };
    if (scenesValue) {
      try {
        sceneState = sanitizeSceneState(JSON.parse(scenesValue));
      } catch {
        sceneState = { scenes: [], activeSceneId: null };
      }
    }
    set({ sites, settings, ...sceneState, ready: true });
  },

  addSite: (s) => {
    const site: Site = { ...s, id: newId(), createdAt: Date.now() };
    const sites = [...get().sites, site];
    set({ sites });
    void persistSites(sites);
    return site;
  },

  updateSite: (id, patch) => {
    const sites = get().sites.map((s) => (s.id === id ? { ...s, ...patch } : s));
    set({ sites });
    void persistSites(sites);
  },

  removeSite: (id) => {
    const sites = get().sites.filter((s) => s.id !== id);
    // 同步清理场景里对已删站点的引用，避免脏 id 累积
    const scenes = get().scenes.map((sc) => ({
      ...sc,
      includeIds: sc.includeIds.filter((x) => x !== id),
      excludeIds: sc.excludeIds.filter((x) => x !== id),
    }));
    set({ sites, scenes });
    void persistSites(sites);
    void persistScenes(scenes, get().activeSceneId);
  },

  togglePin: (id) => {
    const sites = get().sites.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s));
    set({ sites });
    void persistSites(sites);
  },

  moveWithinSection: (fromId, toId) => {
    const sites = [...get().sites];
    const from = sites.findIndex((s) => s.id === fromId);
    const to = sites.findIndex((s) => s.id === toId);
    if (from < 0 || to < 0 || from === to) return;
    const a = sites[from];
    const b = sites[to];
    if (a.pinned !== b.pinned || a.group !== b.group) return;
    sites.splice(from, 1);
    sites.splice(to, 0, a);
    set({ sites });
    void persistSites(sites);
  },

  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    void persistSettings(settings);
  },

  addScene: (name) => {
    const scenes = [...get().scenes];
    const scene: Scene = {
      id: newId(),
      name: name.trim() || '未命名场景',
      order: scenes.length,
      groups: [],
      includeIds: [],
      excludeIds: [],
    };
    scenes.push(scene);
    set({ scenes });
    void persistScenes(scenes, get().activeSceneId);
    return scene;
  },

  updateScene: (id, patch) => {
    const scenes = get().scenes.map((s) => (s.id === id ? { ...s, ...patch } : s));
    set({ scenes });
    void persistScenes(scenes, get().activeSceneId);
  },

  removeScene: (id) => {
    const scenes = get().scenes.filter((s) => s.id !== id);
    const activeSceneId = get().activeSceneId === id ? null : get().activeSceneId;
    set({ scenes, activeSceneId });
    void persistScenes(scenes, activeSceneId);
  },

  setActiveScene: (id) => {
    const activeSceneId = id && get().scenes.some((s) => s.id === id) ? id : null;
    set({ activeSceneId });
    void persistScenes(get().scenes, activeSceneId);
  },

  importData: (payload) => {
    const sites = payload.sites;
    const scenes = payload.scenes ?? get().scenes;
    const settings = payload.settings ?? get().settings;
    const currentActive = get().activeSceneId;
    const activeSceneId = scenes.some((s) => s.id === currentActive) ? currentActive : null;
    set({ sites, scenes, settings, activeSceneId });
    void persistSites(sites);
    void persistScenes(scenes, activeSceneId);
    void persistSettings(settings);
  },
}));
