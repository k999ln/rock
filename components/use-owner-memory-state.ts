'use client';
import { useCallback, useRef, useState, type SetStateAction } from 'react';

/** Private drafts stay in memory under the owner who entered them. Old event
 * closures cannot edit the currently displayed account after reauthentication. */
export function useOwnerMemoryState<T>(owner: string | null, currentOwner: { current: string | null }, initial: T) {
  const [empty] = useState(initial);
  const [values, setValues] = useState<Record<string, T>>({});
  const [identity, setIdentity] = useState({});
  const currentIdentity = useRef(identity);
  const setValue = useCallback((next: SetStateAction<T>, author = owner) => {
    if (!author || currentOwner.current !== author) return;
    const token = {}; currentIdentity.current = token; setIdentity(token);
    setValues((current) => ({ ...current, [author]: typeof next === 'function'
      ? (next as (previous: T) => T)(current[author] ?? empty) : next }));
  }, [currentOwner, empty, owner]);
  return [owner ? values[owner] ?? empty : empty, setValue, values, () => currentIdentity.current === identity] as const;
}

