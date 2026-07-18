import type { ProjectRecoveryDraft } from '../../types/platform';

const recoveryDraftStorageKey = 'jc-custom-platform.projectRecoveryDraft';
const recoveryDraftSchemaVersion = 1;

export interface RecoveryDraftStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

function browserStorage(): RecoveryDraftStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function sameProjectPath(left: string, right: string) {
  const normalizedLeft = left.trim().replace(/\\/g, '/');
  const normalizedRight = right.trim().replace(/\\/g, '/');
  const isWindowsPath = /^[a-z]:\//i.test(normalizedLeft) || normalizedLeft.startsWith('//');
  return isWindowsPath
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

export function readProjectRecoveryDraft(storage = browserStorage()) {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(recoveryDraftStorageKey) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isProjectRecoveryDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isProjectRecoveryDraft(value: unknown): value is ProjectRecoveryDraft {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const draft = value as Partial<ProjectRecoveryDraft>;
  return (
    draft.schemaVersion === recoveryDraftSchemaVersion &&
    typeof draft.projectPath === 'string' &&
    typeof draft.projectName === 'string' &&
    typeof draft.savedAt === 'string' &&
    'document' in draft
  );
}

export function writeProjectRecoveryDraft(
  draft: Omit<ProjectRecoveryDraft, 'schemaVersion'>,
  storage = browserStorage(),
) {
  try {
    if (!storage) return false;
    storage.setItem(
      recoveryDraftStorageKey,
      JSON.stringify({ schemaVersion: recoveryDraftSchemaVersion, ...draft }),
    );
    return true;
  } catch {
    return false;
  }
}

export function removeProjectRecoveryDraft(projectPath?: string, storage = browserStorage()) {
  if (projectPath) {
    const stored = readProjectRecoveryDraft(storage);
    if (!stored || !sameProjectPath(stored.projectPath, projectPath)) return false;
  }
  try {
    if (!storage) return false;
    storage.removeItem(recoveryDraftStorageKey);
    return true;
  } catch {
    return false;
  }
}
