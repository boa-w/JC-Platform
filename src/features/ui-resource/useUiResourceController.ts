import { open } from '@tauri-apps/plugin-dialog';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addUiResourceOptionDocument,
  parseUiResources,
  parseUiResourcesWithProjectPath,
  removeUiResourceOptionDocument,
  updateUiResourceDocument,
} from '../../api/commands';
import type {
  LoadedProject,
  UiResourceParseReport,
  UiResourceUpdateRequest,
} from '../../types/platform';

export const uiResourcePreviewDocument = {
  ui_info: {
    logo: {
      name: 'logo',
      x: 0,
      y: 0,
      w: 240,
      h: 80,
      handle: 'show',
      default_option: 0,
      dest: 'logo',
      option: ['image/logo.png'],
    },
    main: {
      item: {
        speed: {
          name: '速度表',
          x: 64,
          y: 96,
          w: 180,
          h: 120,
          handle: 'list',
          default_option: 0,
          dest: ['speed_0', 'speed_1'],
          option: [{ list: ['image/main/speed_0.png', 'image/main/speed_1.png'] }],
        },
        gear: {
          name: '档位动画',
          x: 300,
          y: 104,
          w: 160,
          h: 96,
          handle: 'anim',
          default_option: 0,
          dest: 'gear',
          option: [
            { base_name: 'image/anim/gear_', start_index: 0, total: 6, reserved: 2, type: 'png' },
          ],
        },
      },
    },
  },
  pdo_simple_send_recv: { pdo_send: [], pdo_recv: [] },
  pdo_global_param: [],
  pdo_condition: [],
  pdo_recv: [],
  pdo_send: [],
  sdo_info: { type: 0, user_auth: 0, name_index: 0, name: 'root', children: [] },
  language_info: { list_code_language: ['zh'], list_inner: [], list_translate: {} },
};

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

interface UseUiResourceControllerOptions {
  loadedProject: LoadedProject | null;
  applyLoadedProject: (project: LoadedProject) => void;
}

interface UiDocumentMutationResult {
  valid: boolean;
  errors: string[];
  document: unknown;
}

export function useUiResourceController({
  loadedProject,
  applyLoadedProject,
}: UseUiResourceControllerOptions) {
  const [report, setReport] = useState<UiResourceParseReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showCanvasLabels, setShowCanvasLabels] = useState(true);
  const parseGenerationRef = useRef(0);
  const mutationGenerationRef = useRef(0);
  const loadedProjectRef = useRef(loadedProject);
  const projectPath = loadedProject?.summary.path;
  loadedProjectRef.current = loadedProject;

  const refreshPreview = useCallback(async (document: unknown, projectPath?: string) => {
    const generation = ++parseGenerationRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const nextReport = projectPath
        ? await parseUiResourcesWithProjectPath({ project_path: projectPath, document })
        : await parseUiResources(document);
      if (generation === parseGenerationRef.current) setReport(nextReport);
      return nextReport;
    } catch (cause) {
      if (generation === parseGenerationRef.current && isTauriRuntime()) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
      return null;
    } finally {
      if (generation === parseGenerationRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    parseGenerationRef.current += 1;
    setReport(null);
    setError(null);
    setIsLoading(false);
    if (!projectPath) void refreshPreview(uiResourcePreviewDocument);
  }, [projectPath, refreshPreview]);

  useEffect(() => {
    loadedProjectRef.current = loadedProject;
    mutationGenerationRef.current += 1;
    setIsApplying(false);
  }, [loadedProject]);

  async function runDocumentMutation(
    mutate: (document: unknown) => Promise<UiDocumentMutationResult>,
    invalidMessage: string,
  ) {
    const targetProject = loadedProject;
    if (!targetProject) return;

    const targetDocument = targetProject.document;
    const generation = ++mutationGenerationRef.current;
    setIsApplying(true);
    setError(null);
    try {
      const next = await mutate(targetDocument);
      if (
        generation !== mutationGenerationRef.current ||
        targetDocument !== loadedProjectRef.current?.document
      ) {
        return;
      }
      if (!next.valid) {
        setError(next.errors.join('；') || invalidMessage);
        return;
      }
      applyLoadedProject({ ...targetProject, document: next.document });
      await refreshPreview(next.document, targetProject.summary.path);
    } catch (cause) {
      if (generation === mutationGenerationRef.current) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (generation === mutationGenerationRef.current) setIsApplying(false);
    }
  }

  async function applyResource(resource: Omit<UiResourceUpdateRequest, 'document'>) {
    await runDocumentMutation(
      (document) => updateUiResourceDocument({ document, ...resource }),
      'UI 资源写回失败',
    );
  }

  async function selectOptionSources() {
    setError(null);
    if (!isTauriRuntime()) {
      setError('系统文件选择器只能在 Tauri 桌面应用中使用。');
      return [];
    }
    const selected = await open({
      multiple: true,
      filters: [{ name: '图片资源', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'] }],
    });
    if (Array.isArray(selected)) return selected;
    return typeof selected === 'string' ? [selected] : [];
  }

  async function addOption(key: string, sources: string[]) {
    await runDocumentMutation(
      (document) => addUiResourceOptionDocument({ document, key, sources }),
      'UI 资源选项新增失败',
    );
  }

  async function removeOption(key: string, optionIndex: number) {
    await runDocumentMutation(
      (document) => removeUiResourceOptionDocument({ document, key, option_index: optionIndex }),
      'UI 资源选项删除失败',
    );
  }

  return {
    error,
    isApplying,
    isLoading,
    report,
    showCanvasLabels,
    addOption,
    applyResource,
    refreshPreview,
    removeOption,
    selectOptionSources,
    toggleCanvasLabels: () => setShowCanvasLabels((visible) => !visible),
  };
}

export type UiResourceController = ReturnType<typeof useUiResourceController>;
