import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeJsonParse } from './resilience';

const memory = new Map();
const DEFAULT_TTL_MS = 60_000;

export async function getCachedStorageItem(key, {
  force = false,
  ttlMs = DEFAULT_TTL_MS,
  fallback = null,
} = {}) {
  const entry = memory.get(key);
  if (!force && entry && Date.now() - entry.at < ttlMs) {
    return entry.value;
  }
  const raw = await AsyncStorage.getItem(key);
  const value = raw != null ? safeJsonParse(raw, fallback) : fallback;
  memory.set(key, { value, at: Date.now() });
  return value;
}

export async function getCachedStorageMulti(keys, { force = false, ttlMs = DEFAULT_TTL_MS } = {}) {
  const results = {};
  const toFetch = [];

  keys.forEach((key) => {
    const entry = memory.get(key);
    if (!force && entry && Date.now() - entry.at < ttlMs) {
      results[key] = entry.value;
    } else {
      toFetch.push(key);
    }
  });

  if (toFetch.length) {
    const pairs = await AsyncStorage.multiGet(toFetch);
    pairs.forEach(([key, raw]) => {
      const value = raw != null ? safeJsonParse(raw, null) : null;
      memory.set(key, { value, at: Date.now() });
      results[key] = value;
    });
  }

  return results;
}

export function setCachedStorageItem(key, value) {
  memory.set(key, { value, at: Date.now() });
}

export function invalidateStorageCache(key) {
  memory.delete(key);
}
