import { useId, useRef } from 'react';
import { ConfirmDialog, ConfirmDialogHost } from '../../components/ConfirmDialog';
import { type TestDataType, testDataLabels } from '../../data/test-data/metadata';
import type { ConfirmDialogController } from '../../hooks/useConfirmDialog';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { type DocumentSectionKey, modifiedSectionLabels } from '../../modules/documentSections';
import type { LoadedProject } from '../../types/platform';
import type { ProjectRecoveryDraftController } from '../project-document';
import { ProjectRecoveryDialog } from './ProjectRecoveryDialog';

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
  showCloseConfirm: boolean;
  discardConfirmation: ConfirmDialogController;
  restoreConfirmation: ConfirmDialogController;
  projectRecovery: ProjectRecoveryDraftController;
  onCancelSave: () => void;
  onConfirmSave: () => void | Promise<void>;
  onCancelTestData: () => void;
  onConfirmTestData: () => void;
  onCancelClose: () => void;
  onConfirmClose: () => void | Promise<void>;
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
  showCloseConfirm,
  discardConfirmation,
  restoreConfirmation,
  projectRecovery,
  onCancelSave: cancelSaveProject,
  onConfirmSave: confirmSaveProject,
  onCancelTestData,
  onConfirmTestData: confirmGenerateTestData,
  onCancelClose,
  onConfirmClose,
}: DashboardDialogsProps) {
  const saveDialogTitleId = useId();
  const testDialogTitleId = useId();
  const saveCancelRef = useRef<HTMLButtonElement | null>(null);
  const testCancelRef = useRef<HTMLButtonElement | null>(null);
  const saveDialogRef = useRef<HTMLDivElement | null>(null);
  const testDialogRef = useRef<HTMLDivElement | null>(null);

  useDialogFocus({
    active: showSaveModal && Boolean(loadedProject),
    containerRef: saveDialogRef,
    initialFocusRef: saveCancelRef,
    onEscape: () => {
      if (!isSavingProject) cancelSaveProject();
    },
  });
  useDialogFocus({
    active: Boolean(confirmGenerateType),
    containerRef: testDialogRef,
    initialFocusRef: testCancelRef,
    onEscape: onCancelTestData,
  });

  return (
    <>
      {showSaveModal && loadedProject ? (
        <div className="modal-overlay">
          <div
            aria-labelledby={saveDialogTitleId}
            aria-modal="true"
            className="modal-box"
            ref={saveDialogRef}
            role="dialog"
          >
            <h3 id={saveDialogTitleId}>确认保存</h3>
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
            aria-labelledby={testDialogTitleId}
            aria-modal="true"
            className="modal-box"
            ref={testDialogRef}
            role="dialog"
          >
            <h3 id={testDialogTitleId}>确认生成测试数据</h3>
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

      {showCloseConfirm ? (
        <ConfirmDialog
          cancelLabel="继续编辑"
          confirmLabel="放弃并关闭"
          danger
          message="当前项目存在未保存修改。关闭应用将永久放弃这些修改。"
          onCancel={onCancelClose}
          onConfirm={onConfirmClose}
          title="放弃未保存修改？"
        />
      ) : null}

      <ConfirmDialogHost controller={discardConfirmation} />
      <ConfirmDialogHost controller={restoreConfirmation} />
      <ProjectRecoveryDialog controller={projectRecovery} />
    </>
  );
}
