import { useId, useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { ConfirmDialog, ConfirmDialogHost } from '../../components/ConfirmDialog';
import { type TestDataType, testDataLabelKeys } from '../../data/test-data/metadata';
import type { ConfirmDialogController } from '../../hooks/useConfirmDialog';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import {
  type DocumentSectionKey,
  modifiedSectionLabelKeys,
} from '../../modules/documentSections';
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
  const { t } = useTranslation();
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
            <h3 id={saveDialogTitleId}>{t('dashboard.dialogs.save.title')}</h3>
            <p>{t('dashboard.dialogs.save.message')}</p>
            <div className="modal-path">{loadedProject.summary.path}</div>
            {isLegacyJcproProject && hasRefactorOnlyChanges ? (
              <p className="project-open-warning">
                {refactorConfigPath
                  ? t('dashboard.dialogs.save.mountedSidecar', { path: refactorConfigPath })
                  : t('dashboard.dialogs.save.newSidecar')}
              </p>
            ) : null}
            {modifiedSections.length > 0 ? (
              <div className="action-bar-pills">
                {modifiedSections.map((section) => (
                  <span className="action-bar-pill" key={section}>
                    {t(modifiedSectionLabelKeys[section] ?? section)}
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
                {t('common.actions.cancel')}
              </button>
              <button
                className="modal-btn-confirm"
                disabled={isSavingProject}
                onClick={() => void confirmSaveProject()}
                type="button"
              >
                {t(
                  savingProjectAction === 'save'
                    ? 'common.status.saving'
                    : 'dashboard.dialogs.save.confirm',
                )}
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
            <h3 id={testDialogTitleId}>{t('dashboard.dialogs.testData.title')}</h3>
            <p>
              <Trans
                components={{ strong: <strong /> }}
                i18nKey="dashboard.dialogs.testData.message"
                values={{ template: t(testDataLabelKeys[confirmGenerateType]) }}
              />
            </p>
            <div className="modal-actions">
              <button
                className="modal-btn-cancel"
                onClick={onCancelTestData}
                ref={testCancelRef}
                type="button"
              >
                {t('common.actions.cancel')}
              </button>
              <button className="modal-btn-confirm" onClick={confirmGenerateTestData} type="button">
                {t('dashboard.dialogs.testData.confirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showCloseConfirm ? (
        <ConfirmDialog
          cancelLabel={t('dashboard.dialogs.close.continueEditing')}
          confirmLabel={t('dashboard.dialogs.close.discardAndClose')}
          danger
          message={t('dashboard.dialogs.close.message')}
          onCancel={onCancelClose}
          onConfirm={onConfirmClose}
          title={t('dashboard.dialogs.close.title')}
        />
      ) : null}

      <ConfirmDialogHost controller={discardConfirmation} />
      <ConfirmDialogHost controller={restoreConfirmation} />
      <ProjectRecoveryDialog controller={projectRecovery} />
    </>
  );
}
