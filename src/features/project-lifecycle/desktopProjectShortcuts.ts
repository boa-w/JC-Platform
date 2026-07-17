export type DesktopProjectShortcut = 'open' | 'save' | 'save-as';

interface KeyboardShortcutInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  isComposing?: boolean;
  repeat?: boolean;
}

export function desktopProjectShortcut(
  input: KeyboardShortcutInput,
): DesktopProjectShortcut | null {
  if (input.altKey || input.isComposing || input.repeat || (!input.ctrlKey && !input.metaKey)) {
    return null;
  }
  const key = input.key.toLowerCase();
  if (key === 'o' && !input.shiftKey) return 'open';
  if (key === 's') return input.shiftKey ? 'save-as' : 'save';
  return null;
}

export function desktopShortcutBlocked(root: ParentNode = document) {
  return Boolean(root.querySelector('[aria-modal="true"], .json-popup'));
}
