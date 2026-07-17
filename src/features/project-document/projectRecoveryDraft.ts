const recoveryDraftStorageKey = 'jc-custom-platform.projectRecoveryDraft';
const recoveryDraftSchemaVersion = 1;

export interface RecoveryDraftStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export interface ProjectRecoveryDraft {
  schemaVersion: number;
  projectPath: string;
  projectName: string;
  savedAt: string;
  document: unknown;
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
    const parsed = JSON.parse(raw) as Partial<ProjectRecoveryDraft>;
    if (
      parsed.schemaVersion !== recoveryDraftSchemaVersion ||
      typeof parsed.projectPath !== 'string' ||
      typeof parsed.projectName !== 'string' ||
      typeof parsed.savedAt !== 'string' ||
      !('document' in parsed)
    ) {
      return null;
    }
    return parsed as ProjectRecoveryDraft;
  } catch {
    return null;
  }
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
