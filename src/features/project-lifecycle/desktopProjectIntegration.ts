const projectExtension = '.jcpro';
const applicationTitle = '自定义开发平台';

export function isJcproProjectPath(path: string) {
  return path.trim().toLowerCase().endsWith(projectExtension);
}

export function selectDroppedProjectPath(paths: string[]) {
  return paths.find(isJcproProjectPath) ?? null;
}

export function projectDisplayName(name?: string, path?: string) {
  const trimmedName = name?.trim();
  if (trimmedName) return trimmedName;
  const fileName = path?.split(/[\\/]/).pop()?.trim();
  return fileName?.replace(/\.jcpro$/i, '') || '';
}

export function buildProjectWindowTitle(name?: string, path?: string, hasUnsavedChanges = false) {
  const displayName = projectDisplayName(name, path);
  if (!displayName) return applicationTitle;
  return `${hasUnsavedChanges ? '* ' : ''}${displayName} - ${applicationTitle}`;
}
