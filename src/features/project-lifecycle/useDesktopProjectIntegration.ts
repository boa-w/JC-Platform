import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useRef, useState } from 'react';
import { takePendingProjectPath } from '../../api/commands';
import {
  buildProjectWindowTitle,
  isJcproProjectPath,
  selectDroppedProjectPath,
} from './desktopProjectIntegration';

interface UseDesktopProjectIntegrationOptions {
  projectName?: string;
  projectPath?: string;
  hasUnsavedChanges: boolean;
  onOpenProject: (path: string) => void;
  onStatusChange: (message: string) => void;
}

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function useDesktopProjectIntegration({
  projectName,
  projectPath,
  hasUnsavedChanges,
  onOpenProject,
  onStatusChange,
}: UseDesktopProjectIntegrationOptions) {
  const [isProjectDragActive, setIsProjectDragActive] = useState(false);
  const openProjectRef = useRef(onOpenProject);
  const statusChangeRef = useRef(onStatusChange);
  const lastHandledRef = useRef({ path: '', at: 0 });
  openProjectRef.current = onOpenProject;
  statusChangeRef.current = onStatusChange;

  useEffect(() => {
    const title = buildProjectWindowTitle(projectName, projectPath, hasUnsavedChanges);
    document.title = title;
    if (isTauriRuntime()) {
      void getCurrentWindow()
        .setTitle(title)
        .catch((cause) => {
          statusChangeRef.current(
            `无法更新窗口标题：${cause instanceof Error ? cause.message : String(cause)}`,
          );
        });
    }
  }, [hasUnsavedChanges, projectName, projectPath]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    function openExternalProject(path: string) {
      const normalizedPath = path.trim();
      if (!isJcproProjectPath(normalizedPath)) {
        statusChangeRef.current('仅支持打开 .jcpro 项目文件。');
        return;
      }
      const now = Date.now();
      if (
        normalizedPath === lastHandledRef.current.path &&
        now - lastHandledRef.current.at < 1000
      ) {
        return;
      }
      lastHandledRef.current = { path: normalizedPath, at: now };
      openProjectRef.current(normalizedPath);
    }

    async function bindDesktopEvents() {
      const unlistenOpen = await listen<string>('open-project', (event) =>
        openExternalProject(event.payload),
      );
      if (disposed) {
        unlistenOpen();
        return;
      }
      unlisteners.push(unlistenOpen);

      const unlistenDrop = await getCurrentWindow().onDragDropEvent((event) => {
        if (event.payload.type === 'enter') {
          setIsProjectDragActive(event.payload.paths.some(isJcproProjectPath));
          return;
        }
        if (event.payload.type === 'leave') {
          setIsProjectDragActive(false);
          return;
        }
        if (event.payload.type !== 'drop') return;
        setIsProjectDragActive(false);
        const path = selectDroppedProjectPath(event.payload.paths);
        if (!path) {
          statusChangeRef.current('仅支持拖放 .jcpro 项目文件。');
          return;
        }
        if (event.payload.paths.filter(isJcproProjectPath).length > 1) {
          statusChangeRef.current('一次只能打开一个项目，已打开首个 .jcpro 文件。');
        }
        openExternalProject(path);
      });
      if (disposed) {
        unlistenDrop();
        return;
      }
      unlisteners.push(unlistenDrop);

      const pendingPath = await takePendingProjectPath();
      if (!disposed && pendingPath) openExternalProject(pendingPath);
    }

    void bindDesktopEvents().catch((cause) => {
      if (!disposed) {
        statusChangeRef.current(
          `无法接收系统项目打开请求：${cause instanceof Error ? cause.message : String(cause)}`,
        );
      }
    });

    return () => {
      disposed = true;
      for (const unlisten of unlisteners) unlisten();
    };
  }, []);

  return { isProjectDragActive };
}
