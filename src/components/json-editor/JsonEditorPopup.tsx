import { GripHorizontal } from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';

interface JsonEditorPopupProps {
  open: boolean;
  text: string;
  error: string | null;
  canRestore: boolean;
  onTextChange: (text: string) => void;
  onFormat: () => void;
  onRestore: () => void;
  onApply: () => void;
  onClose: () => void;
}

export function JsonEditorPopup({
  open,
  text,
  error,
  canRestore,
  onTextChange,
  onFormat,
  onRestore,
  onApply,
  onClose,
}: JsonEditorPopupProps) {
  const [size, setSize] = useState({ w: 520, h: 420 });
  const [position, setPosition] = useState({ x: 0, y: 64 });
  const initialized = useRef(false);

  useEffect(() => {
    if (open && !initialized.current) {
      setPosition({ x: Math.max(0, window.innerWidth - 12 - size.w), y: 64 });
      initialized.current = true;
    }
    if (!open) initialized.current = false;
  }, [open, size.w]);

  function handleResizeStart(event: ReactMouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startSize = size;

    function onMouseMove(moveEvent: MouseEvent) {
      const width = Math.max(
        360,
        Math.min(startSize.w + moveEvent.clientX - startX, window.innerWidth - position.x - 12),
      );
      const height = Math.max(
        240,
        Math.min(startSize.h + moveEvent.clientY - startY, window.innerHeight - position.y - 12),
      );
      setSize({ w: width, h: height });
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'nwse-resize';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function handleDragStart(event: ReactMouseEvent) {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startPosition = position;

    function onMouseMove(moveEvent: MouseEvent) {
      setPosition({
        x: Math.max(
          0,
          Math.min(startPosition.x + moveEvent.clientX - startX, window.innerWidth - size.w),
        ),
        y: Math.max(
          0,
          Math.min(startPosition.y + moveEvent.clientY - startY, window.innerHeight - 60),
        ),
      });
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'move';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  if (!open) return null;

  return (
    <>
      <div
        className="json-popup"
        style={{ left: position.x, top: position.y, width: size.w, height: size.h }}
      >
        <div className="json-popup-header">
          <div className="json-popup-title">
            <button
              aria-label="拖动 JSON 编辑器"
              className="json-popup-drag-handle"
              onKeyDown={(event) => {
                const offsets: Record<string, [number, number]> = {
                  ArrowLeft: [-10, 0],
                  ArrowRight: [10, 0],
                  ArrowUp: [0, -10],
                  ArrowDown: [0, 10],
                };
                const offset = offsets[event.key];
                if (!offset) return;
                event.preventDefault();
                setPosition((current) => ({
                  x: Math.max(0, current.x + offset[0]),
                  y: Math.max(0, current.y + offset[1]),
                }));
              }}
              onMouseDown={handleDragStart}
              title="拖动编辑器；聚焦后可使用方向键移动"
              type="button"
            >
              <GripHorizontal aria-hidden="true" size={16} />
            </button>
            <strong>JSON 编辑器</strong>
          </div>
          <div className="json-popup-actions">
            <button className="lang-btn" onClick={onFormat} type="button">
              格式化
            </button>
            <button className="lang-btn" disabled={!canRestore} onClick={onRestore} type="button">
              恢复段落
            </button>
            <button className="lang-btn lang-btn--primary" onClick={onApply} type="button">
              应用
            </button>
            <button
              className="lang-btn lang-btn--icon"
              onClick={onClose}
              title="关闭"
              type="button"
            >
              ×
            </button>
          </div>
        </div>
        <textarea
          aria-label="JSON 配置内容"
          className="json-popup-editor"
          onChange={(event) => onTextChange(event.target.value)}
          value={text}
        />
        {error ? (
          <p className="json-popup-error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          aria-label="调整 JSON 编辑器大小"
          className="json-popup-resize-handle"
          onKeyDown={(event) => {
            const offsets: Record<string, [number, number]> = {
              ArrowLeft: [-10, 0],
              ArrowRight: [10, 0],
              ArrowUp: [0, -10],
              ArrowDown: [0, 10],
            };
            const offset = offsets[event.key];
            if (!offset) return;
            event.preventDefault();
            setSize((current) => ({
              w: Math.max(360, current.w + offset[0]),
              h: Math.max(260, current.h + offset[1]),
            }));
          }}
          onMouseDown={handleResizeStart}
          title="拖动调整大小；聚焦后可使用方向键调整"
          type="button"
        />
      </div>

      <div className="json-active-banner">
        <span>JSON 编辑器已打开，配置项编辑已锁定</span>
        <button onClick={onClose} type="button">
          关闭编辑器
        </button>
      </div>
    </>
  );
}
