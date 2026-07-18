import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { AppState } from 'react-native';
import {
  getCachedDownloadedStories,
  getDownloadedStories,
  getPackUsageCounts,
  getPlayableStories,
  getStoryFilterOptions,
  isActiveDownloadInProgress,
  isStoriesLibraryFresh,
  refreshSharedDownloads,
  subscribeStoriesLibrary,
  warmLibraryCache,
} from '../src/services/storyService';
import { isSharedMediaCacheFresh } from '../src/services/sharedMediaService';

const AppBootstrapContext = createContext(null);

function metaFingerprint(meta) {
  if (!meta) return '0';
  const keys = Object.keys(meta);
  return `${keys.length}:${libraryUpdatedHint(meta)}`;
}

function libraryUpdatedHint(meta) {
  let max = 0;
  for (const story of Object.values(meta)) {
    const t = story?.updatedAt || story?.downloadedAt || 0;
    if (t > max) max = t;
  }
  return max;
}

export function AppBootstrapProvider({ children }) {
  const [bootstrapped, setBootstrapped] = useState(false);
  const [libraryMeta, setLibraryMeta] = useState({});
  const [packUsageCounts, setPackUsageCounts] = useState({});
  const appStateRef = useRef(AppState.currentState);
  const refreshInFlightRef = useRef(null);
  const metaFingerprintRef = useRef('0');

  const applyLibrarySnapshot = useCallback((meta, usage) => {
    const nextFp = metaFingerprint(meta);
    if (nextFp !== metaFingerprintRef.current) {
      metaFingerprintRef.current = nextFp;
      setLibraryMeta(meta);
    }
    if (usage) setPackUsageCounts(usage);
  }, []);

  const refreshLibrary = useCallback(async (opts = {}) => {
    const soft = opts.soft === true;
    if (soft && isStoriesLibraryFresh()) {
      const cached = getCachedDownloadedStories();
      if (cached && Object.keys(cached).length > 0) {
        applyLibrarySnapshot(cached, null);
        return cached;
      }
    }
    if (refreshInFlightRef.current) return refreshInFlightRef.current;
    const task = (async () => {
      try {
        const [meta, usage] = await Promise.all([
          getDownloadedStories({ force: !!opts.force }),
          getPackUsageCounts(),
        ]);
        applyLibrarySnapshot(meta, usage);
        return meta;
      } catch (_) {
        return null;
      } finally {
        refreshInFlightRef.current = null;
      }
    })();
    refreshInFlightRef.current = task;
    return task;
  }, [applyLibrarySnapshot]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await warmLibraryCache();
        const [meta, usage] = await Promise.all([
          getDownloadedStories(),
          getPackUsageCounts(),
        ]);
        if (cancelled) return;
        applyLibrarySnapshot(meta, usage);
        getPlayableStories({ syncOnLoad: false }).catch(() => {});
        if (!isSharedMediaCacheFresh()) {
          refreshSharedDownloads()
            .then((updated) => { if (updated && !cancelled) refreshLibrary({ soft: false }); })
            .catch(() => {});
        }
      } catch (_) {
        /* keep empty library */
      } finally {
        if (!cancelled) setBootstrapped(true);
      }
    })();
    return () => { cancelled = true; };
  }, [applyLibrarySnapshot, refreshLibrary]);

  useEffect(() => subscribeStoriesLibrary(() => {
    refreshLibrary({ soft: false }).catch(() => {});
  }), [refreshLibrary]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      const wasBackground = appStateRef.current.match(/inactive|background/);
      appStateRef.current = nextState;
      if (wasBackground && nextState === 'active' && !isActiveDownloadInProgress()) {
        // Soft refresh: use memory cache if still fresh (returning from another app screen
        // within the same process should hit this path rarely; focus handles in-app nav).
        refreshLibrary({ soft: true }).catch(() => {});
        if (!isSharedMediaCacheFresh()) {
          refreshSharedDownloads()
            .then((updated) => { if (updated) refreshLibrary({ soft: false }); })
            .catch(() => {});
        }
      }
    });
    return () => sub.remove();
  }, [refreshLibrary]);

  const playableStories = useMemo(
    () => Object.values(libraryMeta).sort((a, b) => (a.title || '').localeCompare(b.title || '')),
    [libraryMeta],
  );

  const filterOptions = useMemo(
    () => getStoryFilterOptions(playableStories, packUsageCounts),
    [playableStories, packUsageCounts],
  );

  const value = useMemo(() => ({
    bootstrapped,
    libraryMeta,
    playableStories,
    packUsageCounts,
    filterOptions,
    refreshLibrary,
    setPackUsageCounts,
    isLibraryReady: bootstrapped && Object.keys(libraryMeta).length >= 0,
  }), [
    bootstrapped, libraryMeta, playableStories, packUsageCounts,
    filterOptions, refreshLibrary,
  ]);

  return (
    <AppBootstrapContext.Provider value={value}>
      {children}
    </AppBootstrapContext.Provider>
  );
}

export function useAppBootstrap() {
  const ctx = useContext(AppBootstrapContext);
  if (!ctx) throw new Error('useAppBootstrap must be used within AppBootstrapProvider');
  return ctx;
}
