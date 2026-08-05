import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { recordRuntimeDiagnostic } from '../lib/runtimeDiagnostics';
import type { UpdateInfo, UpdateProgress } from '../lib/updater';
import { checkForAppUpdate, installAppUpdate } from '../lib/updater';

type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'restarting'
  | 'error';

interface UseAppUpdateOptions {
  onBeforeRelaunch?: () => void | Promise<void>;
  onRelaunchError?: () => void;
}

export function useAppUpdate({ onBeforeRelaunch, onRelaunchError }: UseAppUpdateOptions = {}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkUpdate = useCallback(async () => {
    setStatus('checking');
    setError(null);
    setProgress(null);

    try {
      const result = await checkForAppUpdate({ timeout: 30000 });
      if (result.status === 'available') {
        setUpdateInfo(result.info);
        setStatus('available');
        return true;
      }

      setUpdateInfo(null);
      setStatus('up-to-date');
      return false;
    } catch (caught) {
      recordRuntimeDiagnostic('error', 'updater.check', caught);
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message.startsWith('updater.') ? t(message) : message);
      setStatus('error');
      return false;
    }
  }, [t]);

  const installUpdate = useCallback(async () => {
    setStatus('downloading');
    setError(null);
    setProgress(null);

    try {
      const started = await installAppUpdate({
        onBeforeRelaunch,
        onProgress: setProgress,
        onRelaunchError,
      });
      if (!started) {
        setUpdateInfo(null);
        setStatus('up-to-date');
        return false;
      }

      setStatus('restarting');
      return true;
    } catch (caught) {
      recordRuntimeDiagnostic('error', 'updater.install', caught);
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message.startsWith('updater.') ? t(message) : message);
      setStatus('error');
      return false;
    }
  }, [onBeforeRelaunch, onRelaunchError, t]);

  return {
    status,
    updateInfo,
    progress,
    error,
    checkUpdate,
    installUpdate,
  };
}
