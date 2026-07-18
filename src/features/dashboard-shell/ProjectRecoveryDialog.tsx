import { useId, useRef } from 'react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import type { ProjectRecoveryDraftController } from '../project-document';

function formatRecoveryTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date);
}

export function ProjectRecoveryDialog({
  controller,
}: {
  controller: ProjectRecoveryDraftController;
}) {
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
        <h3 id={titleId}>恢复未保存修改</h3>
        <p id={descriptionId}>
          检测到 <strong>{candidate.projectName || '未命名项目'}</strong> 在{' '}
          {formatRecoveryTime(candidate.savedAt)} 保存的恢复草稿。
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
            稍后
          </button>
          <button
            className="modal-btn-confirm modal-btn-danger"
            disabled={isBusy}
            onClick={() => void controller.discardCandidate()}
            type="button"
          >
            {isDiscarding ? '删除中...' : '放弃草稿'}
          </button>
          <button
            className="modal-btn-confirm"
            disabled={isBusy}
            onClick={() => void controller.restoreCandidate()}
            type="button"
          >
            {isRestoring ? '恢复中...' : '恢复草稿'}
          </button>
        </div>
      </div>
    </div>
  );
}
