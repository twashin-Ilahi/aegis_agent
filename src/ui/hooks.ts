import { useCallback, useState } from 'react';

/** Wraps an async action with busy and error state so buttons never fail silently. */
export function useAsync() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (name: string, fn: () => Promise<unknown> | unknown) => {
    setBusy(name);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, []);
  return { busy, error, run, clear: () => setError(null) };
}
