import { useCallback, useEffect, useRef, useState } from 'react';

export interface ConfirmDialogRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface ConfirmDialogController {
  request: ConfirmDialogRequest | null;
  ask: (request: ConfirmDialogRequest) => Promise<boolean>;
  confirm: () => void;
  cancel: () => void;
}

export function useConfirmDialog(): ConfirmDialogController {
  const [request, setRequest] = useState<ConfirmDialogRequest | null>(null);
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setRequest(null);
    resolve?.(confirmed);
  }, []);

  const ask = useCallback((nextRequest: ConfirmDialogRequest) => {
    resolverRef.current?.(false);
    setRequest(nextRequest);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  useEffect(
    () => () => {
      resolverRef.current?.(false);
      resolverRef.current = null;
    },
    [],
  );

  return {
    request,
    ask,
    confirm: useCallback(() => settle(true), [settle]),
    cancel: useCallback(() => settle(false), [settle]),
  };
}
