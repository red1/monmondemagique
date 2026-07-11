import React, {
  createContext, useCallback, useContext, useMemo, useRef, useState,
} from 'react';
import { Alert } from 'react-native';
import {
  downloadPackage, getPackagesMeta, DownloadCancelledError,
  notifyStoriesLibraryUpdated, syncLibraryFromDisk,
} from '../src/services/storyService';
import { useSounds } from './SoundContext';
import { useLanguage } from './LanguageContext';
import { getStrings } from '../constants/Strings';
import { isTransientError } from '../src/utils/resilience';

const StoryDownloadProgressContext = createContext(null);
const StoryDownloadActionsContext = createContext(null);
const PROGRESS_THROTTLE_MS = 300;

export const useStoryDownload = () => {
  const progress = useContext(StoryDownloadProgressContext);
  const actions = useContext(StoryDownloadActionsContext);
  return { ...progress, ...actions };
};

export const useStoryDownloadProgress = () => useContext(StoryDownloadProgressContext);
export const useStoryDownloadActions = () => useContext(StoryDownloadActionsContext);

export function StoryDownloadProvider({ children }) {
  const { playSound } = useSounds();
  const { language } = useLanguage();
  const t = getStrings(language);

  const [downloadProgress, setDownloadProgress] = useState({});
  const [packSizes, setPackSizes] = useState({});
  const handlesRef = useRef({});
  const countRef = useRef(0);
  const lastProgressAtRef = useRef({});

  const setPackProgress = useCallback((packId, update) => {
    const now = Date.now();
    const progress = typeof update === 'object' && update !== null
      ? update.progress
      : update;
    const isTerminal = progress >= 1 || update?.status === 'saving';
    const lastAt = lastProgressAtRef.current[packId] || 0;
    if (!isTerminal && now - lastAt < PROGRESS_THROTTLE_MS) {
      return;
    }
    lastProgressAtRef.current[packId] = now;

    setDownloadProgress((prev) => {
      const prevEntry = prev[packId] || { progress: 0, status: 'preparing' };
      const next = typeof update === 'object' && update !== null
        ? { ...prevEntry, ...update, progress: update.progress ?? prevEntry.progress }
        : { ...prevEntry, progress: update };
      return { ...prev, [packId]: next };
    });
  }, []);

  const clearPackProgress = useCallback((packId) => {
    delete lastProgressAtRef.current[packId];
    setDownloadProgress((prev) => {
      const next = { ...prev };
      delete next[packId];
      return next;
    });
  }, []);

  const isDownloading = useCallback(
    (packId) => downloadProgress[packId] != null,
    [downloadProgress],
  );

  const startDownload = useCallback((packId) => {
    if (handlesRef.current[packId]) {
      return false;
    }

    countRef.current += 1;
    setPackProgress(packId, { progress: 0, status: 'preparing' });

    const handle = downloadPackage(packId, (update) => {
      setPackProgress(packId, update);
      if (update.totalBytes) {
        setPackSizes((prev) => ({ ...prev, [packId]: update.totalBytes }));
      }
    });
    handlesRef.current[packId] = handle;

    handle.promise
      .then((result) => {
        notifyStoriesLibraryUpdated();
        playSound('success');
        if (countRef.current === 1) {
          Alert.alert(t.success, t.storiesPackReady(result.stories.length));
        }
        return result;
      })
      .catch(async (e) => {
        await syncLibraryFromDisk();
        notifyStoriesLibraryUpdated();
        if (e instanceof DownloadCancelledError || e?.name === 'DownloadCancelledError') {
          const meta = await getPackagesMeta();
          const count = meta[packId]?.storyCount || 0;
          Alert.alert(
            t.storiesDownloadCancelled,
            count > 0 ? t.storiesPartialSaved(count) : t.storiesDownloadStoppedEmpty,
          );
          return;
        }
        const message = e.message || String(e);
        Alert.alert(t.error, message, [
          ...(isTransientError(e) ? [{
            text: 'Réessayer',
            onPress: () => startDownload(packId),
          }] : []),
          { text: 'OK', style: 'cancel' },
        ]);
      })
      .finally(() => {
        countRef.current = Math.max(0, countRef.current - 1);
        delete handlesRef.current[packId];
        clearPackProgress(packId);
      });

    return true;
  }, [clearPackProgress, playSound, setPackProgress, t]);

  const cancelDownload = useCallback((packId) => {
    handlesRef.current[packId]?.cancel();
  }, []);

  const pauseDownload = useCallback(async (packId) => {
    const handle = handlesRef.current[packId];
    if (!handle) return;
    const dl = downloadProgress[packId];
    if (dl?.status === 'paused') {
      const ok = await handle.resume();
      if (ok) setPackProgress(packId, { status: 'downloading' });
    } else if (handle.canPause()) {
      const ok = await handle.pause();
      if (ok) setPackProgress(packId, { status: 'paused' });
    }
  }, [downloadProgress, setPackProgress]);

  const activeCount = useMemo(
    () => Object.keys(downloadProgress).length,
    [downloadProgress],
  );

  const progressValue = useMemo(() => ({
    downloadProgress,
    packSizes,
    activeCount,
    isDownloading,
  }), [downloadProgress, packSizes, activeCount, isDownloading]);

  const actionsValue = useMemo(() => ({
    setPackSizes,
    startDownload,
    cancelDownload,
    pauseDownload,
  }), [startDownload, cancelDownload, pauseDownload]);

  return (
    <StoryDownloadActionsContext.Provider value={actionsValue}>
      <StoryDownloadProgressContext.Provider value={progressValue}>
        {children}
      </StoryDownloadProgressContext.Provider>
    </StoryDownloadActionsContext.Provider>
  );
}
