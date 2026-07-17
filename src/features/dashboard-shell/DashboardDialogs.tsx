import { useEffect, useRef } from 'react';
import { testDataLabels, type TestDataType } from '../../data/test-data';
import { modifiedSectionLabels, type DocumentSectionKey } from '../../modules/documentSections';
import type { LoadedProject } from '../../types/platform';

interface DashboardDialogsProps {
  loadedProject: LoadedProject | null;
  showSaveModal: boolean;
  isSavingProject: boolean;
  savingProjectAction: 'save' | 'saveAs' | null;
  isLegacyJcproProject: boolean;
  hasRefactorOnlyChanges: boolean;
  refactorConfigPath: string | null;
  modifiedSections: DocumentSectionKey[];
  confirmGenerateType: TestDataType | null;
  onCancelSave: () => void;
  onConfirmSave: () => void | Promise<void>;
  onCancelTestData: () => void;
  onConfirmTestData: () => void;
}

export function DashboardDialogs({
  loadedProject,
  showSaveModal,
  isSavingProject,
  savingProjectAction,
  isLegacyJcproProject,
  hasRefactorOnlyChanges,
  refactorConfigPath,
  modifiedSections,
  confirmGenerateType,
  onCancelSave: cancelSaveProject,
  onConfirmSave: confirmSaveProject,
  onCancelTestData,
  onConfirmTestData: confirmGenerateTestData,
}: DashboardDialogsProps) {
  const saveCancelRef = useRef<HTMLButtonElement | null>(null);
  const testCancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (showSaveModal && loadedProject) saveCancelRef.current?.focus();
    else if (confirmGenerateType) testCancelRef.current?.focus();
  }, [confirmGenerateType, loadedProject, showSaveModal]);

  useEffect(() => {
    if (!showSaveModal && !confirmGenerateType) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (confirmGenerateType) onCancelTestData();
      else if (!isSavingProject) cancelSaveProject();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    cancelSaveProject,
    confirmGenerateType,
    isSavingProject,
    onCancelTestData,
    showSaveModal,
  ]);

  return (
    <>
      {showSaveModal && loadedProject ? (
        <div className="modal-overlay">
          <div
            aria-labelledby="save-project-dialog-title"
            aria-modal="true"
            className="modal-box"
            role="dialog"
          >
            <h3 id="save-project-dialog-title">确认保存</h3>
            <p>将当前所有配置修改写入项目文件：</p>
            <div className="modal-path">{loadedProject.summary.path}</div>
            {isLegacyJcproProject && hasRefactorOnlyChanges ? (
              <p className="project-open-warning">
                {refactorConfigPath
                  ? `检测到重构专属配置修改，将写回已挂载 JSON：${refactorConfigPath}；原 .jcpro 只保存兼容字段。`
                  : '检测到重构专属配置修改，将创建独立 JSON sidecar；原 .jcpro 只保存兼容字段。'}
              </p>
            ) : null}
            {modifiedSections.length > 0 ? (
              <div className="action-bar-pills">
                {modifiedSections.map((section) => (
                  <span className="action-bar-pill" key={section}>
                    {modifiedSectionLabels[section] ?? section}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="modal-actions">
              <button
                className="modal-btn-cancel"
                disabled={isSavingProject}
                ref={saveCancelRef}
                onClick={cancelSaveProject}
                type="button"
              >
                取消
              </button>
              <button
                className="modal-btn-confirm"
                disabled={isSavingProject}
                onClick={() => void confirmSaveProject()}
                type="button"
              >
                {savingProjectAction === 'save' ? '保存中...' : '确认保存'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmGenerateType ? (
        <div className="modal-overlay">
          <div
            aria-labelledby="generate-test-dialog-title"
            aria-modal="true"
            className="modal-box"
            role="dialog"
          >
            <h3 id="generate-test-dialog-title">确认生成测试数据</h3>
            <p>
              将使用 <strong>{testDataLabels[confirmGenerateType]}</strong>{' '}
              模板覆盖当前配置，是否继续？
            </p>
            <div className="modal-actions">
              <button
                className="modal-btn-cancel"
                onClick={onCancelTestData}
                ref={testCancelRef}
                type="button"
              >
                取消
              </button>
              <button className="modal-btn-confirm" onClick={confirmGenerateTestData} type="button">
                确认生成
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
