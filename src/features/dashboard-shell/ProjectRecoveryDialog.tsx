import { useId, useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import type { ProjectRecoveryDraftController } from '../project-document';

function formatRecoveryTime(value: string, locale: string, unknownTime: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return unknownTime;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date);
}

export function ProjectRecoveryDialog({
  controller,
}: {
  controller: ProjectRecoveryDraftController;
}) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const dismissRef = useRef<HTMLButtonElement | null>(null);
  const { candidate, isDiscarding, isRestoring, restoreError } = controller;
  const isBusy = isDiscarding || isRestoring;

  useDialogFocus({
    active: Boolean(candidate),
    containerRef: dialogRef,
    initialFocusRef: dismissRef,
    onEscape: () => {
      if (!isBusy) controller.dismissCandidate();
    },
  });

  if (!candidate) return null;

  return (
    <div className="modal-overlay">
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="modal-box"
        ref={dialogRef}
        role="dialog"
      >
        <h3 id={titleId}>{t('dashboard.recoveryDialog.title')}</h3>
        <p id={descriptionId}>
          <Trans
            components={{ strong: <strong /> }}
            i18nKey="dashboard.recoveryDialog.message"
            values={{
              project: candidate.projectName || t('dashboard.recoveryDialog.unnamedProject'),
              time: formatRecoveryTime(
                candidate.savedAt,
                i18n.resolvedLanguage ?? i18n.language,
                t('dashboard.recoveryDialog.unknownTime'),
              ),
            }}
          />
        </p>
        <div className="modal-path">{candidate.projectPath}</div>
        {restoreError ? (
          <p className="project-open-error" role="alert">
            {restoreError}
          </p>
        ) : null}
        <div className="modal-actions">
          <button
            className="modal-btn-cancel"
            disabled={isBusy}
            onClick={controller.dismissCandidate}
            ref={dismissRef}
            type="button"
          >
            {t('dashboard.recoveryDialog.later')}
          </button>
          <button
            className="modal-btn-confirm modal-btn-danger"
            disabled={isBusy}
            onClick={() => void controller.discardCandidate()}
            type="button"
          >
            {t(
              isDiscarding
                ? 'common.status.deleting'
                : 'dashboard.recoveryDialog.discardDraft',
            )}
          </button>
          <button
            className="modal-btn-confirm"
            disabled={isBusy}
            onClick={() => void controller.restoreCandidate()}
            type="button"
          >
            {t(
              isRestoring
                ? 'common.status.restoring'
                : 'dashboard.recoveryDialog.restoreDraft',
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
