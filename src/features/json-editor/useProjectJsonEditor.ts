import { useCallback, useEffect, useState } from 'react';
import {
  advancedConfigSections,
  configSectionForEditor,
  jsonEditorKeyForModule,
  languageSectionForDocument,
  restorePathsForEditor,
} from '../../modules/documentSections';
import type { LoadedProject, NavigationKey } from '../../types/platform';
import type { ProjectDocumentController } from '../project-document';
import type { PdoEditorMode } from '../realtime-data/usePdoEditor';

interface UseProjectJsonEditorOptions {
  activeModuleKey: NavigationKey;
  canOpen: boolean;
  loadedProject: LoadedProject | null;
  realtimeMode: PdoEditorMode;
  restoreProjectPaths: ProjectDocumentController['restoreProjectPaths'];
  updateProjectSections: ProjectDocumentController['updateProjectSections'];
}

export function useProjectJsonEditor({
  activeModuleKey,
  canOpen,
  loadedProject,
  realtimeMode,
  restoreProjectPaths,
  updateProjectSections,
}: UseProjectJsonEditorOptions) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const currentSection = useCallback(() => {
    if (!loadedProject) return null;
    const source = loadedProject.document as Record<string, unknown>;
    return configSectionForEditor(
      source,
      activeModuleKey,
      {
        realtimeMode,
        configVersion: typeof source.config_version === 'string' ? source.config_version : undefined,
      },
    );
  }, [activeModuleKey, loadedProject, realtimeMode]);

  useEffect(() => {
    if (!canOpen) {
      setOpen(false);
      return;
    }
    if (activeModuleKey === 'fault-code') {
      setOpen(false);
      return;
    }
    setText(JSON.stringify(currentSection(), null, 2));
    setError(null);
  }, [activeModuleKey, canOpen, currentSection]);

  function format() {
    setText(JSON.stringify(currentSection(), null, 2));
    setError(null);
  }

  function restore() {
    const currentDocument = loadedProject?.document as Record<string, unknown> | undefined;
    const context = {
      realtimeMode,
      configVersion:
        typeof currentDocument?.config_version === 'string'
          ? currentDocument.config_version
          : undefined,
    };
    const document = restoreProjectPaths(
      restorePathsForEditor(activeModuleKey, context, currentDocument),
    );
    if (!document) return;
    const nextDocument = document as Record<string, unknown>;
    const section = configSectionForEditor(nextDocument, activeModuleKey, {
      ...context,
      configVersion:
        typeof nextDocument.config_version === 'string' ? nextDocument.config_version : undefined,
    });
    setText(JSON.stringify(section, null, 2));
    setError(null);
  }

  function apply() {
    if (!loadedProject) return;

    try {
      const parsed = JSON.parse(text);
      const currentDocument = loadedProject.document as Record<string, unknown>;
      const editorKey = jsonEditorKeyForModule(activeModuleKey, {
        realtimeMode,
        configVersion:
          typeof currentDocument.config_version === 'string'
            ? currentDocument.config_version
            : undefined,
      });
      const sections: Record<string, unknown> = {};
      if (editorKey === 'sdo') sections.sdo_info = parsed;
      if (editorKey === 'pdo-simple') sections.pdo_simple_send_recv = parsed;
      if (activeModuleKey === 'canopen-export') sections.canopen = parsed;
      if (activeModuleKey === 'language') {
        sections[languageSectionForDocument(currentDocument)] = parsed;
      }
      if (activeModuleKey === 'battery-monitor') sections.battery_monitor = parsed;
      if (activeModuleKey === 'signal-dictionary') sections.signal_dictionary = parsed;
      if (activeModuleKey === 'private-protocol') sections.private_protocol = parsed;
      if (activeModuleKey === 'protocol-mapping') sections.protocol_mapping = parsed;
      if (editorKey === 'pdo-advanced') {
        for (const section of advancedConfigSections) sections[section] = parsed?.[section];
      }
      if (Object.keys(sections).length === 0) {
        throw new Error('当前页面没有可编辑的 JSON 配置段');
      }
      updateProjectSections(sections);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return {
    apply,
    close: () => setOpen(false),
    error,
    format,
    open,
    restore,
    setText,
    text,
    toggle: () => {
      if (canOpen) setOpen((visible) => !visible);
    },
  };
}
