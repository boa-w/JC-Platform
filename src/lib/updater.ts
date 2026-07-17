import { relaunch } from '@tauri-apps/plugin-process';
import type { CheckOptions, DownloadEvent } from '@tauri-apps/plugin-updater';
import { getCurrentAppInfo } from './appInfo';
import { normalizeUpdaterError } from './updaterError';

export interface UpdateInfo {
  currentVersion: string;
  availableVersion: string;
  notes?: string;
  pubDate?: string;
}

export interface UpdateProgress {
  downloaded: number;
  total: number | null;
}

export interface CheckUpdateOptions {
  timeout?: number;
}

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function checkForAppUpdate(
  options: CheckUpdateOptions = {},
): Promise<
  { status: 'up-to-date'; currentVersion: string } | { status: 'available'; info: UpdateInfo }
> {
  if (!isTauriRuntime()) {
    const { version } = await getCurrentAppInfo();
    return { status: 'up-to-date', currentVersion: version };
  }

  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const { version: currentVersion } = await getCurrentAppInfo();
    const update = await check({ timeout: options.timeout ?? 30000 } satisfies CheckOptions);

    if (!update) {
      return { status: 'up-to-date', currentVersion };
    }

    return {
      status: 'available',
      info: {
        currentVersion,
        availableVersion: update.version ?? '',
        notes: update.body,
        pubDate: update.date,
      },
    };
  } catch (error) {
    throw new Error(normalizeUpdaterError(error));
  }
}

export async function installAppUpdate(
  onProgress?: (progress: UpdateProgress) => void,
): Promise<boolean> {
  if (!isTauriRuntime()) {
    throw new Error('当前环境不是 Tauri 桌面应用，无法安装更新。');
  }

  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check({ timeout: 30000 } satisfies CheckOptions);

    if (!update) return false;

    let downloaded = 0;
    let total: number | null = null;

    await update.downloadAndInstall((event: DownloadEvent) => {
      if (event.event === 'Started') {
        downloaded = 0;
        total = typeof event.data?.contentLength === 'number' ? event.data.contentLength : null;
      } else if (event.event === 'Progress') {
        downloaded += Number(event.data?.chunkLength ?? 0);
      } else if (event.event === 'Finished') {
        if (total !== null) downloaded = total;
      }

      onProgress?.({ downloaded, total });
    });

    await relaunch();
    return true;
  } catch (error) {
    throw new Error(normalizeUpdaterError(error));
  }
}
