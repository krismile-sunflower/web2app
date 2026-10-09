import { create } from 'zustand';
import { Preferences } from '@capacitor/preferences';
import { DEFAULT_SETTINGS, sanitizeSettings, type AppSettings } from './settings';
import type { Site } from './types';

const STORAGE_KEY = 'web2app.sites.v1';
const SETTINGS_KEY = 'web2app.settings.v1';

interface AppState {
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
  replaceAll: (sites: Site[]) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
}

async function persist(sites: Site[]) {
  await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(sites) });
}

async function persistSettings(settings: AppSettings) {
  await Preferences.set({ key: SETTINGS_KEY, value: JSON.stringify(settings) });
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

export const useStore = create<AppState>((set, get) => ({
  ready: false,
  sites: [],
  settings: DEFAULT_SETTINGS,

  init: async () => {
    const [{ value }, { value: settingsValue }] = await Promise.all([
      Preferences.get({ key: STORAGE_KEY }),
      Preferences.get({ key: SETTINGS_KEY }),
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
    set({ sites, settings, ready: true });
  },

  addSite: (s) => {
    const site: Site = { ...s, id: newId(), createdAt: Date.now() };
    const sites = [...get().sites, site];
    set({ sites });
    void persist(sites);
    return site;
  },

  updateSite: (id, patch) => {
    const sites = get().sites.map((s) => (s.id === id ? { ...s, ...patch } : s));
    set({ sites });
    void persist(sites);
  },

  removeSite: (id) => {
    const sites = get().sites.filter((s) => s.id !== id);
    set({ sites });
    void persist(sites);
  },

  togglePin: (id) => {
    const sites = get().sites.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s));
    set({ sites });
    void persist(sites);
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
    void persist(sites);
  },

  replaceAll: (sites) => {
    set({ sites });
    void persist(sites);
  },

  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    void persistSettings(settings);
  },
}));
