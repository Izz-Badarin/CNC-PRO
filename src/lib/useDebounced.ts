import { useEffect, useRef, useState } from "react";

/**
 * Returns a value that only updates after `ms` of quiet time.
 * Used to keep expensive work (3D rebuilds, part generation, nesting) off the
 * critical path while the user is dragging a slider or typing in a number field.
 */
export function useDebounced<T>(value: T, ms = 180): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** True while the debounced value is still catching up with the live one. */
export function useIsSettling<T>(live: T, settled: T): boolean {
  return live !== settled;
}

/** Run a callback at most once per animation frame. */
export function useRafThrottle<A extends unknown[]>(fn: (...args: A) => void) {
  const raf = useRef(0);
  const last = useRef<A | null>(null);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return (...args: A) => {
    last.current = args;
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      if (last.current) fn(...last.current);
    });
  };
}
