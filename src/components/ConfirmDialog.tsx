import { useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConfirmDialogController } from '../hooks/useConfirmDialog';
import { useDialogFocus } from '../hooks/useDialogFocus';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const messageId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useDialogFocus({
    active: true,
    containerRef: dialogRef,
    initialFocusRef: cancelButtonRef,
    onEscape: onCancel,
  });

  return (
    <div className="modal-overlay">
      <div
        aria-describedby={messageId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="modal-box"
        ref={dialogRef}
        role="dialog"
      >
        <h3 id={titleId}>{title}</h3>
        <p id={messageId}>{message}</p>
        <div className="modal-actions">
          <button
            className="modal-btn-cancel"
            onClick={onCancel}
            ref={cancelButtonRef}
            type="button"
          >
            {cancelLabel ?? t('common.actions.cancel')}
          </button>
          <button
            className={`modal-btn-confirm ${danger ? 'modal-btn-danger' : ''}`}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel ?? t('common.actions.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConfirmDialogHost({ controller }: { controller: ConfirmDialogController }) {
  if (!controller.request) return null;

  return (
    <ConfirmDialog
      {...controller.request}
      onCancel={controller.cancel}
      onConfirm={controller.confirm}
    />
  );
}
