import { defaultExportInfo } from '../project-document/projectDocumentDefaults.ts';
import type { ProjectExportSettings, ProjectExportTargetSettings } from '../../types/platform';

export const defaultProjectExportSettings: ProjectExportSettings = defaultExportInfo;

function configuredName(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function configuredFlag(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function configuredTarget(value: unknown, fallback: ProjectExportTargetSettings) {
  const source = value as Record<string, unknown> | null;
  return {
    config: configuredFlag(source?.config, fallback.config),
    bin: configuredFlag(source?.bin, fallback.bin),
  };
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
    battery_monitor: configuredTarget(
      source?.battery_monitor,
      defaultProjectExportSettings.battery_monitor,
    ),
    fault_code_info: configuredTarget(
      source?.fault_code_info,
      defaultProjectExportSettings.fault_code_info,
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
