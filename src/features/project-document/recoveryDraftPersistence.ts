import {
  clearProjectRecoveryDraft,
  loadProjectRecoveryDraft,
  saveProjectRecoveryDraft,
} from '../../api/commands';
import type { ProjectRecoveryDraft } from '../../types/platform';
import {
  isProjectRecoveryDraft,
  readProjectRecoveryDraft,
  removeProjectRecoveryDraft,
  writeProjectRecoveryDraft,
} from './projectRecoveryDraft';

const isDesktopRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function readPersistedRecoveryDraft() {
  if (!isDesktopRuntime()) return readProjectRecoveryDraft();

  const desktopDraft = await loadProjectRecoveryDraft();
  const legacyDraft = readProjectRecoveryDraft();
  if (desktopDraft && isProjectRecoveryDraft(desktopDraft)) {
    if (legacyDraft) removeProjectRecoveryDraft();
    return desktopDraft;
  }
  if (!legacyDraft) return null;

  await saveProjectRecoveryDraft(legacyDraft);
  removeProjectRecoveryDraft();
  return legacyDraft;
}

export async function writePersistedRecoveryDraft(draft: ProjectRecoveryDraft) {
  if (isDesktopRuntime()) {
    await saveProjectRecoveryDraft(draft);
    return;
  }
  if (!writeProjectRecoveryDraft(draft)) {
    throw new Error('浏览器存储空间不足或不可用。');
  }
}

export async function clearPersistedRecoveryDraft(projectPath?: string) {
  if (isDesktopRuntime()) return clearProjectRecoveryDraft(projectPath);
  return removeProjectRecoveryDraft(projectPath);
}
