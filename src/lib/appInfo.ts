import { getName, getVersion } from '@tauri-apps/api/app';
import { APP_NAME, APP_VERSION } from '../constants/app';

export interface AppInfo {
  name: string;
  version: string;
}

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function getCurrentAppInfo(): Promise<AppInfo> {
  if (!isTauriRuntime()) {
    return { name: APP_NAME, version: APP_VERSION };
  }

  try {
    const [name, version] = await Promise.all([getName(), getVersion()]);
    return {
      name: name || APP_NAME,
      version: version || APP_VERSION,
    };
  } catch {
    return { name: APP_NAME, version: APP_VERSION };
  }
}
