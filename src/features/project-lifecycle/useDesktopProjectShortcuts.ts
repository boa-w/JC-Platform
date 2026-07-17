import { useEffect, useRef } from 'react';
import { desktopProjectShortcut, desktopShortcutBlocked } from './desktopProjectShortcuts';

interface UseDesktopProjectShortcutsOptions {
  canSave: boolean;
  canSaveAs: boolean;
  isBusy: boolean;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
}

export function useDesktopProjectShortcuts(options: UseDesktopProjectShortcutsOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const shortcut = desktopProjectShortcut(event);
      if (!shortcut || event.defaultPrevented || desktopShortcutBlocked()) return;
      event.preventDefault();

      const current = optionsRef.current;
      if (current.isBusy) return;
      if (shortcut === 'open') {
        current.onOpen();
      } else if (shortcut === 'save' && current.canSave) {
        current.onSave();
      } else if (shortcut === 'save-as' && current.canSaveAs) {
        current.onSaveAs();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
}
