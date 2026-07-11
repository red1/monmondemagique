/**
 * Shared resilience helpers: safe parsing, retries, circuit breaker.
 * Keeps the app running on flaky networks and corrupt local storage.
 */

const DEFAULT_RETRY_OPTS = {
  attempts: 3,
  initialDelayMs: 400,
  maxDelayMs: 8000,
  backoffFactor: 2,
  shouldRetry: () => true,
  onRetry: null,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function safeJsonParse(raw, fallback = null) {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

export function isTransientError(error) {
  if (!error) return false;
  const msg = String(error.message || error).toLowerCase();
  return (
    msg.includes('network')
    || msg.includes('timeout')
    || msg.includes('timed out')
    || msg.includes('fetch')
    || msg.includes('connection')
    || msg.includes('socket')
    || msg.includes('econnreset')
    || msg.includes('enotfound')
    || msg.includes('rate limit')
    || msg.includes('débit')
    || msg.includes('503')
    || msg.includes('502')
    || msg.includes('504')
  );
}

export async function withRetry(fn, options = {}) {
  const opts = { ...DEFAULT_RETRY_OPTS, ...options };
  let lastError;
  let delay = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const isLast = attempt >= opts.attempts;
      if (isLast || !opts.shouldRetry(error, attempt)) {
        throw error;
      }
      opts.onRetry?.(error, attempt, delay);
      await sleep(delay);
      delay = Math.min(delay * opts.backoffFactor, opts.maxDelayMs);
    }
  }

  throw lastError;
}

export function createCircuitBreaker(name, {
  failureThreshold = 3,
  resetMs = 60_000,
} = {}) {
  let failures = 0;
  let openedAt = 0;

  return {
    name,
    async exec(fn) {
      if (openedAt && Date.now() - openedAt < resetMs) {
        throw new Error(`${name} temporairement indisponible. Réessaie dans un instant.`);
      }
      if (openedAt && Date.now() - openedAt >= resetMs) {
        failures = 0;
        openedAt = 0;
      }

      try {
        const result = await fn();
        failures = 0;
        return result;
      } catch (error) {
        failures += 1;
        if (failures >= failureThreshold) {
          openedAt = Date.now();
        }
        throw error;
      }
    },
    reset() {
      failures = 0;
      openedAt = 0;
    },
  };
}

export async function safeAsync(fn, fallback = null) {
  try {
    return await fn();
  } catch (_) {
    return fallback;
  }
}
