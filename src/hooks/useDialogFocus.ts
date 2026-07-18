import { type RefObject, useLayoutEffect, useRef } from 'react';

interface UseDialogFocusOptions {
  active: boolean;
  containerRef: RefObject<HTMLElement | null>;
  initialFocusRef: RefObject<HTMLElement | null>;
  onEscape: () => void;
  trapFocus?: boolean;
}

const focusableSelector = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const activeDialogStack: symbol[] = [];

export function useDialogFocus({
  active,
  containerRef,
  initialFocusRef,
  onEscape,
  trapFocus = true,
}: UseDialogFocusOptions) {
  const onEscapeRef = useRef(onEscape);
  const dialogTokenRef = useRef(Symbol('dialog'));
  onEscapeRef.current = onEscape;

  useLayoutEffect(() => {
    if (!active) return;
    const dialogToken = dialogTokenRef.current;
    activeDialogStack.push(dialogToken);
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => initialFocusRef.current?.focus());

    function handleKeyDown(event: KeyboardEvent) {
      if (activeDialogStack[activeDialogStack.length - 1] !== dialogToken) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onEscapeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !trapFocus) return;

      const container = containerRef.current;
      if (!container) return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true',
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !container.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      const stackIndex = activeDialogStack.lastIndexOf(dialogToken);
      if (stackIndex >= 0) activeDialogStack.splice(stackIndex, 1);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [active, containerRef, initialFocusRef, trapFocus]);
}
