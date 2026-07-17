import { useCallback, useEffect, useState } from 'react';
import {
  advancedConfigSections,
  configSectionForEditor,
  jsonEditorKeyForModule,
  restorePathsForEditor,
} from '../../modules/documentSections';
import type { LoadedProject, NavigationKey } from '../../types/platform';
import type { ProjectDocumentController } from '../project-document';
import type { PdoEditorMode } from '../realtime-data/usePdoEditor';

interface UseProjectJsonEditorOptions {
  activeModuleKey: NavigationKey;
  applyLoadedProject: ProjectDocumentController['applyLoadedProject'];
  loadedProject: LoadedProject | null;
  realtimeMode: PdoEditorMode;
  restoreProjectPaths: ProjectDocumentController['restoreProjectPaths'];
}

export function useProjectJsonEditor({
  activeModuleKey,
  applyLoadedProject,
  loadedProject,
  realtimeMode,
  restoreProjectPaths,
}: UseProjectJsonEditorOptions) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const currentSection = useCallback(() => {
    if (!loadedProject) return null;
    return configSectionForEditor(
      loadedProject.document as Record<string, unknown>,
      activeModuleKey,
      { realtimeMode },
    );
  }, [activeModuleKey, loadedProject, realtimeMode]);

  useEffect(() => {
    if (activeModuleKey === 'fault-code') {
      setOpen(false);
      return;
    }
    setText(JSON.stringify(currentSection(), null, 2));
    setError(null);
  }, [activeModuleKey, currentSection]);

  function format() {
    setText(JSON.stringify(currentSection(), null, 2));
    setError(null);
  }

  function restore() {
    const document = restoreProjectPaths(restorePathsForEditor(activeModuleKey, { realtimeMode }));
    if (!document) return;
    const section = configSectionForEditor(document as Record<string, unknown>, activeModuleKey, {
      realtimeMode,
    });
    setText(JSON.stringify(section, null, 2));
    setError(null);
  }

  function apply() {
    if (!loadedProject) return;

    try {
      const parsed = JSON.parse(text);
      const document = { ...(loadedProject.document as Record<string, unknown>) };
      const editorKey = jsonEditorKeyForModule(activeModuleKey, { realtimeMode });
      if (editorKey === 'sdo') document.sdo_info = parsed;
      if (editorKey === 'pdo-simple') document.pdo_simple_send_recv = parsed;
      if (activeModuleKey === 'language') document.language_info = parsed;
      if (activeModuleKey === 'battery-protocol') document.battery_protocol = parsed;
      if (activeModuleKey === 'battery-monitor') document.battery_monitor_info = parsed;
      if (activeModuleKey === 'signal-dictionary') document.signal_dictionary = parsed;
      if (activeModuleKey === 'private-protocol') document.private_protocol = parsed;
      if (activeModuleKey === 'protocol-mapping') document.protocol_mapping = parsed;
      if (editorKey === 'pdo-advanced') {
        for (const section of advancedConfigSections) document[section] = parsed?.[section];
      }
      applyLoadedProject({ ...loadedProject, document });
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
    toggle: () => setOpen((visible) => !visible),
  };
}
