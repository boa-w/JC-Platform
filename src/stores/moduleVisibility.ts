import { useCallback, useEffect, useMemo, useState } from 'react';
import { featureModules } from '../data/modules.ts';
import type { FeatureModule, NavigationKey } from '../types/platform.ts';
import {
  getStorageItem,
  removeStorageItem,
  type StorageLike,
  setStorageItem,
} from '../utils/safeStorage.ts';

export const NAVIGATION_VISIBILITY_STORAGE_KEY = 'jc-platform.module-visibility';

/** 项目页是入口页，任何情况下都不允许被隐藏。 */
const ALWAYS_VISIBLE_MODULE_KEYS: ReadonlySet<NavigationKey> = new Set<NavigationKey>(['project']);

const knownModuleKeys: ReadonlySet<string> = new Set(featureModules.map((module) => module.key));

/** 从持久化内容中解析隐藏列表；忽略未知 key、始终可见的 key 以及损坏的格式。 */
export function parseHiddenModules(raw: string | null): Set<NavigationKey> {
  const hidden = new Set<NavigationKey>();
  if (!raw) return hidden;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return hidden;
    for (const value of parsed) {
      if (
        typeof value === 'string' &&
        knownModuleKeys.has(value) &&
        !ALWAYS_VISIBLE_MODULE_KEYS.has(value as NavigationKey)
      ) {
        hidden.add(value as NavigationKey);
      }
    }
  } catch {
    return hidden;
  }
  return hidden;
}

/** 持久化隐藏列表；全部显示时移除存储项，恢复默认。 */
export function persistHiddenModules(keys: ReadonlySet<NavigationKey>, storage: StorageLike) {
  if (keys.size === 0) {
    return removeStorageItem(NAVIGATION_VISIBILITY_STORAGE_KEY, storage);
  }
  return setStorageItem(
    NAVIGATION_VISIBILITY_STORAGE_KEY,
    JSON.stringify([...keys].sort()),
    storage,
  );
}

export function filterVisibleModules(
  modules: FeatureModule[],
  hiddenKeys: ReadonlySet<NavigationKey>,
): FeatureModule[] {
  return modules.filter((module) => !hiddenKeys.has(module.key));
}

/** 当前激活页被隐藏时回退到第一个可见功能页。 */
export function resolveNavigationKey(
  activeKey: NavigationKey,
  hiddenKeys: ReadonlySet<NavigationKey>,
): NavigationKey | null {
  if (!hiddenKeys.has(activeKey)) return activeKey;
  const fallback = featureModules.find((module) => !hiddenKeys.has(module.key));
  return fallback ? fallback.key : null;
}

export function useModuleVisibility() {
  const [hiddenKeys, setHiddenKeys] = useState<ReadonlySet<NavigationKey>>(() =>
    parseHiddenModules(getStorageItem(NAVIGATION_VISIBILITY_STORAGE_KEY)),
  );

  useEffect(() => {
    void persistHiddenModules(hiddenKeys, browserStorage());
  }, [hiddenKeys]);

  const setModuleVisible = useCallback((key: NavigationKey, visible: boolean) => {
    if (ALWAYS_VISIBLE_MODULE_KEYS.has(key)) return;
    setHiddenKeys((current) => {
      const next = new Set(current);
      if (visible) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const showAllModules = useCallback(() => {
    setHiddenKeys((current) => (current.size === 0 ? current : new Set()));
  }, []);

  const visibleModules = useMemo(
    () => filterVisibleModules(featureModules, hiddenKeys),
    [hiddenKeys],
  );

  return {
    hiddenKeys,
    setModuleVisible,
    showAllModules,
    visibleModules,
  } as const;
}

export type ModuleVisibilityController = ReturnType<typeof useModuleVisibility>;

function browserStorage(): StorageLike {
  return {
    getItem: (key) => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    removeItem: (key) => {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // 存储不可用时静默忽略，与 safeStorage 的行为保持一致。
      }
    },
    setItem: (key, value) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // 存储不可用时静默忽略，与 safeStorage 的行为保持一致。
      }
    },
  };
}
