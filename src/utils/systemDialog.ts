export async function runSystemDialog<T>(
  operation: () => Promise<T>,
  onError: (message: string) => void,
): Promise<T | null> {
  try {
    return await operation();
  } catch (cause) {
    onError(cause instanceof Error ? cause.message : String(cause));
    return null;
  }
}
