import { Capacitor, registerPlugin } from '@capacitor/core';
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
}

export interface WebOpenerPlugin {
  open(options: WebOpenOptions): Promise<void>;
  close(): Promise<void>;
}

const native = registerPlugin<WebOpenerPlugin>('WebOpener');

export function siteOpenOptions(site: Site): WebOpenOptions {
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
  };
}

/** 原生全屏 WebView 打开；Web 环境兜底为新标签页 */
export async function openSite(site: Site): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await native.open(siteOpenOptions(site));
  } else {
    window.open(site.url, '_blank', 'noopener');
  }
}
