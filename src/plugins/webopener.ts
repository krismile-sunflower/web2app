import { Capacitor, registerPlugin } from '@capacitor/core';
import { resolveWebColorScheme, type ColorScheme } from '../settings';
import { useStore } from '../store';
import { DESKTOP_UA, type Site } from '../types';

export interface WebOpenOptions {
  url: string;
  title?: string;
  /** 覆盖 User-Agent，缺省用系统默认 */
  userAgent?: string;
  /** 原生工具栏着色 */
  themeColor?: string;
  /** 在目标页面 documentEnd 注入的 JS */
  injectScript?: string;
  /** 强制网页配色方案；system 或缺省 = 不干预，跟随系统 */
  colorScheme?: ColorScheme;
}

export interface WebOpenerPlugin {
  open(options: WebOpenOptions): Promise<void>;
  close(): Promise<void>;
  /** 实时更新已打开网页的配色方案（应用切换主题时联动） */
  setColorScheme(options: { colorScheme: ColorScheme }): Promise<void>;
}

const native = registerPlugin<WebOpenerPlugin>('WebOpener');

export function siteOpenOptions(site: Site, colorScheme: ColorScheme): WebOpenOptions {
  return {
    url: site.url,
    title: site.name,
    userAgent:
      site.ua === 'desktop'
        ? DESKTOP_UA
        : site.ua === 'custom'
          ? site.customUa?.trim() || undefined
          : undefined,
    themeColor: site.themeColor || undefined,
    injectScript: site.injectScript?.trim() || undefined,
    colorScheme,
  };
}

/** 原生全屏 WebView 打开；Web 环境兜底为新标签页 */
export async function openSite(site: Site): Promise<void> {
  const colorScheme = resolveWebColorScheme(useStore.getState().settings);
  if (Capacitor.isNativePlatform()) {
    await native.open(siteOpenOptions(site, colorScheme));
  } else {
    window.open(site.url, '_blank', 'noopener');
  }
}

/**
 * 把配色方案推送给已打开的原生 WebView，用于应用切换主题时的实时联动。
 * Web 环境或旧版原生未实现该方法时静默忽略。
 */
export async function applyWebColorScheme(scheme?: ColorScheme): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const colorScheme = scheme ?? resolveWebColorScheme(useStore.getState().settings);
  try {
    await native.setColorScheme({ colorScheme });
  } catch {
    /* 旧版原生没有 setColorScheme 时忽略 */
  }
}
