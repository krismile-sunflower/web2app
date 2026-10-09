import { Capacitor, registerPlugin } from '@capacitor/core';

export interface ShareOptions {
  text: string;
  /** 分享面板标题（Android 用作 chooser 标题 / 主题） */
  title?: string;
}

export interface SharerPlugin {
  share(options: ShareOptions): Promise<{ completed: boolean }>;
}

/** 分享结果：真的分享出去 / 退回复制到剪贴板 / 用户取消 */
export type ShareResult = 'shared' | 'copied' | 'cancelled';

const native = registerPlugin<SharerPlugin>('Sharer');

/**
 * 唤起系统分享面板（iOS UIActivityViewController / Android ACTION_SEND）。
 * Web 环境退回 navigator.share，再退回复制到剪贴板。
 */
export async function shareText(options: ShareOptions): Promise<ShareResult> {
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await native.share(options);
      return result?.completed ? 'shared' : 'cancelled';
    } catch {
      /* 旧版原生没有 Sharer 时退回下面 */
    }
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text: options.text, title: options.title });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }

  try {
    await navigator.clipboard.writeText(options.text);
    return 'copied';
  } catch {
    return 'cancelled';
  }
}

/** 复制到剪贴板；失败返回 false，调用方据此提示用户手动选中复制 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
