/** 应用（管理界面）外观模式 */
export type ThemeMode = 'system' | 'light' | 'dark';

/** 内嵌网页配色模式：auto = 跟随应用主题 */
export type WebThemeMode = 'auto' | 'light' | 'dark';

/** 传给原生 WebView 的配色方案；system = 不干预、跟随系统 */
export type ColorScheme = 'system' | 'light' | 'dark';

export interface AppSettings {
  /** 应用外观：跟随系统 / 强制浅色 / 强制深色 */
  appTheme: ThemeMode;
  /** 内嵌网页是否跟随应用主题 */
  syncWebTheme: boolean;
  /** 网页配色：跟随应用 / 强制浅色 / 强制深色（syncWebTheme 开启时生效） */
  webTheme: WebThemeMode;
}

export const DEFAULT_SETTINGS: AppSettings = {
  appTheme: 'system',
  syncWebTheme: true,
  webTheme: 'auto',
};

export const THEME_MODE_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];

export const WEB_THEME_OPTIONS: { value: WebThemeMode; label: string }[] = [
  { value: 'auto', label: '跟随应用' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];

/** 系统当前是否处于深色 */
export function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

/** 把外观模式解析为实际生效的 light / dark */
export function resolveAppTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return mode;
}

/** 结合已解析的应用主题，计算内嵌网页应使用的配色方案 */
export function webColorScheme(s: AppSettings, resolvedApp: 'light' | 'dark'): ColorScheme {
  if (!s.syncWebTheme) return 'system';
  if (s.webTheme === 'light') return 'light';
  if (s.webTheme === 'dark') return 'dark';
  return resolvedApp;
}

/** 计算内嵌网页应使用的配色方案（内部即时读取系统主题） */
export function resolveWebColorScheme(s: AppSettings): ColorScheme {
  return webColorScheme(s, resolveAppTheme(s.appTheme));
}

/** 校验并补全持久化的设置 */
export function sanitizeSettings(input: unknown): AppSettings {
  const r = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const appTheme: ThemeMode =
    r['appTheme'] === 'light' || r['appTheme'] === 'dark' || r['appTheme'] === 'system'
      ? r['appTheme']
      : DEFAULT_SETTINGS.appTheme;
  const webTheme: WebThemeMode =
    r['webTheme'] === 'light' || r['webTheme'] === 'dark' || r['webTheme'] === 'auto'
      ? r['webTheme']
      : DEFAULT_SETTINGS.webTheme;
  return {
    appTheme,
    syncWebTheme:
      typeof r['syncWebTheme'] === 'boolean' ? r['syncWebTheme'] : DEFAULT_SETTINGS.syncWebTheme,
    webTheme,
  };
}

/**
 * 把主题写到 <html> 上以驱动 CSS 变量，并同步 color-scheme。
 * 返回实际生效的 light / dark，方便调用方推送给内嵌 WebView。
 */
export function applyDocumentTheme(mode: ThemeMode): 'light' | 'dark' {
  const resolved = resolveAppTheme(mode);
  const root = document.documentElement;
  root.dataset['theme'] = resolved;
  root.style.colorScheme = resolved;
  return resolved;
}
