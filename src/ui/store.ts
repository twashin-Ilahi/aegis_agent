import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Engine } from '../core/engine';

const safe = <T>(f: () => T): T | undefined => {
  try {
    return f();
  } catch {
    return undefined;
  }
};

export const engine = new Engine({
  storage: safe(() => window.localStorage),
  sessionStorage: safe(() => window.sessionStorage),
  fetchImpl: (...a) => fetch(...a),
  intentMinIntervalMs: 700,
});

export function useEngine(): Engine {
  useSyncExternalStore(engine.subscribe, engine.getVersion);
  return engine;
}

/** Drives engine.tick() on an interval while "live" is on. */
export function useRunLoop(intervalMs = 1200) {
  const [live, setLive] = useState(false);
  const busy = useRef(false);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        await engine.tick();
      } finally {
        busy.current = false;
      }
    }, intervalMs);
    return () => clearInterval(id);
  }, [live, intervalMs]);
  return { live, setLive };
}

export const fmtTime = (sec: number) => new Date(sec * 1000).toISOString().slice(11, 19) + 'Z';
export const fmtDateTime = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 16).replace('T', ' ') + 'Z';
export const short = (h?: string, n = 6) => (h ? `${h.slice(0, n + 2)}…${h.slice(-4)}` : '');
