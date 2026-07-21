import type { ProjectExportSettings } from '../../types/platform';

export const defaultProjectExportSettings: ProjectExportSettings = {
  folder_name: 'jc_export',
  manifest_filename: 'ConfigUpdate.json',
  binary_filename: 'pdo_sdo_data.bin',
};

function configuredName(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

export function readProjectExportSettings(document: unknown): ProjectExportSettings {
  const source = (document as { export_info?: Record<string, unknown> } | null)?.export_info;
  return {
    folder_name: configuredName(source?.folder_name, defaultProjectExportSettings.folder_name),
    manifest_filename: configuredName(
      source?.manifest_filename,
      defaultProjectExportSettings.manifest_filename,
    ),
    binary_filename: configuredName(
      source?.binary_filename,
      defaultProjectExportSettings.binary_filename,
    ),
  };
}

export function projectDirectory(projectPath?: string) {
  if (!projectPath?.trim()) return '';
  const normalized = projectPath.trim().replace(/[/\\]+$/, '');
  const separator = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  if (separator < 0) return '.';
  if (separator === 0) return normalized.slice(0, 1);
  if (separator === 2 && /^[A-Za-z]:/.test(normalized)) return normalized.slice(0, 3);
  return normalized.slice(0, separator);
}
