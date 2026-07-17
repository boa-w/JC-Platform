import { useEffect, useRef } from 'react';

export interface OperationToken<T> {
  generation: number;
  identity: T;
}

export function useOperationGuard<T>(identity: T) {
  const identityRef = useRef(identity);
  const generationRef = useRef(0);
  identityRef.current = identity;

  useEffect(() => {
    identityRef.current = identity;
    generationRef.current += 1;
  }, [identity]);

  function begin(): OperationToken<T> {
    return { generation: ++generationRef.current, identity };
  }

  function isCurrent(token: OperationToken<T>) {
    return token.generation === generationRef.current && token.identity === identityRef.current;
  }

  return { begin, isCurrent };
}
