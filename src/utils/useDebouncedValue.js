import { useEffect, useState } from 'react';

/** Debounce a value — reduces filter/search recomputation while typing. */
export function useDebouncedValue(value, delayMs = 280) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
